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
from models.auth import UserPublic
from routers.scheduler import send_gmail_message
from routers.open_tracking import tracked_send_gmail_message
from lib.campaign_events import emit_campaign_event

router = APIRouter(prefix="/workspace/rohly-campaigns", tags=["rohly-campaigns"], dependencies=[Depends(require_user)])


class Step(BaseModel):
    template_id: str
    label: str = "Initial email"
    delay_days: int = Field(default=0, ge=0, le=365)
    variant_template_ids: list[str] = []


class TestRunRequest(BaseModel):
    inbox_id: str
    recipient_email: str
    subject: str
    body: str


class CampaignStatusRequest(BaseModel):
    status: str


class CampaignScheduleUpdate(BaseModel):
    timezone: str
    min_gap_minutes: int = Field(default=10, ge=1, le=1440)
    max_gap_minutes: int = Field(default=20, ge=1, le=1440)
    sending_window_start: str
    sending_window_end: str
    sending_days: list[int]


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
    stop_on_reply: bool = True
    follow_up_priority: int = Field(default=100, ge=0, le=100)
    distribution_mode: str = "pattern"
    open_tracking: bool = True
    click_tracking: bool = False
    unsubscribe_enabled: bool = True
    stop_on_open: bool = False
    stop_on_click: bool = False
    bounce_auto_pause_rate: float = Field(default=5.0, ge=0, le=100)
    webhook_url: str = ""
    webhook_events: list[str] = ["sent", "opened", "clicked", "replied", "bounced", "unsubscribed", "campaign_completed"]


class CampaignFeatureUpdate(BaseModel):
    open_tracking: bool = True
    click_tracking: bool = False
    unsubscribe_enabled: bool = True
    stop_on_reply: bool = True
    stop_on_open: bool = False
    stop_on_click: bool = False
    bounce_auto_pause_rate: float = Field(default=5.0, ge=0, le=100)
    webhook_url: str = ""
    webhook_events: list[str] = []


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


def _schedule_events(campaign_id: str, campaign_name: str, recipients: list[dict], inbox_ids: list[str], steps: list[dict], timezone_name: str, min_gap: int, max_gap: int, window_start: str, window_end: str, sending_days: list[int], distribution_mode: str) -> list[dict]:
    tz = ZoneInfo(timezone_name)
    start = _clock(window_start)
    end = _clock(window_end)
    days = set(sending_days)
    if start >= end:
        raise HTTPException(status_code=422, detail="Working-hours start must be before end")
    if not days:
        raise HTTPException(status_code=422, detail="Select at least one working day")
    if distribution_mode not in {"pattern", "random"}:
        raise HTTPException(status_code=422, detail="Distribution mode must be pattern or random")
    now = datetime.now(timezone.utc).astimezone(tz)
    next_initial = {inbox_id: _working(now, days, start, end) for inbox_id in inbox_ids}
    events: list[dict] = []
    for index, recipient in enumerate(recipients):
        if distribution_mode == "random":
            inbox_id = random.Random(f"{campaign_id}:{recipient['id']}:inbox").choice(inbox_ids)
        else:
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
                "template_id": (
                    [step["template_id"], *step.get("variant_template_ids", [])][
                        random.Random(f"{campaign_id}:{recipient['id']}:step:{step_index}:variant").randrange(
                            len([step["template_id"], *step.get("variant_template_ids", [])])
                        )
                    ]
                ),
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


@router.get("/campaigns")
async def list_campaigns(user: UserPublic = Depends(require_user)) -> list[dict]:
    rows = await db.campaigns.find({"campaign_type": "rohly_template", "user_id": user.id}).sort("created_at", -1).to_list(1000)
    for row in rows:
        row.pop("_id", None)
    return rows


@router.get("/templates")
async def templates(user: UserPublic = Depends(require_user)) -> list[dict]:
    return await db.templates.find({"user_id": user.id}).sort("created_at", -1).to_list(1000)


