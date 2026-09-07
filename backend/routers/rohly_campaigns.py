from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import asyncio
import random
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.db import db
from routers.auth import require_user
from routers.scheduler import send_gmail_message

router = APIRouter(prefix="/workspace/rohly-campaigns", tags=["rohly-campaigns"], dependencies=[Depends(require_user)])


class Step(BaseModel):
    template_id: str
    label: str = "Initial email"
    delay_days: int = Field(default=0, ge=0, le=365)


class CampaignCreate(BaseModel):
    name: str
    inbox_ids: list[str] = Field(min_length=1)
    recipient_ids: list[str] = Field(min_length=1)
    steps: list[Step] = Field(min_length=1, max_length=10)
    timezone: str = "Asia/Kolkata"
    min_gap_minutes: int = Field(default=10, ge=1, le=1440)
    max_gap_minutes: int = Field(default=20, ge=1, le=1440)
    sending_window_start: str = "09:00"
    sending_window_end: str = "18:00"
    sending_days: list[int] = [0, 1, 2, 3, 4]


def _clock(value: str) -> tuple[int, int]:
    try:
        hour, minute = (int(part) for part in value.split(":"))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Working hours must use HH:MM") from exc
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise HTTPException(status_code=422, detail="Working hours must use HH:MM")
    return hour, minute


def _working(value: datetime, days: set[int], start: tuple[int, int], end: tuple[int, int]) -> datetime:
    while value.weekday() not in days:
        value = (value + timedelta(days=1)).replace(hour=start[0], minute=start[1], second=0, microsecond=0)
    start_dt = value.replace(hour=start[0], minute=start[1], second=0, microsecond=0)
    end_dt = value.replace(hour=end[0], minute=end[1], second=0, microsecond=0)
    if value < start_dt:
        return start_dt
    if value >= end_dt:
        value = (value + timedelta(days=1)).replace(hour=start[0], minute=start[1], second=0, microsecond=0)
        return _working(value, days, start, end)
    return value


