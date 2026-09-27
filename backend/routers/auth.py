from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import os
import secrets
import asyncio
import smtplib
from email.message import EmailMessage
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from lib.db import db
from models.auth import LoginRequest, PasswordUpdate, ProfileUpdate, SignupRequest, UserPublic, UserRecord, VerifyEmailRequest, ResendVerificationRequest
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



VERIFICATION_TTL_HOURS = 24

def _verification_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def _verification_url(token: str) -> str:
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    if not app_url:
        raise RuntimeError("APP_URL is not configured")
    return f"{app_url}/verify-email?token={quote(token)}"

def _send_verification_email(email: str, name: str, token: str) -> None:
    host = os.environ.get("SMTP_HOST", "").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    if not host or not user or not password:
        raise RuntimeError("SMTP_HOST, SMTP_USER and SMTP_PASSWORD must be configured")
    port = int(os.environ.get("SMTP_PORT", "587"))
    sender = os.environ.get("SMTP_FROM", user).strip()
    message = EmailMessage()
    message["Subject"] = "Verify your Rohly account"
    message["From"] = sender
    message["To"] = email
    message.set_content("Hi " + name + ",\n\nVerify your Rohly account:\n" + _verification_url(token) + "\n\nThis link expires in 24 hours.")
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(message)

async def _create_verification(user_id: str, email: str, name: str) -> None:
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TTL_HOURS)
    await db.email_verifications.delete_many({"user_id": user_id})
    await db.email_verifications.insert_one({"user_id": user_id, "token_hash": _verification_hash(raw), "expires_at": expires, "created_at": datetime.now(timezone.utc)})
    try:
        await asyncio.to_thread(_send_verification_email, email, name, raw)
    except Exception:
        await db.email_verifications.delete_many({"user_id": user_id})
        raise

async def ensure_owner() -> None:
    await db.users.update_many({"email_verified": {"$exists": False}}, {"$set": {"email_verified": True}})
    email = os.environ.get("OWNER_EMAIL", "").strip().lower()
    password = os.environ.get("OWNER_PASSWORD", "")
    if not email or not password:
        return
    existing = await db.users.find_one({"email": email})
    if existing:
        owner_id = existing["id"]
    else:
        owner = UserRecord(
            id=new_id(),
            email=email,
            name=os.environ.get("OWNER_NAME", "Deepanshu"),
            role="owner",
            created_at=datetime.now(timezone.utc),
            password_hash=hash_password(password),
            email_verified=True,
        )
        await db.users.insert_one(owner.model_dump())
        owner_id = owner.id
    for collection_name in ("campaigns", "csv_campaigns", "csv_sources", "inboxes", "recipients", "templates", "rohly_drafts", "activities", "history", "scheduled_emails", "oauth_tokens"):
        await db[collection_name].update_many({"user_id": {"$exists": False}}, {"$set": {"user_id": owner_id}})



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
    if not user.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email before signing in")
    return UserPublic(**user)


async def create_session(user: UserPublic, response: Response) -> UserPublic:
    raw_token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    await db.sessions.insert_one({
        "id": new_id(),
        "user_id": user.id,
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
    return user



@router.post("/signup", status_code=201)
async def signup(input: SignupRequest) -> dict:
    email = input.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = UserRecord(id=new_id(), email=email, name=input.name.strip(), role="user",
                      created_at=datetime.now(timezone.utc), password_hash=hash_password(input.password),
                      email_verified=False)
    await db.users.insert_one(user.model_dump())
    try:
        await _create_verification(user.id, user.email, user.name)
    except Exception as exc:
        await db.users.delete_one({"id": user.id})
        raise HTTPException(status_code=503, detail="We could not send the verification email. Please try again later.") from exc
    return {"verification_required": True, "email": user.email}


@router.post("/login", response_model=UserPublic)
async def login(input: LoginRequest, response: Response) -> UserPublic:
    user = await db.users.find_one({"email": input.email.strip().lower()})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if not user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Please verify your email before signing in")
    return await create_session(UserPublic(**user), response)


@router.post("/verify-email", response_model=UserPublic)
async def verify_email(input: VerifyEmailRequest, response: Response) -> UserPublic:
    row = await db.email_verifications.find_one({"token_hash": _verification_hash(input.token)})
    if not row:
        raise HTTPException(status_code=400, detail="Verification link is invalid or has expired")
    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification link is invalid or has expired")
    user = await db.users.find_one({"id": row["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_verified": True}})
    await db.email_verifications.delete_many({"user_id": user["id"]})
    user["email_verified"] = True
    return await create_session(UserPublic(**user), response)


@router.post("/resend-verification")
async def resend_verification(input: ResendVerificationRequest) -> dict:
    email = input.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or user.get("email_verified", False):
        return {"message": "If an unverified account exists, a verification email has been sent."}
    try:
        await _create_verification(user["id"], user["email"], user["name"])
    except Exception as exc:
        raise HTTPException(status_code=503, detail="We could not send the verification email. Please try again later.") from exc
    return {"message": "Verification email sent"}




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