@router.get("/recipients")
async def recipients(user: UserPublic = Depends(require_user)) -> list[dict]:
    return await db.recipients.find({"user_id": user.id}).sort("created_at", -1).to_list(5000)


@router.get("/inboxes")
async def inboxes(user: UserPublic = Depends(require_user)) -> list[dict]:
    return await db.inboxes.find({"status": "connected", "user_id": user.id}).sort("email", 1).to_list(1000)


class DraftCreate(BaseModel):
    id: str | None = None
    name: str = "Rohly outreach campaign"
    active_step: int = 0
    selected_recipients: list[str] = []
    selected_inboxes: list[str] = []
    selected_lists: list[str] = []
    list_recipient_map: dict[str, list[str]] = {}
    steps: list[dict] = []
    timezone: str = "Asia/Kolkata"
    min_gap_minutes: int = 10
    max_gap_minutes: int = 20
    sending_window_start: str = "09:00"
    sending_window_end: str = "18:00"
    sending_days: list[int] = [0, 1, 2, 3, 4]
    stop_on_reply: bool = True
    follow_up_priority: int = 100
    distribution_mode: str = "pattern"
    open_tracking: bool = True
    click_tracking: bool = False
    unsubscribe_enabled: bool = True
    stop_on_open: bool = False
    stop_on_click: bool = False
    bounce_auto_pause_rate: float = 5.0
    webhook_url: str = ""
    webhook_events: list[str] = []


@router.get("/drafts")
async def list_drafts(user: UserPublic = Depends(require_user)) -> list[dict]:
    return await db.rohly_drafts.find({"user_id": user.id}).sort("updated_at", -1).to_list(1000)


@router.get("/drafts/{draft_id}")
async def get_draft(draft_id: str, user: UserPublic = Depends(require_user)) -> dict:
    draft = await db.rohly_drafts.find_one({"id": draft_id, "user_id": user.id})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    draft.pop("_id", None)
    return draft


