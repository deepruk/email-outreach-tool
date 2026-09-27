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

router = APIRouter(prefix="/track", tags=["email-tracking"])

# Transparent 1x1 GIF. The image request is the open signal.
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")


def tracking_url(tracking_id: str) -> str:
    base = os.environ.get("APP_URL", "").rstrip("/")
    return f"{base}/api/track/open/{tracking_id}"


def html_body(body: str, pixel_url: str) -> str:
    escaped = html.escape(body or "").replace("\r\n", "\n").replace("\r", "\n")
    escaped = escaped.replace("\n", "<br>\n")
    return (
        "<!doctype html><html><body>"
        f"{escaped}"
        f'<img src="{html.escape(pixel_url, quote=True)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">'
        "</body></html>"
    )


async def tracked_send_gmail_message(
    scheduled_email_id: str,
    inbox_id: str,
    recipient_email: str,
    subject: str,
    body: str,
) -> dict[str, str | None]:
    """Send one scheduled email with a unique open-tracking pixel."""
    scheduled = await db.scheduled_emails.find_one(
        {"id": scheduled_email_id, "status": "sending"},
    )
    if not scheduled:
        raise RuntimeError("Scheduled email was not found while preparing tracked send")

    tracking_id = str(uuid.uuid4())
    await db.scheduled_emails.update_one(
        {"id": scheduled_email_id, "status": "sending"},
        {"$set": {"tracking_id": tracking_id, "open_count": 0, "first_opened_at": None, "last_opened_at": None}},
    )

    # Import locally to avoid a scheduler <-> tracking circular import.
    from routers.scheduler import get_gmail_credentials

    credentials = await get_gmail_credentials(
        inbox_id,
        ["https://www.googleapis.com/auth/gmail.send"],
    )
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
        return {
            "message_id": result.get("id"),
            "thread_id": result.get("threadId"),
            "tracking_id": tracking_id,
        }

    import asyncio
    return await asyncio.to_thread(send)


@router.get("/open/{tracking_id}")
async def track_open(tracking_id: str) -> Response:
    now = datetime.now(timezone.utc)
    row = await db.scheduled_emails.find_one({"tracking_id": tracking_id})
    if row:
        first_open = await db.scheduled_emails.update_one(
            {
                "id": row["id"],
                "tracking_id": tracking_id,
                "$or": [
                    {"first_opened_at": {"$exists": False}},
                    {"first_opened_at": None},
                ],
            },
            {"$set": {"first_opened_at": now}},
        )
        await db.scheduled_emails.update_one(
            {"id": row["id"], "tracking_id": tracking_id},
            {"$inc": {"open_count": 1}, "$set": {"last_opened_at": now}},
        )

        if row.get("source_type") == "rohly_template":
            campaign = await db.campaigns.find_one({"id": row.get("campaign_id")})
            campaign_collection = db.campaigns
        else:
            campaign = await db.csv_campaigns.find_one({"id": row.get("campaign_id")})
            campaign_collection = db.csv_campaigns

        if campaign:
            increments = {"total_opens": 1}
            if first_open.modified_count == 1:
                increments["unique_opens"] = 1
            await campaign_collection.update_one({"id": row["campaign_id"]}, {"$inc": increments})

    return Response(
        content=PIXEL,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )
