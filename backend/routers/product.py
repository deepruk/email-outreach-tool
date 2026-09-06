import asyncio
import base64
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr, parsedate_to_datetime
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, Query
from googleapiclient.discovery import build

from lib.db import db
from models.product import (
    AnalyticsSummary,
    CampaignPerformance,
    ChartPoint,
    CommandCenter,
    InboxHealth,
    LeadPage,
    LeadSummary,
    Metric,
    Reply,
    ReplyUpdate,
    ReplySendRequest,
    SearchResult,
)
from models.scheduler import Inbox
from routers.auth import require_user
from routers.scheduler import get_gmail_credentials

router = APIRouter(prefix="/product", tags=["product"], dependencies=[Depends(require_user)])


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def chart_for_days(days: int) -> list[ChartPoint]:
    start = datetime.now(timezone.utc) - timedelta(days=days - 1)
    scheduled = await db.scheduled_emails.find(
        {"sent_at": {"$gte": start}, "status": "sent"}, {"sent_at": 1}
    ).to_list(100000)
    replies = await db.replies.find({"received_at": {"$gte": start}}).to_list(100000)
    points: dict[str, dict[str, int]] = {}
    for offset in range(days):
        key = (start + timedelta(days=offset)).date().isoformat()
        points[key] = {"sends": 0, "replies": 0, "positive_replies": 0}
    for row in scheduled:
        key = aware(row.get("sent_at")).date().isoformat()
        if key in points:
            points[key]["sends"] += 1
    for row in replies:
        key = aware(row.get("received_at")).date().isoformat()
        if key in points:
            points[key]["replies"] += 1
            if row.get("sentiment") == "positive":
                points[key]["positive_replies"] += 1
    return [ChartPoint(date=key, **value) for key, value in points.items()]


def performance(row: dict) -> CampaignPerformance:
    sent = int(row.get("emails_sent", 0))
    replies = int(row.get("replies", 0))
    total_steps = max(1, len(row.get("steps", [])))
    total_planned = max(1, int(row.get("total_leads", 0)) * total_steps)
    return CampaignPerformance(
        id=row["id"],
        name=row["name"],
        status=row.get("status", "draft"),
        source=row.get("source_filename", "CSV"),
        leads=int(row.get("total_leads", 0)),
        sent=sent,
        replies=replies,
        positive_replies=int(row.get("positive_replies", 0)),
        reply_rate=round((replies / sent) * 100, 1) if sent else 0,
        progress=round((sent / total_planned) * 100, 1),
        created_at=row["created_at"],
    )


@router.get("/dashboard", response_model=CommandCenter)
async def dashboard() -> CommandCenter:
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=30)
    previous_start = current_start - timedelta(days=30)
    current_sent = await db.scheduled_emails.count_documents({"status": "sent", "sent_at": {"$gte": current_start}})
    previous_sent = await db.scheduled_emails.count_documents({"status": "sent", "sent_at": {"$gte": previous_start, "$lt": current_start}})
    current_replies = await db.replies.count_documents({"received_at": {"$gte": current_start}})
    previous_replies = await db.replies.count_documents({"received_at": {"$gte": previous_start, "$lt": current_start}})
    positives = await db.replies.count_documents({"received_at": {"$gte": current_start}, "sentiment": "positive"})
    previous_positives = await db.replies.count_documents({"received_at": {"$gte": previous_start, "$lt": current_start}, "sentiment": "positive"})
    campaigns = await db.csv_campaigns.find().sort("created_at", -1).to_list(100)
    active = sum(1 for row in campaigns if row.get("status") == "running")
    scheduled = await db.scheduled_emails.count_documents({"status": "scheduled"})
    failed = await db.scheduled_emails.count_documents({"status": "failed"})
    attention = await db.inboxes.count_documents({"$or": [{"status": {"$ne": "connected"}}, {"reply_tracking_status": {"$ne": "active"}}]})

    def change(current: int, previous: int) -> float | None:
        return round(((current - previous) / previous) * 100, 1) if previous else None

    return CommandCenter(
        emails_sent=Metric(label="Emails sent", value=current_sent, change=change(current_sent, previous_sent)),
        replies=Metric(label="Replies", value=current_replies, change=change(current_replies, previous_replies)),
        positive_replies=Metric(label="Positive replies", value=positives, change=change(positives, previous_positives)),
        active_campaigns=Metric(label="Active campaigns", value=active),
        scheduled=scheduled,
        failed=failed,
        inboxes_needing_attention=attention,
        chart=await chart_for_days(14),
        campaigns=[performance(row) for row in campaigns[:8]],
    )