@router.post("/drafts")
async def save_draft(input: DraftCreate, user: UserPublic = Depends(require_user)) -> dict:
    draft_id = input.id or uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    draft = {
        "id": draft_id,
        "name": input.name.strip() or "Rohly outreach campaign",
        "active_step": input.active_step,
        "selected_recipients": list(dict.fromkeys(input.selected_recipients)),
        "selected_inboxes": list(dict.fromkeys(input.selected_inboxes)),
        "selected_lists": list(dict.fromkeys(input.selected_lists)),
        "list_recipient_map": input.list_recipient_map,
        "steps": input.steps,
        "timezone": input.timezone,
        "min_gap_minutes": input.min_gap_minutes,
        "max_gap_minutes": input.max_gap_minutes,
        "sending_window_start": input.sending_window_start,
        "sending_window_end": input.sending_window_end,
        "sending_days": input.sending_days,
        "stop_on_reply": input.stop_on_reply,
        "follow_up_priority": input.follow_up_priority,
        "distribution_mode": input.distribution_mode,
        "open_tracking": input.open_tracking,
        "click_tracking": input.click_tracking,
        "unsubscribe_enabled": input.unsubscribe_enabled,
        "stop_on_open": input.stop_on_open,
        "stop_on_click": input.stop_on_click,
        "bounce_auto_pause_rate": input.bounce_auto_pause_rate,
        "webhook_url": input.webhook_url,
        "webhook_events": input.webhook_events,
        "updated_at": now,
        "created_at": now,
        "user_id": user.id,
    }
    await db.rohly_drafts.update_one(
        {"id": draft_id, "user_id": user.id},
        {"$set": {k: v for k, v in draft.items() if k != "created_at"}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    draft.pop("_id", None)
    return draft


@router.delete("/drafts/{draft_id}", status_code=204)
async def delete_draft(draft_id: str, user: UserPublic = Depends(require_user)):
    await db.rohly_drafts.delete_one({"id": draft_id, "user_id": user.id})
    return None


@router.post("/test-run")
async def test_run(input: TestRunRequest, user: UserPublic = Depends(require_user)) -> dict:
    recipient_email = input.recipient_email.strip()
    if "@" not in recipient_email or recipient_email.startswith("@") or recipient_email.endswith("@"):
        raise HTTPException(status_code=422, detail="Enter a valid test recipient email")

    inbox = await db.inboxes.find_one({"id": input.inbox_id, "status": "connected", "user_id": user.id})
    if not inbox:
        raise HTTPException(status_code=404, detail="Connected sending inbox not found")

    subject = input.subject.strip()
    body = input.body.strip()
    if not subject or not body:
        raise HTTPException(status_code=422, detail="Subject and body are required for the test")

    try:
        if inbox.get("is_mocked", True):
            result = {"message_id": None, "thread_id": None}
            mode = "mocked"
        else:
            result = await send_gmail_message(input.inbox_id, recipient_email, subject, body)
            mode = "gmail"
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Test email failed: {str(exc)[:240]}") from exc

    await db.activities.insert_one({
        "message": "Campaign test run completed",
        "detail": f"Test sent to {recipient_email} via {inbox.get('email', '')}",
        "tone": "success",
        "time": datetime.now(timezone.utc),
        "user_id": user.id,
    })
    return {
        "success": True,
        "mode": mode,
        "recipient_email": recipient_email,
        "inbox_email": inbox.get("email", ""),
        "message_id": result.get("message_id"),
    }


@router.post("")
async def create_campaign(input: CampaignCreate, user: UserPublic = Depends(require_user)) -> dict:
    try:
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

        inbox_ids = list(dict.fromkeys(input.inbox_ids))
        recipient_ids = list(dict.fromkeys(input.recipient_ids))
        template_ids = [step.template_id for step in input.steps]

        try:
            inboxes = await db.inboxes.find({"id": {"$in": inbox_ids}, "status": "connected", "user_id": user.id}).to_list(1000)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not read sending inboxes: {str(exc)[:300]}") from exc
        if len(inboxes) != len(inbox_ids):
            missing = sorted(set(inbox_ids) - {row.get("id") for row in inboxes})
            raise HTTPException(status_code=404, detail=f"One or more connected inboxes were not found: {', '.join(missing[:3])}")

        try:
            recipients = await db.recipients.find({"id": {"$in": recipient_ids}, "user_id": user.id}).to_list(5000)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not read campaign leads: {str(exc)[:300]}") from exc
        if len(recipients) != len(recipient_ids):
            missing = sorted(set(recipient_ids) - {row.get("id") for row in recipients})
            raise HTTPException(status_code=404, detail=f"One or more recipients were not found: {', '.join(missing[:3])}")

        try:
            templates = await db.templates.find({"id": {"$in": template_ids}, "user_id": user.id}).to_list(1000)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not read sequence templates: {str(exc)[:300]}") from exc
        found = {row.get("id") for row in templates}
        missing_templates = [template_id for template_id in template_ids if template_id not in found]
        if missing_templates:
            raise HTTPException(status_code=404, detail=f"One or more selected templates were not found: {', '.join(missing_templates[:3])}")

        campaign_id = uuid.uuid4().hex
        campaign = {
            "id": campaign_id,
            "name": input.name.strip(),
            "campaign_type": "rohly_template",
            "source": "Rohly Template",
            "inbox_id": inbox_ids[0],
            "inbox_ids": inbox_ids,
            "template_id": template_ids[0],
            "recipient_ids": recipient_ids,
            "steps": [step.model_dump() for step in input.steps],
            "total_count": len(recipient_ids),
            "sent_count": 0,
            "failed_count": 0,
            "status": "queued",
            "min_gap_minutes": input.min_gap_minutes,
            "max_gap_minutes": input.max_gap_minutes,
            "sending_window_start": input.sending_window_start,
            "sending_window_end": input.sending_window_end,
            "sending_days": input.sending_days,
            "timezone": input.timezone,
            "stop_on_reply": input.stop_on_reply,
            "follow_up_priority": input.follow_up_priority,
            "distribution_mode": input.distribution_mode,
            "next_send_at": None,
            "created_at": datetime.now(timezone.utc),
            "launched_at": None,
            "user_id": user.id,
        }
        try:
            result = await db.campaigns.insert_one(campaign)
            if not result.acknowledged:
                raise RuntimeError("MongoDB did not acknowledge the campaign insert")
        except HTTPException:
            raise
        except Exception as exc:
            import logging
            logging.getLogger(__name__).exception("Rohly campaign insert failed")
            raise HTTPException(status_code=500, detail=f"Could not create campaign record: {type(exc).__name__}: {str(exc)[:500]}") from exc
        # Motor/PyMongo adds an ObjectId _id to the inserted dict in-place.
        # Remove it before returning because FastAPI cannot JSON-encode ObjectId.
        campaign.pop("_id", None)
        return campaign
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create campaign: {type(exc).__name__}: {str(exc)[:400]}") from exc


@router.post("/{campaign_id}/launch")
async def launch_campaign(campaign_id: str, user: UserPublic = Depends(require_user)) -> dict:
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template", "user_id": user.id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if campaign.get("status") in {"active", "completed"}:
        raise HTTPException(status_code=409, detail="Campaign is already launched")
    recipients = await db.recipients.find({"id": {"$in": campaign["recipient_ids"]}, "user_id": user.id}).to_list(5000)
    if len(recipients) != len(set(campaign["recipient_ids"])):
        raise HTTPException(status_code=409, detail="One or more selected recipients no longer exist")

    try:
        events = _schedule_events(campaign["id"], campaign["name"], recipients, campaign["inbox_ids"], campaign["steps"], campaign.get("timezone", "Asia/Kolkata"), campaign["min_gap_minutes"], campaign["max_gap_minutes"], campaign.get("sending_window_start", "09:00"), campaign.get("sending_window_end", "18:00"), campaign.get("sending_days", [0, 1, 2, 3, 4]), campaign.get("distribution_mode", "pattern"))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not schedule campaign: {str(exc)[:240]}") from exc

    await db.scheduled_emails.delete_many({"campaign_id": campaign_id, "source_type": "rohly_template", "user_id": user.id})
    if events:
        for event in events:
            event["user_id"] = user.id
        try:
            await db.scheduled_emails.insert_many(events)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not save campaign schedule: {str(exc)[:240]}") from exc
    now = datetime.now(timezone.utc)
    first_at = min(event["scheduled_at"] for event in events) if events else now
    try:
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "active", "launched_at": now, "next_send_at": first_at, "emails_scheduled": len(events)}},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not activate campaign: {str(exc)[:400]}") from exc
    response_campaign = {**campaign, "status": "active", "launched_at": now, "next_send_at": first_at, "emails_scheduled": len(events)}
    # MongoDB adds an ObjectId _id to fetched documents; never expose it through JSON.
    response_campaign.pop("_id", None)
    return response_campaign


