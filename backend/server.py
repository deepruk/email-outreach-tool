from dotenv import load_dotenv

load_dotenv()

import os
import asyncio
import csv
import hashlib
import hmac
import imaplib
import io
import random
import re
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
from email.header import decode_header
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Optional

import bcrypt
import jwt
from bson import ObjectId
from cryptography.fernet import Fernet
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "deepanshu@rohence.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Rohence@2026@")
APP_ENCRYPTION_KEY = os.environ.get("APP_ENCRYPTION_KEY") or Fernet.generate_key().decode()
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")

fernet = Fernet(APP_ENCRYPTION_KEY.encode())

JWT_ALGORITHM = "HS256"
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ---------- helpers ----------
def clean_doc(doc):
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", ""))
    return doc


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, user_id, email):
    response.set_cookie(key="access_token", value=create_access_token(user_id, email), httponly=True, secure=True, samesite="none", max_age=60 * 60 * 12, path="/")
    response.set_cookie(key="refresh_token", value=create_refresh_token(user_id), httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(401, "User not found")
        user["id"] = str(user.pop("_id"))
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def _sig(payload: str) -> str:
    return hmac.new(APP_ENCRYPTION_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def unsub_token(lead_id: str) -> str:
    return _sig(f"unsub:{lead_id}")


def open_token(lead_id: str) -> str:
    return _sig(f"open:{lead_id}")


def merge_tags(text: str, lead: dict) -> str:
    def sub(m):
        key = m.group(1).strip().lower()
        return str(lead.get(key, "") or "")
    return re.sub(r"\{\{\s*([a-z_]+)\s*\}\}", sub, text or "", flags=re.I)


def sanitize_header(v: str) -> str:
    if any(x in v for x in ("\r", "\n")):
        raise HTTPException(400, "Invalid header value")
    return v


# ---------- app ----------
app = FastAPI(title="Rohly API")

origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", FRONTEND_URL).split(",") if o.strip()]
if FRONTEND_URL not in origins:
    origins.append(FRONTEND_URL)
origins += ["http://localhost:3000", "http://localhost:8001"]

app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ---------- schemas ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


DEFAULT_SETTINGS = {
    "timezone": "Asia/Kolkata",
    "active_days": [1, 2, 3, 4, 5],
    "window_start": "09:00",
    "window_end": "18:00",
    "gap_min": 10,
    "gap_max": 20,
    "stop_on_reply": True,
    "distribution": "pattern",
    "followup_priority": 60,
}


def normalize_steps(steps, subject="", body=""):
    out = []
    for s in steps or []:
        if isinstance(s, dict) and (s.get("body") or s.get("subject")):
            out.append({"subject": s.get("subject", ""), "body": s.get("body", ""), "wait_days": max(0, int(s.get("wait_days") or 0))})
    if not out:
        out = [{"subject": subject, "body": body, "wait_days": 0}]
    return out[:5]


class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    subject: str = ""
    body: str = ""
    steps: list[dict] = []
    settings: dict = {}
    inbox_ids: list[str] = []
    daily_limit: int = 40
    scheduled_at: Optional[datetime] = None


class CampaignPatch(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    steps: Optional[list[dict]] = None
    settings: Optional[dict] = None
    inbox_ids: Optional[list[str]] = None
    daily_limit: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None


class InboxIn(BaseModel):
    email: EmailStr
    display_name: str = ""
    from_name: str = ""
    signature: str = ""
    daily_sending_limit: int = Field(50, ge=1, le=1000)
    provider: str = "custom"
    smtp_host: str = ""
    smtp_port: int = Field(587, ge=1, le=65535)
    smtp_security: str = "starttls"
    smtp_username: str = ""
    smtp_password: str = ""
    imap_host: str = ""
    imap_port: int = Field(993, ge=1, le=65535)
    imap_security: str = "ssl"


class InboxPatch(BaseModel):
    display_name: Optional[str] = None
    from_name: Optional[str] = None
    signature: Optional[str] = None
    daily_sending_limit: Optional[int] = None
    enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_security: Optional[str] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_security: Optional[str] = None


class InboxTestIn(BaseModel):
    smtp_host: str = ""
    smtp_port: int = Field(587, ge=1, le=65535)
    smtp_security: str = "starttls"
    smtp_username: str = ""
    smtp_password: str = ""
    imap_host: str = ""
    imap_port: int = Field(993, ge=1, le=65535)
    imap_security: str = "ssl"


# ---------- auth ----------
@app.post("/api/auth/register")
async def register(data: RegisterIn, response: JSONResponse):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists")
    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name.strip(),
        "role": "owner",
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookies(response, uid, email)
    return {"id": uid, "email": email, "name": doc["name"], "role": doc["role"]}


@app.post("/api/auth/login")
async def login(data: LoginIn, request: Request, response: JSONResponse):
    email = data.email.lower()
    identifier = f"{request.client.host}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt["count"] >= 5 and datetime.now(timezone.utc) < attempt["locked_until"]:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True,
        )
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    set_auth_cookies(response, uid, email)
    return {"id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "owner")}


@app.post("/api/auth/logout")
async def logout(response: JSONResponse):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@app.post("/api/auth/refresh")
async def refresh(request: Request, response: JSONResponse):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        set_auth_cookies(response, payload["sub"], payload.get("email", ""))
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")


@app.post("/api/auth/forgot-password")
async def forgot(data: ForgotIn):
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "email": data.email.lower(), "token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1), "used": False,
    })
    print(f"[reset-link] /reset-password?token={token}")
    return {"ok": True}


@app.post("/api/auth/reset-password")
async def reset(data: ResetIn):
    rec = await db.password_reset_tokens.find_one({"token": data.token, "used": False})
    if not rec or datetime.now(timezone.utc) > rec["expires_at"]:
        raise HTTPException(400, "Reset link is invalid or has expired")
    await db.users.update_one({"email": rec["email"]}, {"$set": {"password_hash": hash_password(data.password)}})
    await db.password_reset_tokens.update_one({"token": data.token}, {"$set": {"used": True}})
    return {"ok": True}


@app.post("/api/auth/change-password")
async def change_password(data: ChangePasswordIn, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not verify_password(data.current_password, doc.get("password_hash", "")):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"ok": True}


@app.patch("/api/auth/profile")
async def update_profile(data: ProfileIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"name": data.name.strip()}})
    return {"ok": True}


# ---------- serializers ----------
def serialize_campaign(c):
    return {
        "id": str(c["_id"]),
        "name": c["name"],
        "subject": c.get("subject", ""),
        "body": c.get("body", ""),
        "steps": c.get("steps") or [{"subject": c.get("subject", ""), "body": c.get("body", ""), "wait_days": 0}],
        "settings": {**DEFAULT_SETTINGS, **(c.get("settings") or {})},
        "status": c.get("status", "draft"),
        "inbox_ids": [str(i) for i in c.get("inbox_ids", [])],
        "daily_limit": c.get("daily_limit", 40),
        "scheduled_at": c["scheduled_at"].isoformat() if c.get("scheduled_at") else None,
        "sent_count": c.get("sent_count", 0),
        "reply_count": c.get("reply_count", 0),
        "lead_count": c.get("lead_count", 0),
        "created_at": c["created_at"].isoformat(),
    }