@router.get("/search", response_model=list[SearchResult])
async def global_search(q: str = Query(min_length=1, max_length=100)) -> list[SearchResult]:
    pattern = {"$regex": q, "$options": "i"}
    results: list[SearchResult] = []
    for row in await db.csv_campaigns.find({"name": pattern}).limit(5).to_list(5):
        results.append(SearchResult(id=row["id"], type="campaign", title=row["name"], subtitle=row.get("status", "draft"), href=f"/campaigns/{row['id']}"))
    pipeline = [
        {"$match": {"$or": [{"recipient_email": pattern}, {"first_name": pattern}, {"company": pattern}]}},
        {"$group": {"_id": "$recipient_email", "row": {"$first": "$$ROOT"}}},
        {"$limit": 5},
    ]
    async for result in db.scheduled_emails.aggregate(pipeline):
        row = result["row"]
        results.append(SearchResult(id=row["recipient_email"], type="lead", title=row.get("first_name") or row["recipient_email"], subtitle=f"{row.get('company', '')} · {row['recipient_email']}", href="/leads"))
    for row in await db.inboxes.find({"$or": [{"email": pattern}, {"display_name": pattern}]}).limit(5).to_list(5):
        results.append(SearchResult(id=row["id"], type="inbox", title=row["email"], subtitle=row.get("status", "connected"), href="/inboxes"))
    for row in await db.replies.find({"$or": [{"recipient_email": pattern}, {"subject": pattern}, {"snippet": pattern}]}).limit(5).to_list(5):
        results.append(SearchResult(id=row["id"], type="reply", title=row.get("sender_name") or row["recipient_email"], subtitle=row.get("subject", "Reply"), href="/inbox"))
    return results[:15]


@router.get("/leads", response_model=LeadPage)
async def leads(page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=10, le=100), q: str = "") -> LeadPage:
    match: dict = {}
    if q:
        pattern = {"$regex": q, "$options": "i"}
        match = {"$or": [{"recipient_email": pattern}, {"first_name": pattern}, {"company": pattern}, {"campaign_name": pattern}]}
    pipeline = [
        {"$match": match},
        {"$sort": {"scheduled_at": 1}},
        {"$group": {"_id": {"campaign_id": "$campaign_id", "email": "$recipient_email"}, "events": {"$push": "$$ROOT"}}},
        {"$sort": {"_id.email": 1}},
    ]
    grouped = [row async for row in db.scheduled_emails.aggregate(pipeline)]
    total = len(grouped)
    page_rows = grouped[(page - 1) * page_size: page * page_size]
    inbox_ids = {event["inbox_id"] for row in page_rows for event in row["events"]}
    inbox_rows = await db.inboxes.find({"id": {"$in": list(inbox_ids)}}).to_list(1000)
    inbox_lookup = {row["id"]: row["email"] for row in inbox_rows}
    items = []
    for row in page_rows:
        events = row["events"]
        sent = [event for event in events if event.get("status") == "sent"]
        upcoming = next((event for event in events if event.get("status") == "scheduled"), None)
        latest = max((aware(event.get("sent_at")) or aware(event.get("scheduled_at")) for event in events), default=None)
        first = events[0]
        status_value = "replied" if any(event.get("replied_at") for event in events) else (upcoming.get("status") if upcoming else events[-1].get("status", "scheduled"))
        campaign = await db.csv_campaigns.find_one({"id": first["campaign_id"]})
        items.append(LeadSummary(
            id=f"{first['campaign_id']}:{first['recipient_email']}",
            name=first.get("first_name") or first["recipient_email"],
            email=first["recipient_email"],
            company=first.get("company", ""),
            campaign_id=first["campaign_id"],
            campaign_name=first["campaign_name"],
            status=status_value,
            last_activity=max((aware(event.get("sent_at")) for event in sent), default=None),
            next_step=upcoming.get("step_label") if upcoming else None,
            next_step_at=aware(upcoming.get("scheduled_at")) if upcoming else None,
            inbox_email=inbox_lookup.get(first["inbox_id"], "Unknown inbox"),
            timezone=(campaign or {}).get("timezone", "UTC"),
            paused=bool(campaign and campaign.get("status") == "paused"),
        ))
    return LeadPage(items=items, total=total, page=page, page_size=page_size)


