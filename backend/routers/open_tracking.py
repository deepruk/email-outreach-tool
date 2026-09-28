import base64
import html
import os
import re
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import RedirectResponse, Response
from googleapiclient.discovery import build

from lib.db import db
from lib.campaign_events import emit_campaign_event

router = APIRouter(prefix="/track", tags=["email-tracking"])
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")
URL_RE = re.compile(r"(https?://[^\s<>\"]+)")


def _base() -> str:
    return os.environ.get("APP_URL", "").rstrip("/")


def tracking_url(tracking_id: str) -> str:
    return f"{_base()}/api/track/open/{tracking_id}"


def _linkify(escaped: str, tracking_id: str, enabled: bool) -> str:
    if not enabled:
        return URL_RE.sub(lambda m: f'<a href="{m.group(1)}">{m.group(1)}</a>', escaped)
    counter = {"value": 0}
    def replace(match: re.Match) -> str:
        counter["value"] += 1
        target = match.group(1)
        click_url = f"{_base()}/api/track/click/{tracking_id}/{counter['value']}?url={quote(target, safe='')}"
        return f'<a href="{html.escape(click_url, quote=True)}">{target}</a>'
    return URL_RE.sub(replace, escaped)


def html_body(body: str, tracking_id: str, open_tracking: bool, click_tracking: bool, unsubscribe: bool) -> str:
    escaped = html.escape(body or "").replace("\r\n", "\n").replace("\r", "\n")
    escaped = _linkify(escaped, tracking_id, click_tracking).replace("\n", "<br>\n")
    footer = ""
    if unsubscribe:
        url = f"{_base()}/api/track/unsubscribe/{tracking_id}"
        footer = f'<p style="margin-top:24px;font-size:11px;color:#64748b"><a href="{html.escape(url, quote=True)}" style="color:#64748b">Unsubscribe</a></p>'
    pixel = f'<img src="{html.escape(tracking_url(tracking_id), quote=True)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">' if open_tracking else ""
    return f"<!doctype html><html><body>{escaped}{footer}{pixel}</body></html>"


async def tracked_send_gmail_message(scheduled_email_id: str, inbox_id: str, recipient_email: str, subject: str, body: str) -> dict[str, str | None]:
    scheduled = await db.scheduled_emails.find_one({"id": scheduled_email_id, "status": "sending"})
    if not scheduled:
        raise RuntimeError("Scheduled email was not found while preparing tracked send")
    campaign = await db.campaigns.find_one({"id": scheduled.get("campaign_id")}) or await db.csv_campaigns.find_one({"id": scheduled.get("campaign_id")}) or {}
    open_tracking = bool(campaign.get("open_tracking", True))
    click_tracking = bool(campaign.get("click_tracking", False))
    unsubscribe = bool(campaign.get("unsubscribe_enabled", True))
    tracking_id = str(uuid.uuid4())
    await db.scheduled_emails.update_one({"id": scheduled_email_id, "status": "sending"}, {"$set": {
        "tracking_id": tracking_id, "open_count": 0, "click_count": 0,
        "first_opened_at": None, "last_opened_at": None, "first_clicked_at": None, "last_clicked_at": None,
    }})

    from routers.scheduler import get_gmail_credentials
    credentials = await get_gmail_credentials(inbox_id, ["https://www.googleapis.com/auth/gmail.send"])
    inbox = await db.inboxes.find_one({"id": inbox_id})
    signature = ((inbox or {}).get("signature") or "").strip()
    final_body = body or ""
    if signature and not final_body.rstrip().endswith(signature):
        final_body = f"{final_body.rstrip()}\n\n{signature}"
    plain_body = final_body
    if unsubscribe:
        plain_body += f"\n\nUnsubscribe: {_base()}/api/track/unsubscribe/{tracking_id}"

    message = MIMEMultipart("alternative")
    message["to"] = recipient_email
    message["subject"] = subject
    message.attach(MIMEText(plain_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body(final_body, tracking_id, open_tracking, click_tracking, unsubscribe), "html", "utf-8"))

    def send() -> dict[str, str | None]:
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return {"message_id": result.get("id"), "thread_id": result.get("threadId"), "tracking_id": tracking_id}

    import asyncio
    return await asyncio.to_thread(send)


async def _campaign_for(row: dict) -> tuple[dict | None, object]:
    if row.get("source_type") == "rohly_template":
        return await db.campaigns.find_one({"id": row.get("campaign_id")}), db.campaigns
    return await db.csv_campaigns.find_one({"id": row.get("campaign_id")}), db.csv_campaigns