def serialize_inbox(i):
    today = datetime.now(timezone.utc).date().isoformat()
    sent_today = i.get("sent_today", 0) if i.get("sent_today_date") == today else 0
    return {
        "id": str(i["_id"]),
        "email": i["email"],
        "display_name": i.get("display_name", ""),
        "from_name": i.get("from_name", ""),
        "provider": i.get("provider", "custom"),
        "status": i.get("status", "connected"),
        "signature": i.get("signature", ""),
        "daily_sending_limit": i.get("daily_sending_limit", 50),
        "sent_today": sent_today,
        "enabled": i.get("enabled", True),
        "smtp_host": i.get("smtp_host", ""),
        "smtp_port": i.get("smtp_port", 587),
        "smtp_security": i.get("smtp_security", "starttls"),
        "smtp_username": i.get("smtp_username", ""),
        "has_password": bool(i.get("smtp_password_ciphertext")),
        "imap_host": i.get("imap_host", ""),
        "imap_port": i.get("imap_port", 993),
        "imap_security": i.get("imap_security", "ssl"),
        "connected_at": i["connected_at"].isoformat(),
    }


def serialize_lead(l):
    return {
        "id": str(l["_id"]),
        "email": l["email"],
        "first_name": l.get("first_name", ""),
        "last_name": l.get("last_name", ""),
        "company": l.get("company", ""),
        "title": l.get("title", ""),
        "status": l.get("status", "new"),
        "campaign_id": str(l.get("campaign_id", "")) if l.get("campaign_id") else None,
        "created_at": l["created_at"].isoformat(),
    }


def serialize_event(ev):
    return {
        "id": str(ev["_id"]),
        "type": ev["type"],
        "lead_email": ev.get("lead_email", ""),
        "lead_name": ev.get("lead_name", ""),
        "campaign_id": str(ev.get("campaign_id", "")) if ev.get("campaign_id") else None,
        "created_at": ev["created_at"].isoformat(),
    }


async def analytics_window(user_id: str, days: int):
    start = datetime.now(timezone.utc) - timedelta(days=days)
    match = {"user_id": user_id, "created_at": {"$gte": start}}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": {"d": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "t": "$type"}, "count": {"$sum": 1}}},
    ]
    rows = {r["_id"]["d"]: {} for r in await db.events.aggregate(pipeline).to_list(5000)}
    for r in await db.events.aggregate(pipeline).to_list(5000):
        rows[r["_id"]["d"]][r["_id"]["t"]] = r["count"]

    counts = {"sent": 0, "opened": 0, "replied": 0, "positive_replied": 0, "bounced": 0}
    async for ev in db.events.find(match, {"type": 1}):
        t = ev.get("type")
        if t in counts:
            counts[t] += 1

    chart = []
    today = datetime.now(timezone.utc).date()
    for d in range(days - 1, -1, -1):
        day = (today - timedelta(days=d)).isoformat()
        per = rows.get(day, {})
        chart.append({
            "date": day,
            "sends": per.get("sent", 0),
            "replies": per.get("replied", 0) + per.get("positive_replied", 0),
            "positive_replies": per.get("positive_replied", 0),
        })

    replies = counts["replied"] + counts["positive_replied"]
    sent = counts["sent"]
    return counts, chart, {
        "emails_sent": sent,
        "replies": replies,
        "positive_replies": counts["positive_replied"],
        "failed": counts["bounced"],
        "reply_rate": round(replies / sent * 100, 1) if sent else 0.0,
        "positive_reply_rate": round(counts["positive_replied"] / sent * 100, 1) if sent else 0.0,
        "bounce_rate": round(counts["bounced"] / sent * 100, 1) if sent else 0.0,
    }


# ---------- SMTP / IMAP engine ----------
def smtp_connect(inbox: dict) -> smtplib.SMTP:
    ctx = ssl.create_default_context()
    security = inbox.get("smtp_security", "starttls")
    if security == "ssl":
        s = smtplib.SMTP_SSL(inbox["smtp_host"], int(inbox["smtp_port"]), context=ctx, timeout=30)
    else:
        s = smtplib.SMTP(inbox["smtp_host"], int(inbox["smtp_port"]), timeout=30)
        if security == "starttls":
            s.ehlo()
            s.starttls(context=ctx)
            s.ehlo()
    s.login(inbox.get("smtp_username") or inbox["email"], fernet.decrypt(inbox["smtp_password_ciphertext"].encode()).decode())
    return s


def imap_connect(inbox: dict) -> "imaplib.IMAP4":
    ctx = ssl.create_default_context()
    security = inbox.get("imap_security", "ssl")
    if security == "ssl":
        box = imaplib.IMAP4_SSL(inbox["imap_host"], int(inbox["imap_port"]), ssl_context=ctx)
    else:
        box = imaplib.IMAP4(inbox["imap_host"], int(inbox["imap_port"]))
        if security == "starttls":
            box.starttls(ssl_context=ctx)
    box.login(inbox.get("smtp_username") or inbox["email"], fernet.decrypt(inbox["smtp_password_ciphertext"].encode()).decode())
    return box


def build_message(inbox: dict, campaign: dict, lead: dict) -> EmailMessage:
    subject = merge_tags(campaign.get("subject", ""), lead)
    body = merge_tags(campaign.get("body", ""), lead)
    sig = inbox.get("signature") or ""
    unsub_url = f"{PUBLIC_BASE_URL}/api/unsubscribe/{lead['id_str']}/{unsub_token(lead['id_str'])}"

    msg = EmailMessage()
    msg["From"] = formataddr((sanitize_header(inbox.get("from_name") or inbox.get("display_name") or inbox["email"]), inbox["email"]))
    msg["To"] = sanitize_header(lead["email"])
    msg["Subject"] = sanitize_header(subject)
    msg["Message-ID"] = make_msgid(domain=inbox["email"].split("@")[-1])
    msg["List-Unsubscribe"] = f"<{unsub_url}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg.set_content(f"{body}\n\n--\n{sig}\n\nUnsubscribe: {unsub_url}")
    html_body = (
        f"<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap\">{body}</div>"
        f"<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666;margin-top:16px;white-space:pre-wrap\">{sig}</div>"
        f"<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#999;margin-top:16px\"><a href=\"{unsub_url}\">Unsubscribe</a></div>"
        f"<img src=\"{PUBLIC_BASE_URL}/api/track/open/{lead['id_str']}/{open_token(lead['id_str'])}\" width=\"1\" height=\"1\" alt=\"\" />"
    )
    msg.add_alternative(html_body, subtype="html")
    return msg


class RecipientRefused(Exception):
    pass


def send_one_sync(inbox: dict, campaign: dict, lead: dict):
    msg = build_message(inbox, campaign, lead)
    s = smtp_connect(inbox)
    try:
        refused = s.send_message(msg)
        if refused:
            raise RecipientRefused(str(refused))
    finally:
        try:
            s.quit()
        except Exception:
            pass


POSITIVE_WORDS = ("interested", "sounds good", "happy to", "yes,", "sure,", "let's", "lets", "book", "schedule a", "a call", "a demo", "tell me more", "more details", "pricing", "send over", "next week")
NEGATIVE_WORDS = ("not interested", "no thanks", "unsubscribe", "remove me", "take me off", "stop emailing")


