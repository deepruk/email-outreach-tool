from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import os
import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from lib.db import db
from models.auth import LoginRequest, PasswordUpdate, ProfileUpdate, UserPublic, UserRecord
from models.scheduler import new_id

router = APIRouter(prefix="/auth", tags=["authentication"])
SESSION_COOKIE = "rohly_session"


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(derived).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_value, digest_value = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_value.encode())
        expected = base64.urlsafe_b64decode(digest_value.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


async def ensure_owner() -> None:
    email = os.environ.get("OWNER_EMAIL", "").strip().lower()
    password = os.environ.get("OWNER_PASSWORD", "")
    if not email or not password:
        return
    existing = await db.users.find_one({"email": email})
    if existing:
        return
    owner = UserRecord(
        id=new_id(),
        email=email,
        name=os.environ.get("OWNER_NAME", "Deepanshu"),
        role="owner",
        created_at=datetime.now(timezone.utc),
        password_hash=hash_password(password),
    )
    await db.users.insert_one(owner.model_dump())


async def require_user(rohly_session: str | None = Cookie(default=None)) -> UserPublic:
    if not rohly_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue")
    token_hash = hashlib.sha256(rohly_session.encode()).hexdigest()
    session = await db.sessions.find_one({"token_hash": token_hash})
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        await db.sessions.delete_one({"token_hash": token_hash})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    user = await db.users.find_one({"id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    return UserPublic(**user)


@router.post("/login", response_model=UserPublic)
async def login(input: LoginRequest, response: Response) -> UserPublic:
    user = await db.users.find_one({"email": input.email.lower()})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    raw_token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    await db.sessions.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "token_hash": hashlib.sha256(raw_token.encode()).hexdigest(),
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
    })
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        httponly=True,
        secure=os.environ.get("APP_URL", "").startswith("https://"),
        samesite="lax",
        max_age=30 * 24 * 60 * 60,
        path="/",
    )
    return UserPublic(**user)


@router.post("/logout", status_code=204)
async def logout(response: Response, rohly_session: str | None = Cookie(default=None)) -> Response:
    if rohly_session:
        await db.sessions.delete_one({"token_hash": hashlib.sha256(rohly_session.encode()).hexdigest()})
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=UserPublic)
async def me(user: UserPublic = Depends(require_user)) -> UserPublic:
    return user


@router.get("/session", response_model=UserPublic | None)
async def session(rohly_session: str | None = Cookie(default=None)) -> UserPublic | None:
    if not rohly_session:
        return None
    try:
        return await require_user(rohly_session)
    except HTTPException:
        return None


@router.patch("/profile", response_model=UserPublic)
async def update_profile(input: ProfileUpdate, user: UserPublic = Depends(require_user)) -> UserPublic:
    await db.users.update_one({"id": user.id}, {"$set": {"name": input.name}})
    return UserPublic(**{**user.model_dump(), "name": input.name})


@router.patch("/password", status_code=204)
async def update_password(input: PasswordUpdate, user: UserPublic = Depends(require_user)) -> Response:
    record = await db.users.find_one({"id": user.id})
    if not record or not verify_password(input.current_password, record["password_hash"]):
        raise HTTPException(status_code=422, detail="Current password is incorrect")
    await db.users.update_one({"id": user.id}, {"$set": {"password_hash": hash_password(input.new_password)}})
    await db.sessions.delete_many({"user_id": user.id})
    return Response(status_code=204)