async def _cancel_future(row: dict, reason: str) -> None:
    query = {"campaign_id": row.get("campaign_id"), "recipient_email": row.get("recipient_email"), "status": "scheduled"}
    if row.get("recipient_id"):
        query = {"campaign_id": row.get("campaign_id"), "recipient_id": row.get("recipient_id"), "status": "scheduled"}
    await db.scheduled_emails.update_many(query, {"$set": {"status": "cancelled", "error": reason}})


@router.get("/open/{tracking_id}")
async def track_open(tracking_id: str) -> Response:
    now = datetime.now(timezone.utc)
    row = await db.scheduled_emails.find_one({"tracking_id": tracking_id})
    if row:
        first = await db.scheduled_emails.update_one({"id": row["id"], "tracking_id": tracking_id, "$or": [{"first_opened_at": {"$exists": False}}, {"first_opened_at": None}]}, {"$set": {"first_opened_at": now}})
        await db.scheduled_emails.update_one({"id": row["id"]}, {"$inc": {"open_count": 1}, "$set": {"last_opened_at": now}})
        campaign, collection = await _campaign_for(row)
        if campaign:
            increments = {"total_opens": 1}
            if first.modified_count == 1:
                increments["unique_opens"] = 1
            await collection.update_one({"id": row["campaign_id"]}, {"$inc": increments})
            if first.modified_count == 1:
                await emit_campaign_event(campaign, "opened", {"scheduled_email_id": row["id"], "recipient_email": row.get("recipient_email")})
                if campaign.get("stop_on_open"):
                    await _cancel_future(row, "Cancelled because the lead opened an email")
    return Response(content=PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"})


@router.get("/click/{tracking_id}/{link_index}")
async def track_click(tracking_id: str, link_index: int, url: str) -> RedirectResponse:
    if not url.startswith(("http://", "https://")):
        return RedirectResponse(url=_base() or "/", status_code=302)
    now = datetime.now(timezone.utc)
    row = await db.scheduled_emails.find_one({"tracking_id": tracking_id})
    if row:
        first = await db.scheduled_emails.update_one({"id": row["id"], "$or": [{"first_clicked_at": {"$exists": False}}, {"first_clicked_at": None}]}, {"$set": {"first_clicked_at": now}})
        await db.scheduled_emails.update_one({"id": row["id"]}, {"$inc": {"click_count": 1}, "$set": {"last_clicked_at": now}})
        campaign, collection = await _campaign_for(row)
        if campaign:
            increments = {"total_clicks": 1}
            if first.modified_count == 1:
                increments["unique_clicks"] = 1
            await collection.update_one({"id": row["campaign_id"]}, {"$inc": increments})
            await emit_campaign_event(campaign, "clicked", {"scheduled_email_id": row["id"], "recipient_email": row.get("recipient_email"), "link_index": link_index, "url": url})
            if campaign.get("stop_on_click"):
                await _cancel_future(row, "Cancelled because the lead clicked an email")
    return RedirectResponse(url=url, status_code=302)


@router.get("/unsubscribe/{tracking_id}")
async def unsubscribe(tracking_id: str) -> Response:
    row = await db.scheduled_emails.find_one({"tracking_id": tracking_id})
    if not row:
        return Response("<h2>Unsubscribe link is no longer available.</h2>", media_type="text/html", status_code=404)
    now = datetime.now(timezone.utc)
    email = (row.get("recipient_email") or "").strip().lower()
    campaign, collection = await _campaign_for(row)
    await db.suppressions.update_one({"user_id": row.get("user_id"), "email": email}, {"$set": {"reason": "unsubscribed", "updated_at": now}, "$setOnInsert": {"created_at": now}}, upsert=True)
    await db.scheduled_emails.update_many({"user_id": row.get("user_id"), "recipient_email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}, "status": "scheduled"}, {"$set": {"status": "cancelled", "error": "Lead unsubscribed"}})
    await db.scheduled_emails.update_one({"id": row["id"]}, {"$set": {"unsubscribed_at": now}})
    if campaign:
        await collection.update_one({"id": row["campaign_id"]}, {"$inc": {"unsubscribes": 1}})
        await emit_campaign_event(campaign, "unsubscribed", {"recipient_email": email})
    return Response("<!doctype html><html><body style='font-family:system-ui;padding:48px'><h2>You have been unsubscribed.</h2><p>You will not receive future outreach emails from this sender.</p></body></html>", media_type="text/html")
