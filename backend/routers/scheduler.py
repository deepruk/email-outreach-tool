from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
import asyncio
import base64
import os
import random
import secrets
import requests

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from lib.db import db
from models.scheduler import (
    Activity,
    Campaign,
    CampaignCreate,
    HistoryEntry,
    Inbox,
    InboxConnectRequest,
    LaunchResponse,
    Overview,
    Recipient,
    RecipientCreate,
    Template,
    TemplateCreate,
)

router = APIRouter(prefix="/workspace", tags=["workspace"])
oauth_router = APIRouter(prefix="/oauth/gmail", tags=["gmail-oauth"])

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalise_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def oauth_config() -> dict[str, dict[str, str]]:
    return {
        "web": {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def redirect_uri() -> str:
    return os.environ.get(
        "GOOGLE_REDIRECT_URI",
        f"{os.environ.get('APP_URL', 'http://localhost:3000')}/api/oauth/gmail/callback",
    )


def make_oauth_flow(*, autogenerate_code_verifier: bool, code_verifier: str | None = None) -> Flow:
    return Flow.from_client_config(
        oauth_config(),
        scopes=GMAIL_SCOPES,
        redirect_uri=redirect_uri(),
        autogenerate_code_verifier=autogenerate_code_verifier,
        code_verifier=code_verifier,
    )


async def get_gmail_credentials(inbox_id: str) -> Credentials:
    token = await db.oauth_tokens.find_one({"inbox_id": inbox_id})
    if not token:
        raise HTTPException(status_code=401, detail="Gmail inbox needs to be connected again")
    credentials = Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        scopes=GMAIL_SCOPES,
    )
    expiry = normalise_datetime(token.get("expires_at"))
    if expiry and credentials.expired:
        credentials.refresh(GoogleRequest())
        await db.oauth_tokens.update_one(
            {"inbox_id": inbox_id},
            {"$set": {"access_token": credentials.token, "expires_at": credentials.expiry}},
        )
    return credentials


async def send_gmail_message(inbox_id: str, recipient_email: str, subject: str, body: str) -> None:
    credentials = await get_gmail_credentials(inbox_id)

    def send() -> None:
        message = MIMEText(body, "plain", "utf-8")
        message["to"] = recipient_email
        message["subject"] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        service.users().messages().send(userId="me", body={"raw": raw}).execute()

    await asyncio.to_thread(send)


async def get_google_profile(access_token: str) -> dict[str, str]:
    def fetch() -> dict[str, str]:
        response = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    return await asyncio.to_thread(fetch)


@oauth_router.get("/start")
async def start_gmail_oauth() -> RedirectResponse:
    flow = make_oauth_flow(autogenerate_code_verifier=True)
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    await db.oauth_states.insert_one(
        {"state": state, "code_verifier": flow.code_verifier, "created_at": utc_now()}
    )
    return RedirectResponse(authorization_url)


@oauth_router.get("/callback")
async def gmail_oauth_callback(code: str, state: str) -> RedirectResponse:
    oauth_state = await db.oauth_states.find_one_and_delete({"state": state})
    if not oauth_state:
        raise HTTPException(status_code=400, detail="OAuth state expired or invalid")
    created_at = normalise_datetime(oauth_state.get("created_at")) or utc_now()
    if (utc_now() - created_at).total_seconds() > 600:
        raise HTTPException(status_code=400, detail="OAuth state expired")
    code_verifier = oauth_state.get("code_verifier")
    if not code_verifier:
        raise HTTPException(status_code=400, detail="OAuth verifier missing; please start the connection again")
    flow = make_oauth_flow(autogenerate_code_verifier=False, code_verifier=code_verifier)
    try:
        flow.fetch_token(code=code)
    except Exception:
        return RedirectResponse(
            f"{os.environ.get('APP_URL', 'http://localhost:3000')}/?gmail=error&reason=oauth_exchange"
        )
    credentials = flow.credentials
    try:
        profile = await get_google_profile(credentials.token)
        email = profile["email"]
    except Exception:
        return RedirectResponse(
            f"{os.environ.get('APP_URL', 'http://localhost:3000')}/?gmail=error&reason=profile_lookup"
        )
    inbox = await db.inboxes.find_one({"email": email})
    if inbox:
        inbox_id = inbox["id"]
        await db.inboxes.update_one(
            {"id": inbox_id},
            {"$set": {"is_mocked": False, "status": "connected", "last_used_at": utc_now()}},
        )
    else:
        new_inbox = Inbox(email=email, display_name=email.split("@")[0], is_mocked=False)
        inbox_id = new_inbox.id
        await db.inboxes.insert_one(new_inbox.model_dump())
    await db.oauth_tokens.update_one(
        {"inbox_id": inbox_id},
        {
            "$set": {
                "inbox_id": inbox_id,
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "expires_at": credentials.expiry,
            }
        },
        upsert=True,
    )
    await db.activities.insert_one(
        Activity(message="Gmail inbox connected", detail=email, tone="success").model_dump()
    )
    return RedirectResponse(f"{os.environ.get('APP_URL', 'http://localhost:3000')}/?gmail=connected")


async def latest_activity(limit: int = 6) -> list[Activity]:
    rows = await db.activities.find().sort("time", -1).to_list(limit)
    return [Activity(**row) for row in rows]


@router.get("/dashboard", response_model=Overview)
async def get_dashboard() -> Overview:
    campaigns = await db.campaigns.find().to_list(1000)
    inboxes = await db.inboxes.count_documents({"status": "connected"})
    sent_today = await db.history.count_documents({"status": "sent"})
    queued = sum(
        max(0, int(row.get("total_count", 0)) - int(row.get("sent_count", 0)))
        for row in campaigns
        if row.get("status") in {"queued", "active", "paused"}
    )
    failures = await db.history.count_documents({"status": "failed"})
    total_history = await db.history.count_documents({})
    next_dates = [
        normalise_datetime(row.get("next_send_at"))
        for row in campaigns
        if row.get("status") == "active" and row.get("next_send_at")
    ]
    next_dates = [value for value in next_dates if value]
    next_send_at = min(next_dates) if next_dates else None
    diff_minutes = None
    if next_send_at:
        diff_minutes = max(0, round((next_send_at - utc_now()).total_seconds() / 60))
    return Overview(
        sent_today=sent_today,
        queued=queued,
        error_rate=round((failures / total_history) * 100, 1) if total_history else 0,
        active_inboxes=inboxes,
        active_campaigns=sum(1 for row in campaigns if row.get("status") == "active"),
        next_send_at=next_send_at,
        next_send_in_minutes=diff_minutes,
        recent_activity=await latest_activity(),
    )


@router.get("/inboxes", response_model=list[Inbox])
async def list_inboxes() -> list[Inbox]:
    rows = await db.inboxes.find().sort("connected_at", -1).to_list(1000)
    return [Inbox(**row) for row in rows]


@router.post("/inboxes/connect", response_model=Inbox)
async def connect_inbox(input: InboxConnectRequest) -> Inbox:
    existing = await db.inboxes.find_one({"email": input.email})
    if existing:
        return Inbox(**existing)
    inbox = Inbox(email=input.email, display_name=input.display_name or input.email.split("@")[0])
    await db.inboxes.insert_one(inbox.model_dump())
    await db.activities.insert_one(
        Activity(
            message="Inbox connected",
            detail=f"{inbox.email} is ready for campaign routing",
            tone="success",
        ).model_dump()
    )
    return inbox


@router.get("/recipients", response_model=list[Recipient])
async def list_recipients() -> list[Recipient]:
    rows = await db.recipients.find().sort("created_at", -1).to_list(1000)
    return [Recipient(**row) for row in rows]


@router.post("/recipients", response_model=Recipient)
async def create_recipient(input: RecipientCreate) -> Recipient:
    recipient = Recipient(**input.model_dump())
    await db.recipients.insert_one(recipient.model_dump())
    return recipient


@router.get("/templates", response_model=list[Template])
async def list_templates() -> list[Template]:
    rows = await db.templates.find().sort("created_at", -1).to_list(1000)
    return [Template(**row) for row in rows]


@router.post("/templates", response_model=Template)
async def create_template(input: TemplateCreate) -> Template:
    template = Template(**input.model_dump())
    await db.templates.insert_one(template.model_dump())
    return template


@router.get("/campaigns", response_model=list[Campaign])
async def list_campaigns() -> list[Campaign]:
    rows = await db.campaigns.find().sort("created_at", -1).to_list(1000)
    return [Campaign(**row) for row in rows]


@router.post("/campaigns", response_model=Campaign)
async def create_campaign(input: CampaignCreate) -> Campaign:
    if input.min_gap_minutes > input.max_gap_minutes:
        raise HTTPException(status_code=422, detail="Minimum gap must be less than maximum gap")
    inbox = await db.inboxes.find_one({"id": input.inbox_id, "status": "connected"})
    if not inbox:
        raise HTTPException(status_code=404, detail="Connected inbox not found")
    template = await db.templates.find_one({"id": input.template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    recipient_count = await db.recipients.count_documents({"id": {"$in": input.recipient_ids}})
    if recipient_count != len(input.recipient_ids):
        raise HTTPException(status_code=404, detail="One or more recipients not found")
    campaign = Campaign(
        **input.model_dump(),
        total_count=len(input.recipient_ids),
        status="queued",
    )
    await db.campaigns.insert_one(campaign.model_dump())
    return campaign


@router.post("/campaigns/{campaign_id}/launch", response_model=LaunchResponse)
async def launch_campaign(campaign_id: str) -> LaunchResponse:
    row = await db.campaigns.find_one({"id": campaign_id})
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign = Campaign(**row)
    if campaign.status == "completed":
        raise HTTPException(status_code=409, detail="Campaign is already complete")
    now = utc_now()
    first_send = campaign.sent_count == 0
    next_send = now + timedelta(
        minutes=random.randint(campaign.min_gap_minutes, campaign.max_gap_minutes)
    )
    updates = {
        "status": "active",
        "launched_at": campaign.launched_at or now,
        "next_send_at": next_send,
    }
    if first_send:
        updates["sent_count"] = 1
        recipient = await db.recipients.find_one({"id": campaign.recipient_ids[0]})
        inbox = await db.inboxes.find_one({"id": campaign.inbox_id})
        if recipient and inbox:
            if not inbox.get("is_mocked", True):
                template = await db.templates.find_one({"id": campaign.template_id})
                if template:
                    try:
                        await send_gmail_message(
                            campaign.inbox_id,
                            recipient["email"],
                            template["subject"],
                            template["body"],
                        )
                    except Exception as exc:
                        await db.history.insert_one(
                            HistoryEntry(
                                campaign_name=campaign.name,
                                recipient_email=recipient["email"],
                                inbox_email=inbox["email"],
                                status="failed",
                            ).model_dump()
                        )
                        await db.activities.insert_one(
                            Activity(
                                message="Gmail send failed",
                                detail=str(exc)[:160],
                                tone="error",
                            ).model_dump()
                        )
                        raise HTTPException(status_code=502, detail="Gmail rejected the message") from exc
            await db.history.insert_one(
                HistoryEntry(
                    campaign_name=campaign.name,
                    recipient_email=recipient["email"],
                    inbox_email=inbox["email"],
                    status="sent",
                ).model_dump()
            )
            await db.activities.insert_one(
                Activity(
                    message="First message sent",
                    detail=f"{recipient['email']} via {inbox['email']}",
                    tone="success",
                ).model_dump()
            )
    await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    campaign = Campaign(**{**row, **updates})
    return LaunchResponse(
        campaign=campaign,
        message="Campaign launched. The next message is scheduled inside the configured gap.",
        is_mocked=True,
    )


@router.get("/history", response_model=list[HistoryEntry])
async def list_history() -> list[HistoryEntry]:
    rows = await db.history.find().sort("sent_at", -1).to_list(1000)
    return [HistoryEntry(**row) for row in rows]


@router.get("/oauth/gmail/status")
async def gmail_oauth_status() -> dict[str, bool]:
    return {
        "configured": bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET")),
        "mocked": True,
    }

