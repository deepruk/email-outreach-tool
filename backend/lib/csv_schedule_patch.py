from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Response

from models.csv_campaign import CsvCampaign, CsvCampaignCreate, CsvCampaignLaunchResponse
from routers import csv_campaigns as csv
from lib.db import db


def _clock(value: str, label: str) -> time:
    try:
        hour, minute = [int(part) for part in value.split(":", 1)]
        return time(hour, minute)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {label}: use HH:MM") from exc


def _move(value: datetime, start: time, end: time, zone: ZoneInfo, days: set[int]) -> datetime:
    current = value.astimezone(zone)
    for _ in range(8):
        if current.weekday() not in days:
            current = datetime.combine(current.date() + timedelta(days=1), start, zone)
            continue
        day_start = datetime.combine(current.date(), start, zone)
        day_end = datetime.combine(current.date(), end, zone)
        if current < day_start:
            return day_start
        if current <= day_end:
            return current
        current = datetime.combine(current.date() + timedelta(days=1), start, zone)
    raise HTTPException(status_code=422, detail="At least one working day must be enabled")


_original_build = csv.build_edit_schedule


async def build_edit_schedule_with_window(campaign_id: str, input: CsvCampaignCreate):
    scheduled, skipped = await _original_build(campaign_id, input)
    zone = ZoneInfo(input.timezone)
    start = _clock(input.sending_window_start, "working-hours start")
    end = _clock(input.sending_window_end, "working-hours end")
    days = set(input.sending_days)
    if start >= end:
        raise HTTPException(status_code=422, detail="Working-hours start must be before the end time")
    if not days:
        raise HTTPException(status_code=422, detail="Select at least one working day")

    by_inbox = defaultdict(list)
    for item in scheduled:
        by_inbox[item.inbox_id].append(item)

    inbox_limits = {}
    for inbox_id in by_inbox:
        row = await db.inboxes.find_one({"id": inbox_id})
        inbox_limits[inbox_id] = int((row or {}).get("daily_sending_limit", 100))

    # Enforce the configured random gap between every consecutive email from
    # the same inbox. This prevents emails from being scheduled 1-2 minutes
    # apart when their base sequence times are identical.
    for inbox_id, items in by_inbox.items():
        items.sort(key=lambda item: item.scheduled_at)
        daily_count: dict[str, int] = {}
        previous: datetime | None = None

        for item in items:
            local = _move(item.scheduled_at, start, end, zone, days)

            if previous is not None:
                gap_seed = f"{campaign_id}:{inbox_id}:{item.step_key}:{item.row_index}"
                gap_minutes = __import__("random").Random(gap_seed).randint(
                    input.min_gap_minutes,
                    input.max_gap_minutes,
                )
                earliest = previous + timedelta(minutes=gap_minutes)
                if local < earliest:
                    local = _move(earliest, start, end, zone, days)

            while True:
                day_key = local.date().isoformat()
                count = daily_count.get(day_key, 0)
                if count < inbox_limits[inbox_id]:
                    break
                local = _move(
                    datetime.combine(local.date() + timedelta(days=1), start, zone),
                    start,
                    end,
                    zone,
                    days,
                )

            daily_count[local.date().isoformat()] = daily_count.get(local.date().isoformat(), 0) + 1
            previous = local
            item.scheduled_at = local.astimezone(timezone.utc)

    return scheduled, skipped


csv.build_edit_schedule = build_edit_schedule_with_window


async def launch_campaign_with_saved_schedule(campaign_id: str) -> CsvCampaignLaunchResponse:
    campaign_row = await db.csv_campaigns.find_one({"id": campaign_id})
    if not campaign_row:
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    campaign = CsvCampaign(**campaign_row)
    if campaign.status != "draft":
        raise HTTPException(status_code=409, detail="Campaign has already been launched")
    configuration = CsvCampaignCreate(
        name=campaign.name,
        source_id=campaign.source_id,
        email_column=campaign.email_column,
        first_name_column=campaign.first_name_column,
        company_column=campaign.company_column,
        status_column=campaign.status_column,
        inbox_ids=campaign.inbox_ids,
        steps=campaign.steps,
        timezone=campaign.timezone,
        min_gap_minutes=campaign.min_gap_minutes,
        max_gap_minutes=campaign.max_gap_minutes,
        sending_window_start=campaign.sending_window_start,
        sending_window_end=campaign.sending_window_end,
        sending_days=campaign.sending_days,
    )
    scheduled, skipped = await csv.build_edit_schedule(campaign.id, configuration)
    if not scheduled:
        raise HTTPException(status_code=422, detail="No complete emails are available to schedule")
    await db.scheduled_emails.insert_many([item.model_dump() for item in scheduled])
    launched_at = datetime.now(timezone.utc)
    updates = {
        "status": "running",
        "launched_at": launched_at,
        "emails_scheduled": len(scheduled),
        "follow_ups_scheduled": sum(1 for item in scheduled if item.step_key != campaign.steps[0].key),
    }
    await db.csv_campaigns.update_one({"id": campaign.id}, {"$set": updates})
    return CsvCampaignLaunchResponse(
        campaign=CsvCampaign(**{**campaign.model_dump(), **updates}),
        scheduled_count=len(scheduled),
        skipped_count=skipped,
    )


csv.launch_campaign = launch_campaign_with_saved_schedule
for route in csv.router.routes:
    if getattr(route, "path", None) == "/campaigns/{campaign_id}/launch" and "POST" in getattr(route, "methods", set()):
        route.endpoint = launch_campaign_with_saved_schedule


async def delete_campaign(campaign_id: str) -> Response:
    campaign = await db.csv_campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    if campaign.get("status") == "running":
        raise HTTPException(status_code=409, detail="Pause or stop the campaign before deleting it")

    await db.scheduled_emails.delete_many({"campaign_id": campaign_id})
    await db.csv_campaigns.delete_one({"id": campaign_id})
    return Response(status_code=204)


csv.router.add_api_route(
    "/campaigns/{campaign_id}",
    delete_campaign,
    methods=["DELETE"],
    status_code=204,
    response_class=Response,
)