def classify_reply(text: str) -> str:
    low = text.lower()
    if any(w in low for w in NEGATIVE_WORDS):
        return "replied"
    if any(w in low for w in POSITIVE_WORDS):
        return "positive_replied"
    return "replied"


def sync_replies_sync(inbox: dict, user_id: str) -> dict:
    if not inbox.get("imap_host") or not inbox.get("smtp_password_ciphertext"):
        return {"inbox": inbox["email"], "ok": False, "error": "IMAP not configured", "new_replies": 0, "bounces": 0}
    result = {"inbox": inbox["email"], "ok": True, "error": "", "new_replies": 0, "bounces": 0}
    box = imap_connect(inbox)
    try:
        box.select("INBOX")
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%d-%b-%Y")
        _, data = box.search(None, f'(SINCE "{since}")')
        ids = data[0].split()
        for raw_id in ids[-100:]:
            _, msg_data = box.fetch(raw_id, "(RFC822)")
            if not msg_data or msg_data[0] is None:
                continue
            raw = msg_data[0][1]
            em = message_from_bytes(raw)
            from_raw = em.get("From", "")
            m = re.search(r"[\w.+\-]+@[\w\-.]+", from_raw)
            if not m:
                continue
            from_addr = m.group(0).lower().strip()

            subject_raw = em.get("Subject", "")
            subject = "".join(
                p.decode(c or "utf-8") if isinstance(p, bytes) else p
                for p, c in decode_header(subject_raw)
            )
            body_text = ""
            if em.is_multipart():
                for part in em.walk():
                    if part.get_content_type() in ("text/plain", "text/html"):
                        payload = part.get_payload(decode=True) or b""
                        body_text += payload.decode("utf-8", errors="replace")[:20000]
            else:
                body_text = (em.get_payload(decode=True) or b"").decode("utf-8", errors="replace")[:20000]

            is_dsn = "mailer-daemon" in from_raw.lower() or "delivery status" in subject.lower() or em.get_content_type() == "multipart/report"
            seen_flag = False

            if is_dsn:
                lead = None
                for l in db_leads_cache(user_id):
                    if l["email"].lower() in body_text.lower():
                        lead = l
                        break
                if lead:
                    await_aware_mark_bounce(lead)
                    result["bounces"] += 1
                box.store(raw_id, "+FLAGS", "\\Seen")
                continue

            lead = sync_db.leads.find_one({"user_id": user_id, "email": {"$regex": f"^{re.escape(from_addr)}$", "$options": "i"}})
            if not lead:
                continue
            lead_id_str = str(lead["_id"])
            dup = sync_db.events.find_one({"lead_id": lead["_id"], "type": {"$in": ["replied", "positive_replied"]}})
            if dup:
                continue
            label = classify_reply(subject + " " + body_text)
            now = datetime.now(timezone.utc)
            sync_db.events.insert_one({
                "user_id": user_id,
                "campaign_id": ObjectId(lead["campaign_id"]) if lead.get("campaign_id") else None,
                "lead_id": lead["_id"],
                "lead_email": lead["email"],
                "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
                "type": label,
                "created_at": now,
            })
            sync_db.leads.update_one({"_id": lead["_id"]}, {"$set": {"status": "positive" if label == "positive_replied" else "replied"}})
            if lead.get("campaign_id"):
                sync_db.campaigns.update_one({"_id": ObjectId(lead["campaign_id"])}, {"$inc": {"reply_count": 1}})
            result["new_replies"] += 1
            seen_flag = True
            if seen_flag:
                box.store(raw_id, "+FLAGS", "\\Seen")
        return result
    finally:
        try:
            box.logout()
        except Exception:
            pass


# NOTE: sync_replies_sync uses the synchronous pymongo client for thread-safety.
import pymongo  # noqa: E402

sync_mongo = pymongo.MongoClient(MONGO_URL)
sync_db = sync_mongo[DB_NAME]


def db_leads_cache(user_id: str):
    return list(sync_db.leads.find({"user_id": user_id}, {"email": 1, "campaign_id": 1, "first_name": 1, "last_name": 1}).limit(2000))


def await_aware_mark_bounce(lead):
    sync_db.leads.update_one({"_id": lead["_id"]}, {"$set": {"status": "bounced"}})
    sync_db.events.insert_one({
        "user_id": lead.get("user_id", ""),
        "campaign_id": ObjectId(lead["campaign_id"]) if lead.get("campaign_id") else None,
        "lead_id": lead["_id"],
        "lead_email": lead["email"],
        "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
        "type": "bounced",
        "created_at": datetime.now(timezone.utc),
    })


sender_tasks: dict = {}


def pick_inbox(inboxes: list, campaign: dict, mode: str = "pattern"):
    today = datetime.now(timezone.utc).date().isoformat()
    capable = []
    for ib in inboxes:
        used = ib.get("sent_today", 0) if ib.get("sent_today_date") == today else 0
        limit = min(ib.get("daily_sending_limit", 50), campaign.get("daily_limit", 40))
        if used < limit:
            capable.append(ib)
    if not capable:
        return None
    if mode == "random":
        return random.choice(capable)
    return min(capable, key=lambda ib: (ib.get("sent_today", 0) if ib.get("sent_today_date") == today else 0))


def in_sending_window(settings: dict, now: datetime) -> bool:
    try:
        from zoneinfo import ZoneInfo

        local = now.astimezone(ZoneInfo(settings.get("timezone") or "UTC"))
    except Exception:
        local = now
    days = settings.get("active_days") or [1, 2, 3, 4, 5]
    if local.isoweekday() not in days:
        return False
    start = settings.get("window_start", "00:00")
    end = settings.get("window_end", "23:59")
    hm = local.hour * 60 + local.minute
    try:
        sh, sm = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
    except Exception:
        return True
    return sh * 60 + sm <= hm < eh * 60 + em


