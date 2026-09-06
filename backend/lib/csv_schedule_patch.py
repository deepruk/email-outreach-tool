from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from models.csv_campaign import CsvCampaignCreate
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

    min_gap = timedelta(minutes=input.min_gap_minutes)
    for inbox_id, items in by_inbox.items():
        items.sort(key=lambda item: item.scheduled_at)
        last_by_day = {}
        for item in items:
            local = _move(item.scheduled_at, start, end, zone, days)
            while True:
                day_key = local.date().isoformat()
                count = last_by_day.get(day_key, 0)
                previous = last_by_day.get(("last", inbox_id))
                if previous is not None and local - previous < min_gap:
                    local = _move(previous + min_gap, start, end, zone, days)
                    continue
                if count >= inbox_limits[inbox_id]:
                    local = _move(datetime.combine(local.date() + timedelta(days=1), start, zone), start, end, zone, days)
                    continue
                break
            last_by_day[day_key] = count + 1
            last_by_day[("last", inbox_id)] = local
            item.scheduled_at = local.astimezone(timezone.utc)

    return scheduled, skipped


csv.build_edit_schedule = build_edit_schedule_with_window