@router.patch("/{campaign_id}/features")
async def update_campaign_features(campaign_id: str, input: CampaignFeatureUpdate, user: UserPublic = Depends(require_user)) -> dict:
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template", "user_id": user.id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if input.webhook_url and not input.webhook_url.startswith(("https://", "http://")):
        raise HTTPException(status_code=422, detail="Webhook URL must start with http:// or https://")
    allowed = {"sent", "opened", "clicked", "replied", "bounced", "unsubscribed", "campaign_completed"}
    if any(event not in allowed for event in input.webhook_events):
        raise HTTPException(status_code=422, detail="Unsupported webhook event")
    updates = input.model_dump()
    await db.campaigns.update_one({"id": campaign_id, "user_id": user.id}, {"$set": updates})
    campaign.update(updates)
    campaign.pop("_id", None)
    return campaign


@router.patch("/{campaign_id}/status")
async def update_campaign_status(campaign_id: str, input: CampaignStatusRequest, user: UserPublic = Depends(require_user)) -> dict:
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template", "user_id": user.id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if input.status not in {"active", "paused", "stopped"}:
        raise HTTPException(status_code=422, detail="Status must be active, paused, or stopped")
    if campaign.get("status") == "completed":
        raise HTTPException(status_code=409, detail="Completed campaigns cannot be resumed")
    await db.campaigns.update_one({"id": campaign_id, "user_id": user.id}, {"$set": {"status": input.status}})
    if input.status == "stopped":
        await db.scheduled_emails.update_many(
            {"campaign_id": campaign_id, "source_type": "rohly_template", "user_id": user.id, "status": "scheduled"},
            {"$set": {"status": "cancelled", "error": "Campaign stopped by user"}},
        )
    campaign["status"] = input.status
    campaign.pop("_id", None)
    return campaign