def _personalize(value: str, recipient: dict) -> str:
    name = (recipient.get("name") or "").strip()
    first_name = name.split()[0] if name else ""
    values = {
        "first_name": first_name,
        "name": name,
        "full_name": name,
        "email": recipient.get("email", ""),
        "company": recipient.get("company", ""),
        "job_title": recipient.get("job_title", ""),
        "industry": recipient.get("industry", ""),
        "city": recipient.get("city", ""),
        "country": recipient.get("country", ""),
    }
    return re.sub(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", lambda match: str(values.get(match.group(1).lower(), "")), value or "")


def _schedule_events(campaign_id: str, campaign_name: str, recipients: list[dict], inbox_ids: list[str], steps: list[dict], timezone_name: str, min_gap: int, max_gap: int, window_start: str, window_end: str, sending_days: list[int]) -> list[dict]:
    tz = ZoneInfo(timezone_name)
    start = _clock(window_start)
    end = _clock(window_end)
    days = set(sending_days)
    if start >= end:
        raise HTTPException(status_code=422, detail="Working-hours start must be before end")
    if not days:
        raise HTTPException(status_code=422, detail="Select at least one working day")
    now = datetime.now(timezone.utc).astimezone(tz)
    next_initial = {inbox_id: _working(now, days, start, end) for inbox_id in inbox_ids}
    events: list[dict] = []
    for index, recipient in enumerate(recipients):
        inbox_id = inbox_ids[index % len(inbox_ids)]
        first = next_initial[inbox_id] + timedelta(minutes=random.Random(f"{campaign_id}:{recipient['id']}:initial").randint(min_gap, max_gap))
        first = _working(first, days, start, end)
        next_initial[inbox_id] = first
        prior = first
        for step_index, step in enumerate(steps):
            scheduled = first if step_index == 0 else _working(prior + timedelta(days=int(step.get("delay_days", 1))), days, start, end)
            events.append({
                "id": uuid.uuid4().hex,
                "campaign_id": campaign_id,
                "campaign_name": campaign_name,
                "source_type": "rohly_template",
                "recipient_id": recipient["id"],
                "recipient_email": recipient["email"],
                "first_name": (recipient.get("name") or "").split()[0] if recipient.get("name") else "",
                "company": recipient.get("company", ""),
                "step_index": step_index,
                "step_key": f"step_{step_index + 1}",
                "step_label": step.get("label", f"Email {step_index + 1}"),
                "template_id": step["template_id"],
                "inbox_id": inbox_id,
                "scheduled_at": scheduled.astimezone(timezone.utc),
                "status": "scheduled",
                "error": None,
                "sent_at": None,
                "message_id": None,
                "thread_id": None,
                "replied_at": None,
            })
            prior = scheduled
    for inbox_id in inbox_ids:
        inbox_events = sorted((event for event in events if event["inbox_id"] == inbox_id), key=lambda event: event["scheduled_at"])
        previous = None
        for event in inbox_events:
            local_time = event["scheduled_at"].astimezone(tz)
            if previous is not None:
                gap = random.Random(f"{campaign_id}:{event['id']}:gap").randint(min_gap, max_gap)
                minimum = previous + timedelta(minutes=gap)
                if local_time < minimum:
                    local_time = minimum
                local_time = _working(local_time, days, start, end)
                if local_time < previous:
                    local_time = _working(previous + timedelta(minutes=gap), days, start, end)
                event["scheduled_at"] = local_time.astimezone(timezone.utc)
            previous = event["scheduled_at"].astimezone(tz)
    return events


@router.get("/templates")
async def templates() -> list[dict]:
    return await db.templates.find().sort("created_at", -1).to_list(1000)


@router.get("/recipients")
async def recipients() -> list[dict]:
    return await db.recipients.find().sort("created_at", -1).to_list(5000)


@router.get("/inboxes")
async def inboxes() -> list[dict]:
    return await db.inboxes.find({"status": "connected"}).sort("email", 1).to_list(1000)


@router.post("")
async def create_campaign(input: CampaignCreate) -> dict:
    if input.min_gap_minutes > input.max_gap_minutes:
        raise HTTPException(status_code=422, detail="Minimum gap must be less than maximum gap")
    try:
        ZoneInfo(input.timezone)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid timezone") from exc
    if len(set(input.sending_days)) != len(input.sending_days) or any(day < 0 or day > 6 for day in input.sending_days):
        raise HTTPException(status_code=422, detail="Working days must be unique values from 0 to 6")
    _clock(input.sending_window_start)
    _clock(input.sending_window_end)
    inboxes = await db.inboxes.find({"id": {"$in": input.inbox_ids}, "status": "connected"}).to_list(1000)
    if len(inboxes) != len(set(input.inbox_ids)):
        raise HTTPException(status_code=404, detail="One or more connected inboxes were not found")
    recipients = await db.recipients.find({"id": {"$in": input.recipient_ids}}).to_list(5000)
    if len(recipients) != len(set(input.recipient_ids)):
        raise HTTPException(status_code=404, detail="One or more recipients were not found")
    template_ids = [step.template_id for step in input.steps]
    templates = await db.templates.find({"id": {"$in": template_ids}}).to_list(1000)
    found = {row["id"] for row in templates}
    if any(template_id not in found for template_id in template_ids):
        raise HTTPException(status_code=404, detail="One or more selected templates were not found")
    campaign_id = uuid.uuid4().hex
    campaign = {
        "id": campaign_id,
        "name": input.name,
        "campaign_type": "rohly_template",
        "source": "Rohly Template",
        "inbox_id": input.inbox_ids[0],
        "inbox_ids": input.inbox_ids,
        "template_id": input.steps[0].template_id,
        "recipient_ids": input.recipient_ids,
        "steps": [step.model_dump() for step in input.steps],
        "total_count": len(input.recipient_ids),
        "sent_count": 0,
        "failed_count": 0,
        "status": "queued",
        "min_gap_minutes": input.min_gap_minutes,
        "max_gap_minutes": input.max_gap_minutes,
        "sending_window_start": input.sending_window_start,
        "sending_window_end": input.sending_window_end,
        "sending_days": input.sending_days,
        "timezone": input.timezone,
        "next_send_at": None,
        "created_at": datetime.now(timezone.utc),
        "launched_at": None,
    }
    await db.campaigns.insert_one(campaign)
    return campaign


@router.post("/{campaign_id}/launch")
async def launch_campaign(campaign_id: str) -> dict:
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template"})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if campaign.get("status") in {"active", "completed"}:
        raise HTTPException(status_code=409, detail="Campaign is already launched")
    recipients = await db.recipients.find({"id": {"$in": campaign["recipient_ids"]}}).to_list(5000)
    events = _schedule_events(campaign["id"], campaign["name"], recipients, campaign["inbox_ids"], campaign["steps"], campaign.get("timezone", "Asia/Kolkata"), campaign["min_gap_minutes"], campaign["max_gap_minutes"], campaign.get("sending_window_start", "09:00"), campaign.get("sending_window_end", "18:00"), campaign.get("sending_days", [0, 1, 2, 3, 4]))
    await db.scheduled_emails.delete_many({"campaign_id": campaign_id, "source_type": "rohly_template"})
    if events:
        await db.scheduled_emails.insert_many(events)
    now = datetime.now(timezone.utc)
    first_at = min(event["scheduled_at"] for event in events) if events else now
    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"status": "active", "launched_at": now, "next_send_at": first_at, "emails_scheduled": len(events)}})
    return {**campaign, "status": "active", "launched_at": now, "next_send_at": first_at, "emails_scheduled": len(events)}


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(campaign_id: str):
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template"})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if campaign.get("status") == "active":
        raise HTTPException(status_code=409, detail="Pause or stop the campaign before deleting it")
    await db.scheduled_emails.delete_many({"campaign_id": campaign_id, "source_type": "rohly_template"})
    await db.campaigns.delete_one({"id": campaign_id})
    return None