async def inbox_health_rows(days: int = 7) -> list[InboxHealth]:
    inboxes = [Inbox(**row) for row in await db.inboxes.find().sort("email", 1).to_list(1000)]
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    week = datetime.now(timezone.utc) - timedelta(days=days)
    rows = []
    for inbox in inboxes:
        sent = await db.scheduled_emails.count_documents({"inbox_id": inbox.id, "status": "sent", "sent_at": {"$gte": today}})
        failed = await db.scheduled_emails.count_documents({"inbox_id": inbox.id, "status": "failed", "scheduled_at": {"$gte": week}})
        last = await db.scheduled_emails.find_one({"inbox_id": inbox.id}, sort=[("scheduled_at", -1)])
        utilization = round((sent / inbox.daily_sending_limit) * 100, 1)
        disconnected = inbox.status != "connected"
        attention = failed > 0 or inbox.reply_tracking_status != "active" or utilization >= 90
        score = 0 if disconnected else max(20, 100 - failed * 10 - (15 if inbox.reply_tracking_status != "active" else 0))
        rows.append(InboxHealth(
            id=inbox.id,
            email=inbox.email,
            display_name=inbox.display_name,
            status=inbox.status,
            reply_tracking_status=inbox.reply_tracking_status,
            daily_limit=inbox.daily_sending_limit,
            sent_today=sent,
            utilization=utilization,
            health_score=score,
            health="disconnected" if disconnected else "attention" if attention else "healthy",
            failed_last_7_days=failed,
            last_activity=aware(last.get("sent_at") or last.get("scheduled_at")) if last else None,
        ))
    return rows


@router.get("/inbox-health", response_model=list[InboxHealth])
async def inbox_health() -> list[InboxHealth]:
    return await inbox_health_rows()


@router.get("/replies", response_model=list[Reply])
async def replies(limit: int = Query(default=100, ge=1, le=500)) -> list[Reply]:
    rows = await db.replies.find().sort("received_at", -1).to_list(limit)
    return [Reply(**row) for row in rows]


@router.patch("/replies/{reply_id}", response_model=Reply)
async def update_reply(reply_id: str, input: ReplyUpdate) -> Reply:
    row = await db.replies.find_one({"id": reply_id})
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Reply not found")
    updates = {key: value for key, value in input.model_dump().items() if value is not None}
    if updates.get("sentiment") == "positive" and row.get("sentiment") != "positive":
        await db.csv_campaigns.update_one({"id": row["campaign_id"]}, {"$inc": {"positive_replies": 1}})
    await db.replies.update_one({"id": reply_id}, {"$set": updates})
    return Reply(**{**row, **updates})


@router.post("/replies/{reply_id}/send")
async def send_reply(reply_id: str, input: ReplySendRequest) -> dict[str, str]:
    from fastapi import HTTPException
    row = await db.replies.find_one({"id": reply_id})
    if not row:
        raise HTTPException(status_code=404, detail="Reply not found")
    credentials = await get_gmail_credentials(row["inbox_id"])

    def send() -> dict:
        message = MIMEText(input.body, "plain", "utf-8")
        message["to"] = row["recipient_email"]
        subject = row.get("subject", "")
        message["subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        return service.users().messages().send(
            userId="me", body={"raw": raw, "threadId": row["thread_id"]}
        ).execute()

    result = await asyncio.to_thread(send)
    await db.reply_messages.insert_one({
        "id": result.get("id"),
        "reply_id": reply_id,
        "thread_id": row["thread_id"],
        "body": input.body,
        "sent_at": datetime.now(timezone.utc),
    })
    await db.replies.update_one({"id": reply_id}, {"$set": {"read": True}})
    return {"status": "sent", "message_id": result.get("id", "")}