@router.patch("/{campaign_id}/schedule")
async def update_campaign_schedule(campaign_id: str, input: CampaignScheduleUpdate, user: UserPublic = Depends(require_user)) -> dict:
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template", "user_id": user.id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if campaign.get("status") in {"stopped", "completed"}:
        raise HTTPException(status_code=409, detail="Stopped or completed campaigns cannot be rescheduled")
    if input.min_gap_minutes > input.max_gap_minutes:
        raise HTTPException(status_code=422, detail="Minimum gap cannot exceed maximum gap")
    try:
        ZoneInfo(input.timezone)
        _clock(input.sending_window_start)
        _clock(input.sending_window_end)
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=422, detail="Choose a valid timezone") from exc
    if _clock(input.sending_window_start) >= _clock(input.sending_window_end):
        raise HTTPException(status_code=422, detail="Working-hours start must be before end")
    if not input.sending_days or any(day < 0 or day > 6 for day in input.sending_days):
        raise HTTPException(status_code=422, detail="Select valid working days")

    recipients = await db.recipients.find({"id": {"$in": campaign["recipient_ids"]}, "user_id": user.id}).to_list(5000)
    protected = await db.scheduled_emails.find({
        "campaign_id": campaign_id, "source_type": "rohly_template", "user_id": user.id,
        "$or": [{"status": {"$in": ["sent", "failed", "sending"]}}, {"replied_at": {"$ne": None}}],
    }).to_list(10000)
    protected_keys = {(row.get("recipient_id"), row.get("step_index")) for row in protected}
    next_campaign = {**campaign, **input.model_dump()}
    events = _schedule_events(
        campaign_id, campaign["name"], recipients, campaign["inbox_ids"], campaign["steps"], input.timezone,
        input.min_gap_minutes, input.max_gap_minutes, input.sending_window_start, input.sending_window_end,
        input.sending_days, campaign.get("distribution_mode", "pattern"),
    )
    future = [event for event in events if (event.get("recipient_id"), event.get("step_index")) not in protected_keys]
    await db.scheduled_emails.delete_many({
        "campaign_id": campaign_id, "source_type": "rohly_template", "user_id": user.id,
        "status": {"$in": ["scheduled", "cancelled"]},
    })
    for event in future:
        event["user_id"] = user.id
    if future:
        await db.scheduled_emails.insert_many(future)
    first_at = min((event["scheduled_at"] for event in future), default=None)
    updates = {**input.model_dump(), "next_send_at": first_at, "emails_scheduled": len(future)}
    await db.campaigns.update_one({"id": campaign_id, "user_id": user.id}, {"$set": updates})
    next_campaign.update(updates)
    next_campaign.pop("_id", None)
    return next_campaign