async def process_template_campaigns() -> None:
    while True:
        try:
            due = await db.scheduled_emails.find({"source_type": "rohly_template", "status": "scheduled", "scheduled_at": {"$lte": datetime.now(timezone.utc)}}).sort("scheduled_at", 1).to_list(25)
            for item in due:
                claimed = await db.scheduled_emails.update_one({"id": item["id"], "status": "scheduled"}, {"$set": {"status": "sending"}})
                if claimed.modified_count != 1:
                    continue
                campaign = await db.campaigns.find_one({"id": item["campaign_id"], "campaign_type": "rohly_template"})
                if not campaign or campaign.get("status") != "active":
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "cancelled"}})
                    continue
                recipient = await db.recipients.find_one({"id": item["recipient_id"]})
                template = await db.templates.find_one({"id": item["template_id"]})
                inbox = await db.inboxes.find_one({"id": item["inbox_id"]})
                if not recipient or not template or not inbox:
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "failed", "error": "Recipient, template, or inbox no longer exists"}})
                    continue
                subject = _personalize(template.get("subject", ""), recipient)
                body = _personalize(template.get("body", ""), recipient)
                try:
                    result = {"message_id": None, "thread_id": None} if inbox.get("is_mocked", True) else await send_gmail_message(item["inbox_id"], recipient["email"], subject, body)
                    sent_at = datetime.now(timezone.utc)
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "sent", "sent_at": sent_at, "subject": subject, "body": body, "message_id": result.get("message_id"), "thread_id": result.get("thread_id"), "error": None}})
                    await db.campaigns.update_one({"id": item["campaign_id"]}, {"$inc": {"sent_count": 1}})
                except Exception as exc:
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "failed", "error": str(exc)[:500], "sent_at": datetime.now(timezone.utc)}})
                    await db.campaigns.update_one({"id": item["campaign_id"]}, {"$inc": {"failed_count": 1}})
            active_ids = await db.campaigns.distinct("id", {"campaign_type": "rohly_template", "status": "active"})
            for campaign_id in active_ids:
                pending = await db.scheduled_emails.count_documents({"campaign_id": campaign_id, "source_type": "rohly_template", "status": {"$in": ["scheduled", "sending"]}})
                if pending == 0:
                    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"status": "completed", "next_send_at": None}})
                else:
                    nxt = await db.scheduled_emails.find_one({"campaign_id": campaign_id, "source_type": "rohly_template", "status": "scheduled"}, sort=[("scheduled_at", 1)])
                    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"next_send_at": nxt["scheduled_at"] if nxt else None}})
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        await asyncio.sleep(20)