@router.get("/analytics", response_model=AnalyticsSummary)
async def analytics(days: int = Query(default=30, ge=7, le=365)) -> AnalyticsSummary:
    start = datetime.now(timezone.utc) - timedelta(days=days)
    sent = await db.scheduled_emails.count_documents({"status": "sent", "sent_at": {"$gte": start}})
    failed = await db.scheduled_emails.count_documents({"status": "failed", "scheduled_at": {"$gte": start}})
    replies_count = await db.replies.count_documents({"received_at": {"$gte": start}})
    positives = await db.replies.count_documents({"received_at": {"$gte": start}, "sentiment": "positive"})
    campaigns = await db.csv_campaigns.find({"created_at": {"$gte": start}}).sort("emails_sent", -1).to_list(100)
    return AnalyticsSummary(
        date_range_days=days,
        emails_sent=sent,
        replies=replies_count,
        positive_replies=positives,
        failed=failed,
        reply_rate=round((replies_count / sent) * 100, 1) if sent else 0,
        positive_reply_rate=round((positives / sent) * 100, 1) if sent else 0,
        bounce_rate=round((failed / (sent + failed)) * 100, 1) if sent + failed else 0,
        chart=await chart_for_days(min(days, 60)),
        campaign_comparison=[performance(row) for row in campaigns],
        inbox_performance=await inbox_health_rows(days),
    )


def normalize_subject(subject: str) -> str:
    """Normalize email subjects so Re:/RE:/Fwd: prefixes do not block matching."""
    value = " ".join((subject or "").strip().split()).lower()
    while True:
        updated = value
        for prefix in ("re:", "fw:", "fwd:"):
            if value.startswith(prefix):
                value = value[len(prefix):].strip()
        if value == updated:
            return value


async def find_sent_campaign_email(
    inbox_id: str,
    sender_email: str,
    thread_id: str,
    subject: str,
) -> dict | None:
    """Find the campaign email that a Gmail reply belongs to.

    Thread ID is the strongest match. If Gmail returns a different thread ID,
    fall back to recipient + subject, then recipient-only when there is exactly
    one recent campaign recipient match.
    """
    sender_email = sender_email.strip().lower()
    if not sender_email:
        return None

    # 1. Normal case: Gmail thread ID matches the stored sent message.
    if thread_id:
        sent = await db.scheduled_emails.find_one(
            {"inbox_id": inbox_id, "thread_id": thread_id, "status": "sent"},
            sort=[("sent_at", -1)],
        )
        if sent:
            return sent

    # 2. Robust fallback: match the person who replied and the email subject.
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    candidates = await db.scheduled_emails.find(
        {
            "inbox_id": inbox_id,
            "recipient_email": sender_email,
            "status": "sent",
            "sent_at": {"$gte": cutoff},
        }
    ).sort("sent_at", -1).to_list(100)

    if not candidates:
        # Be tolerant of historical records where email casing differs.
        candidates = await db.scheduled_emails.find(
            {
                "inbox_id": inbox_id,
                "status": "sent",
                "sent_at": {"$gte": cutoff},
            }
        ).sort("sent_at", -1).to_list(500)
        candidates = [
            row for row in candidates
            if row.get("recipient_email", "").strip().lower() == sender_email
        ]

    normalized_reply_subject = normalize_subject(subject)
    if normalized_reply_subject:
        for candidate in candidates:
            if normalize_subject(candidate.get("subject", "")) == normalized_reply_subject:
                return candidate

    # 3. Last fallback: if this person has only one recent campaign thread,
    # use it even when Gmail changed/omitted the thread or subject.
    if len(candidates) == 1:
        return candidates[0]

    return candidates[0] if candidates else None


