import base64
import html
import os
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter
from fastapi.responses import Response
from googleapiclient.discovery import build

from lib.db import db
from routers.scheduler import get_gmail_credentials

router = APIRouter(prefix="/track", tags=["email-tracking"])

# Transparent 1x1 GIF. The image request is the open signal.
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")


def tracking_url(tracking_id: str) -> str:
    base = os.environ.get("APP_URL", "").rstrip("/")
    return f"{base}/api/track/open/{tracking_id}"


def html_body(body: str, pixel_url: str) -> str:
    escaped = html.escape(body or "").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>\n")
    return (
        '<!doctype html><html><body>'
        f"{escaped}"
        f'<img src="{html.escape(pixel_url, quote=True)}" width="1" height="1" alt="">'
        "</body></html>"
    )


async def tracked_send_gmail_message(inbox_id: str, recipient_email: str, subject: str, body: str) -> dict[str, str | None]:
    """Send a multipart message with a per-message open-tracking pixel."""
    scheduled = await db.scheduled_emails.find_one(
        {
            "inbox_id": inbox_id,
            "recipient_email": recipient_email,
            "subject": subject,
            "status": "sending",
        },
        sort=[("scheduled_at", 1)],
    )
    tracking_id = str(uuid.uuid4())
    if scheduled:
        await db.scheduled_emails.update_one(
            {"id": scheduled["id"], "status": "sending"},
            {"$set": {"tracking_id": tracking_id, "open_count": 0}},
        )

    credentials = await get_gmail_credentials(inbox_id, ["https://www.googleapis.com/auth/gmail.send"])
    inbox = await db.inboxes.find_one({"id": inbox_id})
    signature = ((inbox or {}).get("signature") or "").strip()
    final_body = body or ""
    if signature and not final_body.rstrip().endswith(signature):
        final_body = f"{final_body.rstrip()}\n\n{signature}"

    pixel = tracking_url(tracking_id)
    message = MIMEMultipart("alternative")
    message["to"] = recipient_email
    message["subject"] = subject
    message.attach(MIMEText(final_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body(final_body, pixel), "html", "utf-8"))

    def send() -> dict[str, str | None]:
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return {"message_id": result.get("id"), "thread_id": result.get("threadId"), "tracking_id": tracking_id}

    import asyncio
    return await asyncio.to_thread(send)


@router.get("/open/{tracking_id}")
async def track_open(tracking_id: str) -> Response:
    now = datetime.now(timezone.utc)
    row = await db.scheduled_emails.find_one({"tracking_id": tracking_id})
    if row:
        current = int(row.get("open_count", 0) or 0)
        await db.scheduled_emails.update_one(
            {"id": row["id"], "tracking_id": tracking_id},
            {
                "$inc": {"open_count": 1},
                "$set": {"last_opened_at": now},
                "$setOnInsert": {"first_opened_at": now},
            },
        )
        if current == 0:
            await db.scheduled_emails.update_one(
                {"id": row["id"], "tracking_id": tracking_id, "first_opened_at": {"$exists": False}},
                {"$set": {"first_opened_at": now}},
            )
            await db.csv_campaigns.update_one(
                {"id": row["campaign_id"]},
                {"$inc": {"unique_opens": 1}},
            )
        await db.csv_campaigns.update_one(
            {"id": row["campaign_id"]},
            {"$inc": {"total_opens": 1}},
        )
    return Response(content=PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"})