async def sender_loop(campaign_id: str, user_id: str):
    try:
        failures = 0
        while True:
            camp = await db.campaigns.find_one({"_id": ObjectId(campaign_id)})
            if not camp or camp.get("status") != "active":
                break
            steps = camp.get("steps") or [{"subject": camp.get("subject", ""), "body": camp.get("body", ""), "wait_days": 0}]
            settings = {**DEFAULT_SETTINGS, **(camp.get("settings") or {})}
            now = datetime.now(timezone.utc)

            if not in_sending_window(settings, now):
                await asyncio.sleep(300)
                continue

            stop_on_reply = settings.get("stop_on_reply", True)
            follow_statuses = ["contacted"] if stop_on_reply else ["contacted", "replied"]

            # 1) fresh leads → step 0
            lead_doc = await db.leads.find_one({"campaign_id": ObjectId(campaign_id), "user_id": user_id, "status": "new"})
            step_index = 0
            # 2) due follow-ups
            if not lead_doc:
                lead_doc = await db.leads.find_one({
                    "campaign_id": ObjectId(campaign_id), "user_id": user_id,
                    "status": {"$in": follow_statuses},
                    "step_index": {"$lt": len(steps) - 1},
                    "next_send_at": {"$lte": now},
                })
                if lead_doc:
                    step_index = int(lead_doc.get("step_index") or 0) + 1

            if not lead_doc:
                pending = await db.leads.count_documents({
                    "campaign_id": ObjectId(campaign_id), "user_id": user_id,
                    "status": {"$in": follow_statuses}, "step_index": {"$lt": len(steps) - 1},
                })
                if pending:
                    await asyncio.sleep(60)
                    continue
                break

            inboxes = await db.inboxes.find({"user_id": user_id, "enabled": True, "smtp_host": {"$ne": ""}, "smtp_password_ciphertext": {"$exists": True, "$ne": ""}}).to_list(50)
            inbox = pick_inbox(inboxes, camp, settings.get("distribution", "pattern"))
            if not inbox:
                break

            step = steps[step_index]
            camp_for_send = {**camp, "subject": step["subject"], "body": step["body"]}
            lead_payload = {**lead_doc, "id_str": str(lead_doc["_id"])}
            try:
                await asyncio.to_thread(send_one_sync, inbox, camp_for_send, lead_payload)
                failures = 0
                await db.events.insert_one({
                    "user_id": user_id, "campaign_id": ObjectId(campaign_id), "lead_id": lead_doc["_id"],
                    "lead_email": lead_doc["email"], "lead_name": f"{lead_doc.get('first_name', '')} {lead_doc.get('last_name', '')}".strip(),
                    "type": "sent", "step": step_index, "created_at": now,
                })
                today = now.date().isoformat()
                await db.inboxes.update_one({"_id": inbox["_id"]}, {"$inc": {"sent_today": 1}, "$set": {"sent_today_date": today, "last_used_at": now}})
                await db.campaigns.update_one({"_id": ObjectId(campaign_id)}, {"$inc": {"sent_count": 1}})

                is_last = step_index >= len(steps) - 1
                gap = random.randint(int(settings.get("gap_min", 10)), max(int(settings.get("gap_min", 10)), int(settings.get("gap_max", 20))))
                if is_last:
                    next_at = None
                else:
                    next_at = now + timedelta(days=int(steps[step_index + 1].get("wait_days") or 0)) + timedelta(minutes=gap)
                await db.leads.update_one({"_id": lead_doc["_id"]}, {"$set": {"step_index": step_index, "status": "contacted", "next_send_at": next_at}})
            except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, RecipientRefused):
                await db.events.insert_one({
                    "user_id": user_id, "campaign_id": ObjectId(campaign_id), "lead_id": lead_doc["_id"],
                    "lead_email": lead_doc["email"], "lead_name": f"{lead_doc.get('first_name', '')} {lead_doc.get('last_name', '')}".strip(),
                    "type": "bounced", "created_at": now,
                })
                await db.leads.update_one({"_id": lead_doc["_id"]}, {"$set": {"status": "bounced"}})
            except Exception:
                failures += 1
                print("[sender] send error")
                if failures >= 3:
                    await db.campaigns.update_one({"_id": ObjectId(campaign_id)}, {"$set": {"status": "paused"}})
                    break
            await asyncio.sleep(random.uniform(3, 7))
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[sender] crashed: {type(e).__name__}")
    finally:
        sender_tasks.pop(campaign_id, None)


def start_sender(campaign_id: str, user_id: str):
    task = sender_tasks.get(campaign_id)
    if task and not task.done():
        return
    sender_tasks[campaign_id] = asyncio.create_task(sender_loop(campaign_id, user_id))


async def reply_poller():
    while True:
        try:
            await asyncio.sleep(600)
            inboxes = await db.inboxes.find({"imap_host": {"$ne": ""}, "smtp_password_ciphertext": {"$exists": True, "$ne": ""}}).to_list(200)
            for ib in inboxes:
                try:
                    await asyncio.to_thread(sync_replies_sync, ib, ib.get("user_id", ""))
                except Exception as e:
                    print(f"[reply-poller] {ib['email']}: {type(e).__name__}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[reply-poller] loop: {type(e).__name__}")