@router.get("/{campaign_id}/activity")
async def campaign_activity(campaign_id: str, user: UserPublic = Depends(require_user)) -> list[dict]:
    rows = await db.scheduled_emails.find({"campaign_id": campaign_id, "source_type": "rohly_template", "user_id": user.id}).sort("scheduled_at", 1).to_list(5000)
    for row in rows:
        row.pop("_id", None)
    return rows


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(campaign_id: str, user: UserPublic = Depends(require_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "campaign_type": "rohly_template", "user_id": user.id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Rohly campaign not found")
    if campaign.get("status") == "active":
        raise HTTPException(status_code=409, detail="Pause or stop the campaign before deleting it")
    await db.scheduled_emails.delete_many({"campaign_id": campaign_id, "source_type": "rohly_template", "user_id": user.id})
    await db.campaigns.delete_one({"id": campaign_id, "user_id": user.id})
    return None


async def process_template_campaigns() -> None:
    while True:
        try:
            due = await db.scheduled_emails.find({"source_type": "rohly_template", "status": "scheduled", "scheduled_at": {"$lte": datetime.now(timezone.utc)}}).sort("scheduled_at", 1).to_list(100)
            campaign_cache: dict[str, dict] = {}
            for item in due:
                campaign = campaign_cache.get(item["campaign_id"])
                if campaign is None:
                    campaign = await db.campaigns.find_one({"id": item["campaign_id"], "campaign_type": "rohly_template"})
                    campaign_cache[item["campaign_id"]] = campaign or {}
            def priority_key(item: dict) -> tuple:
                campaign = campaign_cache.get(item["campaign_id"], {})
                priority = int(campaign.get("follow_up_priority", 100))
                is_follow_up = int(item.get("step_index", 0) > 0)
                follow_rank = 0 if (is_follow_up and priority > 0) else 1
                return (item.get("scheduled_at"), follow_rank if priority >= 50 else (1 - follow_rank))
            due.sort(key=priority_key)
            for item in due:
                claimed = await db.scheduled_emails.update_one({"id": item["id"], "status": "scheduled"}, {"$set": {"status": "sending"}})
                if claimed.modified_count != 1:
                    continue
                campaign = await db.campaigns.find_one({"id": item["campaign_id"], "campaign_type": "rohly_template"})
                if not campaign or campaign.get("status") != "active":
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "cancelled"}})
                    continue
                recipient = await db.recipients.find_one({"id": item["recipient_id"]})
                if recipient:
                    suppressed = await db.suppressions.find_one({"user_id": campaign.get("user_id"), "email": recipient.get("email", "").strip().lower()})
                    if suppressed:
                        await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "cancelled", "error": "Lead is on the suppression list"}})
                        await db.scheduled_emails.update_many({"campaign_id": item["campaign_id"], "recipient_id": item["recipient_id"], "status": "scheduled"}, {"$set": {"status": "cancelled", "error": "Lead is on the suppression list"}})
                        continue
                template = await db.templates.find_one({"id": item["template_id"]})
                inbox = await db.inboxes.find_one({"id": item["inbox_id"]})
                if not recipient or not template or not inbox:
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "failed", "error": "Recipient, template, or inbox no longer exists"}})
                    continue
                if item.get("step_index", 0) > 0 and campaign.get("stop_on_reply", True):
                    replied = await db.replies.find_one({
                        "campaign_id": item["campaign_id"],
                        "recipient_email": recipient["email"],
                    })
                    if replied:
                        await db.scheduled_emails.update_one(
                            {"id": item["id"]},
                            {"$set": {"status": "cancelled", "error": "Cancelled because the lead replied"}},
                        )
                        await db.scheduled_emails.update_many(
                            {
                                "campaign_id": item["campaign_id"],
                                "recipient_id": item["recipient_id"],
                                "source_type": "rohly_template",
                                "status": "scheduled",
                                "step_index": {"$gt": item.get("step_index", 0)},
                            },
                            {"$set": {"status": "cancelled", "error": "Cancelled because the lead replied"}},
                        )
                        continue
                subject = _personalize(template.get("subject", ""), recipient)
                body = _personalize(template.get("body", ""), recipient)
                try:
                    result = {"message_id": None, "thread_id": None} if inbox.get("is_mocked", True) else await tracked_send_gmail_message(item["id"], item["inbox_id"], recipient["email"], subject, body)
                    sent_at = datetime.now(timezone.utc)
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "sent", "sent_at": sent_at, "subject": subject, "body": body, "message_id": result.get("message_id"), "thread_id": result.get("thread_id"), "error": None}})
                    await db.campaigns.update_one({"id": item["campaign_id"]}, {"$inc": {"sent_count": 1}})
                    await emit_campaign_event(campaign, "sent", {"scheduled_email_id": item["id"], "recipient_email": recipient["email"], "step_index": item.get("step_index", 0)})
                except Exception as exc:
                    await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"status": "failed", "error": str(exc)[:500], "sent_at": datetime.now(timezone.utc)}})
                    error_text = str(exc)[:500]
                    is_bounce = any(token in error_text.lower() for token in ["550", "551", "552", "553", "554", "recipient address rejected", "mailbox unavailable", "user unknown"])
                    increments = {"failed_count": 1}
                    if is_bounce:
                        increments["bounces"] = 1
                        await db.scheduled_emails.update_one({"id": item["id"]}, {"$set": {"bounced_at": datetime.now(timezone.utc)}})
                        await db.scheduled_emails.update_many({"campaign_id": item["campaign_id"], "recipient_id": item["recipient_id"], "status": "scheduled"}, {"$set": {"status": "cancelled", "error": "Cancelled after bounce"}})
                        await db.suppressions.update_one({"user_id": campaign.get("user_id"), "email": recipient["email"].strip().lower()}, {"$set": {"reason": "bounced", "updated_at": datetime.now(timezone.utc)}, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}}, upsert=True)
                        await emit_campaign_event(campaign, "bounced", {"scheduled_email_id": item["id"], "recipient_email": recipient["email"], "error": error_text})
                    await db.campaigns.update_one({"id": item["campaign_id"]}, {"$inc": increments})
                    if is_bounce:
                        refreshed = await db.campaigns.find_one({"id": item["campaign_id"]})
                        sent_total = max(1, int((refreshed or {}).get("sent_count", 0)) + int((refreshed or {}).get("failed_count", 0)))
                        bounce_rate = (int((refreshed or {}).get("bounces", 0)) / sent_total) * 100
                        threshold = float((refreshed or {}).get("bounce_auto_pause_rate", 5.0))
                        if threshold > 0 and sent_total >= 10 and bounce_rate >= threshold:
                            await db.campaigns.update_one({"id": item["campaign_id"]}, {"$set": {"status": "paused", "auto_paused_reason": f"Bounce rate {bounce_rate:.1f}% reached safety threshold {threshold:.1f}%"}})
            active_ids = await db.campaigns.distinct("id", {"campaign_type": "rohly_template", "status": "active"})
            for campaign_id in active_ids:
                pending = await db.scheduled_emails.count_documents({"campaign_id": campaign_id, "source_type": "rohly_template", "status": {"$in": ["scheduled", "sending"]}})
                if pending == 0:
                    completed_campaign = await db.campaigns.find_one({"id": campaign_id})
                    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"status": "completed", "next_send_at": None}})
                    if completed_campaign:
                        await emit_campaign_event(completed_campaign, "campaign_completed", {"campaign_id": campaign_id})
                else:
                    nxt = await db.scheduled_emails.find_one({"campaign_id": campaign_id, "source_type": "rohly_template", "status": "scheduled"}, sort=[("scheduled_at", 1)])
                    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"next_send_at": nxt["scheduled_at"] if nxt else None}})
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        await asyncio.sleep(20)