async def sync_replies_once() -> None:
    inbox_rows = await db.inboxes.find({"is_mocked": False, "status": "connected"}).to_list(100)

    for inbox in inbox_rows:
        try:
            credentials = await get_gmail_credentials(inbox["id"])
            service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

            # Search a wider window so replies are not missed just because they
            # arrived more than 14 days after the original campaign email.
            listing = await asyncio.to_thread(
                lambda: service.users().messages().list(
                    userId="me",
                    q="newer_than:60d -from:me",
                    maxResults=100,
                ).execute()
            )

            for message_ref in listing.get("messages", []):
                gmail_message_id = message_ref["id"]

                if await db.replies.find_one({"gmail_message_id": gmail_message_id}):
                    continue

                message = await asyncio.to_thread(
                    lambda message_id=gmail_message_id: service.users().messages().get(
                        userId="me",
                        id=message_id,
                        format="metadata",
                        metadataHeaders=["From", "Subject", "Date"],
                    ).execute()
                )

                headers = {
                    item["name"].lower(): item["value"]
                    for item in message.get("payload", {}).get("headers", [])
                }
                sender_name, sender_email = parseaddr(headers.get("from", ""))

                if not sender_email:
                    continue

                if sender_email.strip().lower() == inbox["email"].strip().lower():
                    continue

                thread_id = message.get("threadId", "")
                subject = headers.get("subject", "Reply")

                sent = await find_sent_campaign_email(
                    inbox_id=inbox["id"],
                    sender_email=sender_email,
                    thread_id=thread_id,
                    subject=subject,
                )
                if not sent:
                    # This is an unrelated Gmail message, not a campaign reply.
                    continue

                try:
                    received_at = parsedate_to_datetime(
                        headers.get("date", "")
                    ).astimezone(timezone.utc)
                except (TypeError, ValueError, OverflowError):
                    received_at = datetime.now(timezone.utc)

                reply = Reply(
                    gmail_message_id=gmail_message_id,
                    thread_id=thread_id,
                    inbox_id=inbox["id"],
                    inbox_email=inbox["email"],
                    campaign_id=sent["campaign_id"],
                    campaign_name=sent["campaign_name"],
                    recipient_email=sent["recipient_email"],
                    sender_name=sender_name or sender_email or sent["recipient_email"],
                    subject=subject,
                    snippet=message.get("snippet", ""),
                    received_at=received_at,
                )

                await db.replies.insert_one(reply.model_dump())

                # Mark the whole recipient's campaign sequence as replied and
                # cancel any remaining follow-ups.
                await db.scheduled_emails.update_many(
                    {
                        "campaign_id": sent["campaign_id"],
                        "recipient_email": sent["recipient_email"],
                    },
                    {"$set": {"replied_at": received_at}},
                )
                await db.scheduled_emails.update_many(
                    {
                        "campaign_id": sent["campaign_id"],
                        "recipient_email": sent["recipient_email"],
                        "status": "scheduled",
                    },
                    {
                        "$set": {
                            "status": "cancelled",
                            "error": "Cancelled after reply detected",
                        }
                    },
                )

                await db.csv_campaigns.update_one(
                    {"id": sent["campaign_id"]},
                    {"$inc": {"replies": 1}},
                )

            await db.inboxes.update_one(
                {"id": inbox["id"]},
                {
                    "$set": {
                        "reply_tracking_status": "active",
                        "last_reply_sync_at": datetime.now(timezone.utc),
                        "last_reply_sync_error": None,
                    }
                },
            )

        except Exception as exc:
            # Keep the inbox marked as needing attention, but retain the actual
            # error so the problem is no longer silently hidden.
            await db.inboxes.update_one(
                {"id": inbox["id"]},
                {
                    "$set": {
                        "reply_tracking_status": "reconnect_required",
                        "last_reply_sync_error": str(exc)[:1000],
                        "last_reply_sync_failed_at": datetime.now(timezone.utc),
                    }
                },
            )


@router.post("/replies/sync")
async def sync_replies() -> dict[str, str]:
    await sync_replies_once()
    return {"status": "completed"}


async def process_reply_sync() -> None:
    while True:
        await sync_replies_once()
        await asyncio.sleep(120)