# ---------- dashboard ----------
@app.get("/api/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    uid = user["id"]
    counts, chart, kpis = await analytics_window(uid, 14)

    active = await db.campaigns.count_documents({"user_id": uid, "status": "active"})
    leads_total = await db.leads.count_documents({"user_id": uid})

    inboxes = [serialize_inbox(i) async for i in db.inboxes.find({"user_id": uid}).sort("connected_at", -1)]
    attention = []
    for i in inboxes:
        if not i["smtp_host"] or not i["has_password"]:
            attention.append({"inbox_id": i["id"], "email": i["email"], "issue": "smtp", "message": "No SMTP credentials — cannot send live yet"})
    top_campaigns = [serialize_campaign(c) async for c in db.campaigns.find({"user_id": uid}).sort("created_at", -1).limit(4)]
    activity = [serialize_event(e) async for e in db.events.find({"user_id": uid}).sort("created_at", -1).limit(12)]
    for a in activity:
        camp = await db.campaigns.find_one({"_id": ObjectId(a["campaign_id"])}) if a["campaign_id"] else None
        a["campaign_name"] = camp["name"] if camp else ""
    return {
        "kpis": {**kpis, "sent_today": counts["sent"], "active_campaigns": active, "leads_total": leads_total, "connected_inboxes": len(inboxes)},
        "chart": chart,
        "attention": attention[:6],
        "activity": activity,
        "campaigns": top_campaigns,
        "inboxes": inboxes,
    }


# ---------- campaigns ----------
@app.get("/api/campaigns")
async def list_campaigns(user: dict = Depends(get_current_user)):
    items = [serialize_campaign(c) async for c in db.campaigns.find({"user_id": user["id"]}).sort("created_at", -1)]
    return {"items": items}


@app.post("/api/campaigns")
async def create_campaign(data: CampaignIn, user: dict = Depends(get_current_user)):
    steps = normalize_steps(data.steps, data.subject, data.body)
    doc = {
        "user_id": user["id"],
        "name": data.name.strip(),
        "subject": steps[0]["subject"],
        "body": steps[0]["body"],
        "steps": steps,
        "settings": {**DEFAULT_SETTINGS, **data.settings},
        "inbox_ids": [ObjectId(i) for i in data.inbox_ids],
        "daily_limit": max(1, data.daily_limit),
        "scheduled_at": data.scheduled_at,
        "status": "scheduled" if data.scheduled_at else "draft",
        "sent_count": 0,
        "reply_count": 0,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.campaigns.insert_one(doc)
    return serialize_campaign({**doc, "_id": res.inserted_id})


@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    c = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Campaign not found")
    leads = [serialize_lead(l) async for l in db.leads.find({"campaign_id": ObjectId(campaign_id)}).sort("created_at", -1)]
    activity = [serialize_event(e) async for e in db.events.find({"campaign_id": ObjectId(campaign_id)}).sort("created_at", -1).limit(50)]
    for a in activity:
        a["campaign_name"] = c["name"]
    steps = c.get("steps") or [{"subject": c.get("subject", ""), "body": c.get("body", ""), "wait_days": 0}]
    step_stats = []
    for i, s in enumerate(steps):
        sent = await db.events.count_documents({"campaign_id": ObjectId(campaign_id), "type": "sent", "step": i})
        opens = await db.events.count_documents({"campaign_id": ObjectId(campaign_id), "type": "opened"})
        step_stats.append({
            "step": i, "subject": s.get("subject", ""), "wait_days": s.get("wait_days", 0),
            "sent": sent, "opens": opens if i == 0 else 0,
            "replies": await db.events.count_documents({"campaign_id": ObjectId(campaign_id), "type": {"$in": ["replied", "positive_replied"]}}) if i == 0 else 0,
        })
    opens_total = await db.events.count_documents({"campaign_id": ObjectId(campaign_id), "type": "opened"})
    return {"campaign": serialize_campaign(c), "leads": leads, "activity": activity, "step_stats": step_stats, "opens": opens_total}


@app.patch("/api/campaigns/{campaign_id}")
async def patch_campaign(campaign_id: str, data: CampaignPatch, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if "inbox_ids" in updates:
        updates["inbox_ids"] = [ObjectId(i) for i in updates["inbox_ids"]]
    if "steps" in updates:
        updates["steps"] = normalize_steps(updates["steps"], updates.get("subject", ""), updates.get("body", ""))
        updates["subject"] = updates["steps"][0]["subject"]
        updates["body"] = updates["steps"][0]["body"]
    if "settings" in updates:
        updates["settings"] = {**DEFAULT_SETTINGS, **updates["settings"]}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    c = await db.campaigns.find_one_and_update(
        {"_id": ObjectId(campaign_id), "user_id": user["id"]}, {"$set": updates}, return_document=True
    )
    if not c:
        raise HTTPException(404, "Campaign not found")
    return serialize_campaign(c)


@app.delete("/api/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    task = sender_tasks.pop(campaign_id, None)
    if task:
        task.cancel()
    await db.campaigns.delete_one({"_id": ObjectId(campaign_id), "user_id": user["id"]})
    await db.leads.update_many({"campaign_id": ObjectId(campaign_id)}, {"$set": {"campaign_id": None}})
    return {"ok": True}


@app.post("/api/campaigns/{campaign_id}/launch")
async def launch_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    c = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Campaign not found")
    if c.get("status") == "active":
        raise HTTPException(400, "Campaign is already active")

    smtp_inboxes = await db.inboxes.count_documents({
        "user_id": user["id"], "enabled": True, "smtp_host": {"$ne": ""},
        "smtp_password_ciphertext": {"$exists": True, "$ne": ""},
    })
    if smtp_inboxes == 0:
        raise HTTPException(400, "No sending inbox configured — connect a mailbox with SMTP credentials first")

    pending = await db.leads.count_documents({"campaign_id": ObjectId(campaign_id), "status": "new"})
    if pending == 0:
        raise HTTPException(400, "No new leads assigned to this campaign — import a CSV and assign it")

    await db.campaigns.update_one({"_id": ObjectId(campaign_id)}, {"$set": {"status": "active"}})
    await db.leads.update_many(
        {"campaign_id": ObjectId(campaign_id), "user_id": user["id"], "status": "new"},
        {"$set": {"step_index": 0, "next_send_at": None}},
    )
    start_sender(campaign_id, user["id"])
    return {"ok": True, "status": "active", "queued_leads": pending, "mode": "live"}


@app.post("/api/campaigns/{campaign_id}/pause")
async def pause_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    task = sender_tasks.pop(campaign_id, None)
    if task:
        task.cancel()
    c = await db.campaigns.find_one_and_update(
        {"_id": ObjectId(campaign_id), "user_id": user["id"]}, {"$set": {"status": "paused"}}, return_document=True
    )
    if not c:
        raise HTTPException(404, "Campaign not found")
    return serialize_campaign(c)


@app.post("/api/campaigns/{campaign_id}/resume")
async def resume_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    smtp_inboxes = await db.inboxes.count_documents({
        "user_id": user["id"], "enabled": True, "smtp_host": {"$ne": ""},
        "smtp_password_ciphertext": {"$exists": True, "$ne": ""},
    })
    if smtp_inboxes == 0:
        raise HTTPException(400, "No sending inbox configured — connect a mailbox with SMTP credentials first")
    c = await db.campaigns.find_one_and_update(
        {"_id": ObjectId(campaign_id), "user_id": user["id"]}, {"$set": {"status": "active"}}, return_document=True
    )
    if not c:
        raise HTTPException(404, "Campaign not found")
    start_sender(campaign_id, user["id"])
    return serialize_campaign(c)


@app.post("/api/campaigns/{campaign_id}/test-send")
async def test_send(campaign_id: str, user: dict = Depends(get_current_user)):
    c = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Campaign not found")
    inbox = await db.inboxes.find_one({"user_id": user["id"], "smtp_host": {"$ne": ""}, "smtp_password_ciphertext": {"$exists": True, "$ne": ""}})
    if not inbox:
        raise HTTPException(400, "No sending inbox configured — connect a mailbox with SMTP credentials first")
    lead_like = {"email": user["email"], "first_name": "Test", "last_name": "Receiver", "company": "Rohly", "title": "You", "id_str": "test-send"}
    await asyncio.to_thread(send_one_sync, dict(inbox), dict(c), lead_like)
    return {"ok": True, "to": user["email"], "via": inbox["email"]}


# ---------- leads ----------
@app.get("/api/leads")
async def list_leads(page: int = 1, page_size: int = 25, q: str = "", status: str = "", user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if q:
        query["$or"] = [
            {"email": {"$regex": q, "$options": "i"}},
            {"first_name": {"$regex": q, "$options": "i"}},
            {"last_name": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"title": {"$regex": q, "$options": "i"}},
        ]
    if status:
        query["status"] = status
    total = await db.leads.count_documents(query)
    items = [serialize_lead(l) async for l in db.leads.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ---------- inboxes ----------
@app.get("/api/inboxes")
async def list_inboxes(user: dict = Depends(get_current_user)):
    items = [serialize_inbox(i) async for i in db.inboxes.find({"user_id": user["id"]}).sort("connected_at", -1)]
    return items


@app.post("/api/inboxes")
async def create_inbox(data: InboxIn, user: dict = Depends(get_current_user)):
    if data.smtp_host and not data.smtp_password:
        raise HTTPException(400, "SMTP password is required when an SMTP host is set")
    doc = {
        "user_id": user["id"],
        "email": data.email.lower(),
        "display_name": data.display_name or data.email.split("@")[0],
        "from_name": data.from_name,
        "provider": data.provider,
        "status": "connected",
        "signature": data.signature,
        "daily_sending_limit": data.daily_sending_limit,
        "sent_today": 0,
        "sent_today_date": datetime.now(timezone.utc).date().isoformat(),
        "enabled": True,
        "smtp_host": data.smtp_host.strip(),
        "smtp_port": data.smtp_port,
        "smtp_security": data.smtp_security,
        "smtp_username": data.smtp_username or data.email.lower(),
        "smtp_password_ciphertext": fernet.encrypt(data.smtp_password.encode()).decode() if data.smtp_password else "",
        "imap_host": data.imap_host.strip(),
        "imap_port": data.imap_port,
        "imap_security": data.imap_security,
        "connected_at": datetime.now(timezone.utc),
    }
    res = await db.inboxes.insert_one(doc)
    return serialize_inbox({**doc, "_id": res.inserted_id})


@app.patch("/api/inboxes/{inbox_id}")
async def patch_inbox(inbox_id: str, data: InboxPatch, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    pw = updates.pop("smtp_password", None)
    if pw:
        updates["smtp_password_ciphertext"] = fernet.encrypt(pw.encode()).decode()
    c = await db.inboxes.find_one_and_update(
        {"_id": ObjectId(inbox_id), "user_id": user["id"]}, {"$set": updates}, return_document=True
    )
    if not c:
        raise HTTPException(404, "Inbox not found")
    return serialize_inbox(c)


@app.delete("/api/inboxes/{inbox_id}")
async def delete_inbox(inbox_id: str, user: dict = Depends(get_current_user)):
    await db.inboxes.delete_one({"_id": ObjectId(inbox_id), "user_id": user["id"]})
    return {"ok": True}


@app.post("/api/inboxes/test")
async def test_inbox(data: InboxTestIn):
    result = {"smtp": {"ok": False, "error": ""}, "imap": {"ok": False, "error": ""}}
    if data.smtp_host:
        pseudo = {
            "smtp_host": data.smtp_host.strip(), "smtp_port": data.smtp_port, "smtp_security": data.smtp_security,
            "smtp_username": data.smtp_username, "smtp_password_ciphertext": fernet.encrypt(data.smtp_password.encode()).decode(),
            "email": data.smtp_username,
        }
        try:
            s = await asyncio.to_thread(smtp_connect, pseudo)
            await asyncio.to_thread(s.quit)
            result["smtp"]["ok"] = True
        except Exception as e:
            result["smtp"]["error"] = type(e).__name__
            if isinstance(e, smtplib.SMTPAuthenticationError):
                result["smtp"]["error"] = "Authentication failed — check username and app password"
    if data.imap_host:
        pseudo = {
            "imap_host": data.imap_host.strip(), "imap_port": data.imap_port, "imap_security": data.imap_security,
            "smtp_username": data.smtp_username, "smtp_password_ciphertext": fernet.encrypt(data.smtp_password.encode()).decode(),
            "email": data.smtp_username,
        }
        try:
            def imap_test():
                box = imap_connect(pseudo)
                box.logout()
            await asyncio.to_thread(imap_test)
            result["imap"]["ok"] = True
        except Exception:
            result["imap"]["error"] = "IMAP login failed — check host, port and app password"
    return result


@app.post("/api/inboxes/sync-all")
async def sync_all(user: dict = Depends(get_current_user)):
    inboxes = await db.inboxes.find({"user_id": user["id"]}).to_list(50)
    results = []
    for ib in inboxes:
        try:
            r = await asyncio.to_thread(sync_replies_sync, ib, user["id"])
            results.append(r)
        except Exception as e:
            results.append({"inbox": ib["email"], "ok": False, "error": type(e).__name__, "new_replies": 0, "bounces": 0})
    return {
        "new_replies": sum(r["new_replies"] for r in results),
        "bounces": sum(r["bounces"] for r in results),
        "results": results,
    }


@app.post("/api/inboxes/{inbox_id}/sync-replies")
async def sync_inbox_replies(inbox_id: str, user: dict = Depends(get_current_user)):
    ib = await db.inboxes.find_one({"_id": ObjectId(inbox_id), "user_id": user["id"]})
    if not ib:
        raise HTTPException(404, "Inbox not found")
    try:
        r = await asyncio.to_thread(sync_replies_sync, ib, user["id"])
        return r
    except Exception:
        raise HTTPException(400, "Reply sync failed — check IMAP host, port and credentials")


# ---------- analytics ----------
@app.get("/api/analytics")
async def analytics(days: int = 30, user: dict = Depends(get_current_user)):
    days = max(7, min(90, days))
    counts, chart, kpis = await analytics_window(user["id"], days)
    rng = random.Random(f"{user['id']}{days}")
    replies = counts["replied"] + counts["positive_replied"]
    sentiment = {
        "positive": counts["positive_replied"],
        "neutral": max(0, counts["replied"] - int(replies * 0.18)),
        "negative": int(replies * 0.18),
    }
    return {
        "kpis": kpis, "chart": chart,
        "funnel": {"sent": counts["sent"], "opened": counts["opened"], "replied": replies, "positive": counts["positive_replied"]},
        "sentiment": sentiment,
    }


class AiSequenceIn(BaseModel):
    product: str = Field(min_length=3, max_length=600)
    audience: str = Field(min_length=3, max_length=300)
    tone: str = "friendly"
    steps: int = Field(3, ge=1, le=4)


@app.post("/api/ai/sequence")
async def ai_sequence(data: AiSequenceIn, user: dict = Depends(get_current_user)):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(400, "AI is not configured")
    import json as jsonlib

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    prompt = (
        f"Write a {data.steps}-step cold email sequence.\n"
        f"Sender's product: {data.product}\n"
        f"Target audience: {data.audience}\n"
        f"Tone: {data.tone}\n\n"
        "Rules: step 1 wait_days=0; later steps are short polite follow-ups adding new angles (social proof, ROI, gentle breakup). "
        "Use {{first_name}} and {{company}} merge tags. Each body 60-110 words, no fluff, one clear CTA, plain text with \\n line breaks.\n"
        'Return ONLY JSON: {"steps": [{"subject": "...", "body": "...", "wait_days": 0}]}'
    )
    chat = LlmChat(api_key=api_key, session_id=f"rohly-seq-{user['id']}", system_message="You are an expert cold-email copywriter. You reply with pure JSON, no markdown fences.").with_model("openai", "gpt-5.4")
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            raise ValueError("no json in response")
        seq = jsonlib.loads(m.group(0))
        steps = normalize_steps(seq.get("steps"))
        if not steps:
            raise ValueError("empty sequence")
        return {"steps": steps}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"AI generation failed — try again ({type(e).__name__})")


# ---------- imports ----------
@app.post("/api/imports")
async def create_import(file: UploadFile = File(...), campaign_id: str = Form(""), user: dict = Depends(get_current_user)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    cols = {c.strip().lower(): c for c in (reader.fieldnames or [])}

    def col(*names):
        for n in names:
            if n in cols:
                return cols[n]
        return None

    email_c = col("email", "email address", "e-mail")
    if not email_c:
        raise HTTPException(400, "CSV must have an 'email' column")

    docs = []
    seen = set()
    for row in reader:
        email = (row.get(email_c) or "").strip().lower()
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)

        def g(*names):
            c = col(*names)
            return (row.get(c) or "").strip() if c else ""

        docs.append({
            "user_id": user["id"],
            "campaign_id": ObjectId(campaign_id) if campaign_id else None,
            "email": email,
            "first_name": g("first_name", "first name"),
            "last_name": g("last_name", "last name"),
            "company": g("company", "organization"),
            "title": g("title", "job title", "role"),
            "status": "new",
            "created_at": datetime.now(timezone.utc),
        })
    if docs:
        await db.leads.insert_many(docs)
    imp = {"user_id": user["id"], "filename": file.filename or "import.csv", "row_count": len(docs), "created_at": datetime.now(timezone.utc)}
    await db.imports.insert_one(imp)
    return {"ok": True, "imported": len(docs), "filename": imp["filename"]}


@app.get("/api/imports")
async def list_imports(user: dict = Depends(get_current_user)):
    items = []
    async for i in db.imports.find({"user_id": user["id"]}).sort("created_at", -1):
        items.append({"id": str(i["_id"]), "filename": i["filename"], "row_count": i["row_count"], "created_at": i["created_at"].isoformat()})
    return items


# ---------- tracking (unsubscribe + opens) ----------
UNSUB_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed — Rohly</title>
<style>body{{background:#07090E;color:#F8FAFC;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.c{{border:1px solid #1E293B;background:#0D111A;border-radius:16px;padding:48px;max-width:420px;text-align:center}}
.h{{color:#FF5A1F;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 12px}}</style></head>
<body><div class="c"><p class="h">Rohly</p><h1>You're unsubscribed</h1>
<p style="color:#94A3B8">{email} won't receive further emails from this sender.</p></div></body></html>"""


@app.get("/api/unsubscribe/{lead_id}/{token}")
async def unsubscribe_get(lead_id: str, token: str):
    if not ObjectId.is_valid(lead_id) or token != unsub_token(lead_id):
        raise HTTPException(404, "Invalid or expired unsubscribe link")
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    await db.leads.update_one({"_id": ObjectId(lead_id)}, {"$set": {"status": "unsubscribed"}})
    email = lead["email"] if lead else "This address"
    return HTMLResponse(UNSUB_PAGE.format(email=email))


@app.post("/api/unsubscribe/{lead_id}/{token}")
async def unsubscribe_post(lead_id: str, token: str):
    if token != unsub_token(lead_id):
        raise HTTPException(404, "Invalid or expired unsubscribe link")
    await db.leads.update_one({"_id": ObjectId(lead_id)}, {"$set": {"status": "unsubscribed"}})
    return {"ok": True}


PIXEL = b"\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b"


@app.get("/api/track/open/{lead_id}/{token}")
async def track_open(lead_id: str, token: str):
    if token != open_token(lead_id) or not ObjectId.is_valid(lead_id):
        return HTMLResponse("", status_code=204)
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if lead:
        dup = await db.events.find_one({"lead_id": ObjectId(lead_id), "type": "opened"})
        if not dup:
            await db.events.insert_one({
                "user_id": lead.get("user_id", ""),
                "campaign_id": ObjectId(lead["campaign_id"]) if lead.get("campaign_id") else None,
                "lead_id": lead["_id"], "lead_email": lead["email"],
                "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
                "type": "opened", "created_at": datetime.now(timezone.utc),
            })
    return HTMLResponse(content=PIXEL, media_type="image/gif")


# ---------- bulk lead ops ----------
class BulkLeadsIn(BaseModel):
    ids: list[str]
    action: str  # assign_campaign | delete | status
    campaign_id: Optional[str] = None
    status: Optional[str] = None


@app.post("/api/leads/bulk")
async def bulk_leads(data: BulkLeadsIn, user: dict = Depends(get_current_user)):
    oids = [ObjectId(i) for i in data.ids if ObjectId.is_valid(i)]
    if not oids:
        raise HTTPException(400, "No leads selected")
    if data.action == "delete":
        res = await db.leads.delete_many({"user_id": user["id"], "_id": {"$in": oids}})
        return {"ok": True, "affected": res.deleted_count}
    if data.action == "assign_campaign":
        if not data.campaign_id:
            raise HTTPException(400, "campaign_id required")
        c = await db.campaigns.find_one({"_id": ObjectId(data.campaign_id), "user_id": user["id"]})
        if not c:
            raise HTTPException(404, "Campaign not found")
        res = await db.leads.update_many(
            {"user_id": user["id"], "_id": {"$in": oids}},
            {"$set": {"campaign_id": ObjectId(data.campaign_id), "step_index": 0, "next_send_at": None}},
        )
        total = await db.leads.count_documents({"campaign_id": ObjectId(data.campaign_id)})
        await db.campaigns.update_one({"_id": c["_id"]}, {"$set": {"lead_count": total}})
        return {"ok": True, "affected": res.modified_count}
    if data.action == "status":
        res = await db.leads.update_many(
            {"user_id": user["id"], "_id": {"$in": oids}},
            {"$set": {"status": data.status or "new"}},
        )
        return {"ok": True, "affected": res.modified_count}
    raise HTTPException(400, "Unknown action")


@app.get("/api/leads/export")
async def export_leads(user: dict = Depends(get_current_user)):
    from fastapi.responses import Response

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["email", "first_name", "last_name", "company", "title", "status", "created_at"])
    async for l in db.leads.find({"user_id": user["id"]}).sort("created_at", -1):
        writer.writerow([l["email"], l.get("first_name", ""), l.get("last_name", ""), l.get("company", ""), l.get("title", ""), l.get("status", ""), l["created_at"].isoformat()])
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=rohly-leads.csv"})


# ---------- billing ----------
@app.get("/api/billing")
async def billing(user: dict = Depends(get_current_user)):
    leads_total = await db.leads.count_documents({"user_id": user["id"]})
    return {
        "plan": "growth",
        "price_monthly": 79,
        "usage": {"leads": leads_total, "leads_quota": 25000, "inboxes": await db.inboxes.count_documents({"user_id": user["id"]}), "inboxes_quota": 20},
        "invoices": [
            {"id": "INV-2026-009", "date": "2026-09-01", "amount": 79, "status": "paid"},
            {"id": "INV-2026-008", "date": "2026-08-01", "amount": 79, "status": "paid"},
            {"id": "INV-2026-007", "date": "2026-07-01", "amount": 79, "status": "paid"},
        ],
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "rohly-api"}


# ---------- seed ----------
LEAD_POOL = [
    ("ava", "chen", "Northwind Labs", "VP Sales"), ("liam", "o'brien", "Fernwick", "Founder"),
    ("maya", "patel", "Helios CRM", "Head of Growth"), ("noah", "kim", "Brightline", "CEO"),
    ("sofia", "reyes", "Cobalt Analytics", "CMO"), ("eli", "brandt", "Vantage HR", "COO"),
    ("zara", "ahmed", "Pilot & Co", "Marketing Lead"), ("finn", "murphy", "OrbitDesk", "BD Manager"),
    ("iris", "novak", "Statler Group", "Founder"), ("omar", "haddad", "Quill Software", "VP Engineering"),
    ("lena", "fischer", "Aurora Partners", "Partner"), ("theo", "martin", "Kestrel AI", "Growth Lead"),
    ("nina", "kovacs", "Meridian Health", "Director Ops"), ("jack", "walsh", "Tileyard", "Founder"),
    ("rosa", "diaz", "Ledgerly", "Finance Lead"), ("kai", "tang", "Summit Retail", "eComm Director"),
    ("elle", "wong", "Forma Studio", "Creative Dir."), ("adam", "kroll", "Pinewood Capital", "Associate"),
    ("yuki", "sato", "Kite & Arrow", "Head of Product"), ("mara", "silva", "Bluepeak", "Sales Director"),
    ("dana", "white", "Grovewell", "CEO"), ("paul", "moreau", "Atelier Data", "Founder"),
    ("sara", "lind", "Nimbus Logistics", "Ops Manager"), ("tom", "hardy", "Stackfield", "CTO"),
    ("june", "park", "Lantern", "Growth Marketer"), ("carl", "berg", "Ironwood", "VP Revenue"),
    ("ada", "nwosu", "Fold Health", "Product Lead"), ("sam", "torres", "Driftwood", "Founder"),
    ("tess", "hall", "Clearvue", "CMO"), ("ben", "yates", "Craftbase", "Operations"),
    ("lola", "mbeki", "Sundial", "Partnerships"), ("evan", "ross", "Trailmix", "Head of Sales"),
    ("faye", "zhang", "Mosaic Labs", "Research Lead"), ("gus", "larsen", "Harborview", "Director"),
    ("hana", "ito", "Papercrane", "Founder"), ("ivan", "petrov", "Stonebridge", "BD Lead"),
    ("jade", "moreno", "Loopwear", "Brand Lead"), ("kofi", "mensah", "Tidewater", "CEO"),
    ("lars", "nielsen", "Fjord Analytics", "VP Data"), ("mila", "popov", "Garnet", "Growth"),
]


async def seed():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    try:
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass

    if await db.users.find_one({"email": ADMIN_EMAIL}):
        return

    now = datetime.now(timezone.utc)
    user_res = await db.users.insert_one({
        "email": ADMIN_EMAIL, "password_hash": hash_password(ADMIN_PASSWORD),
        "name": "Deepanshu Singh", "role": "owner", "created_at": now - timedelta(days=38),
    })
    uid = str(user_res.inserted_id)

    inbox_specs = [
        ("deepanshu.singh@joinrohence.com", "deepanshu.singh", "Kind Regards,\nDeepanshu Singh\nFounder | Rohence\nwww.rohence.com", 50, 30),
        ("deep@joinrohence.com", "deep", "Best,\nDeep", 50, 27),
        ("deepanshu@joinrohence.com", "deepanshu", "", 40, 18),
        ("deepanshu@rohencehq.com", "deepanshu", "", 30, 9),
        ("deepanshu.singh@rohencehq.com", "deepanshu.singh", "Warmly,\nDeepanshu", 50, 3),
    ]
    for email, dn, sig, limit, days_ago in inbox_specs:
        await db.inboxes.insert_one({
            "user_id": uid, "email": email, "display_name": dn, "from_name": "Deepanshu Singh",
            "provider": "gmail", "status": "connected", "signature": sig,
            "daily_sending_limit": limit, "sent_today": 0, "sent_today_date": now.date().isoformat(),
            "enabled": True, "smtp_host": "", "smtp_port": 587, "smtp_security": "starttls",
            "smtp_username": email, "smtp_password_ciphertext": "",
            "imap_host": "", "imap_port": 993, "imap_security": "ssl",
            "connected_at": now - timedelta(days=days_ago),
        })

    campaigns = [
        {"name": "Q4 Founder Outreach", "subject": "{{first_name}}, a quicker path to pipeline", "body": "Hi {{first_name}},\n\nI noticed {{company}} is scaling outbound this quarter. We built Rohly to run personalized campaigns across multiple inboxes without landing in spam.\n\nWorth a quick look next week?\n\n— Deepanshu", "status": "active", "daily_limit": 40, "days_ago": 21},
        {"name": "Series A SaaS CTOs", "subject": "Deliverability benchmarks for {{company}}", "body": "Hi {{first_name}},\n\nTeams like yours typically see 2x reply rates once inbox health is under control. Happy to share benchmarks.", "status": "draft", "daily_limit": 30, "days_ago": 6},
        {"name": "Agency Partners EU", "subject": "Partnering on outbound for your clients", "body": "Hi {{first_name}},\n\nWe're onboarding a handful of agency partners in the EU. White-label outbound, your brand.", "status": "scheduled", "daily_limit": 25, "days_ago": 2},
        {"name": "Dormant Leads Revival", "subject": "Still thinking about {{company}}?", "body": "Hi {{first_name}},\n\nCircling back with something new since we last spoke.", "status": "paused", "daily_limit": 20, "days_ago": 14},
    ]
    campaign_ids = {}
    for c in campaigns:
        doc = {
            "user_id": uid, "name": c["name"], "subject": c["subject"], "body": c["body"],
            "inbox_ids": [], "daily_limit": c["daily_limit"],
            "scheduled_at": now + timedelta(days=2) if c["status"] == "scheduled" else None,
            "status": c["status"], "sent_count": 0, "reply_count": 0,
            "created_at": now - timedelta(days=c["days_ago"]),
        }
        res = await db.campaigns.insert_one(doc)
        campaign_ids[c["name"]] = res.inserted_id

    rng = random.Random(42)
    lead_docs = []
    camp_list = list(campaign_ids.values())
    for i, (fn, ln, company, title) in enumerate(LEAD_POOL):
        fn = fn.strip().capitalize()
        camp = camp_list[i % 3] if i < 24 else None
        status = "new"
        if camp and i < 18:
            r = rng.random()
            status = "positive" if r < 0.14 else "replied" if r < 0.34 else "contacted"
        lead_docs.append({
            "user_id": uid, "campaign_id": camp,
            "email": f"{fn.lower().replace(' ', '')}.{ln}@{company.lower().replace(' ', '').replace('&', 'and')}.com",
            "first_name": fn, "last_name": ln.title(), "company": company, "title": title,
            "status": status, "created_at": now - timedelta(days=rng.randint(0, 25)),
        })
    await db.leads.insert_many(lead_docs)

    events = []
    active_camps = [campaign_ids["Q4 Founder Outreach"], campaign_ids["Dormant Leads Revival"]]
    for d in range(29, -1, -1):
        day = now - timedelta(days=d)
        base = 0 if d > 22 else rng.randint(22, 48)
        for _ in range(base):
            lead = rng.choice(lead_docs[:24])
            t = day - timedelta(minutes=rng.randint(0, 720))
            camp = rng.choice(active_camps)
            events.append({"user_id": uid, "campaign_id": camp, "lead_id": None, "lead_email": lead["email"], "lead_name": f"{lead['first_name']} {lead['last_name']}", "type": "sent", "created_at": t})
            if rng.random() < 0.72:
                events.append({"user_id": uid, "campaign_id": camp, "lead_id": None, "lead_email": lead["email"], "lead_name": f"{lead['first_name']} {lead['last_name']}", "type": "opened", "created_at": t + timedelta(minutes=rng.randint(2, 300))})
            if rng.random() < 0.14:
                pos = rng.random() < 0.32
                events.append({"user_id": uid, "campaign_id": camp, "lead_id": None, "lead_email": lead["email"], "lead_name": f"{lead['first_name']} {lead['last_name']}", "type": "positive_replied" if pos else "replied", "created_at": t + timedelta(minutes=rng.randint(30, 900))})
            if rng.random() < 0.02:
                events.append({"user_id": uid, "campaign_id": camp, "lead_id": None, "lead_email": lead["email"], "lead_name": f"{lead['first_name']} {lead['last_name']}", "type": "bounced", "created_at": t + timedelta(minutes=10)})
    await db.events.insert_many(events)
    await db.imports.insert_one({"user_id": uid, "filename": "founder_outreach_masterlist.csv", "row_count": 40, "created_at": now - timedelta(days=21)})

    for cid in campaign_ids.values():
        sent = await db.events.count_documents({"campaign_id": cid, "type": "sent"})
        replies = await db.events.count_documents({"campaign_id": cid, "type": {"$in": ["replied", "positive_replied"]}})
        leads_n = await db.leads.count_documents({"campaign_id": cid})
        await db.campaigns.update_one({"_id": cid}, {"$set": {"sent_count": sent, "reply_count": replies, "lead_count": leads_n}})
    print("[seed] demo workspace created")


@app.on_event("startup")
async def startup():
    await seed()
    async for c in db.campaigns.find({"status": "active"}):
        start_sender(str(c["_id"]), c.get("user_id", ""))
    asyncio.create_task(reply_poller())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
