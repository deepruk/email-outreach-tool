import asyncio
import csv
import random
from datetime import datetime, time, timedelta, timezone
from io import StringIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from lib.db import db
from models.csv_campaign import (
    CampaignStatusRequest,
    CampaignEditImpact,
    CampaignEditResult,
    CsvCampaign,
    CsvCampaignCreate,
    CsvCampaignLaunchResponse,
    CsvCampaignPreview,
    CsvCampaignPreviewLead,
    CsvSource,
    CsvSourceDeriveRequest,
    CsvSourceSummary,
    ScheduledEmail,
)
from models.scheduler import Inbox
from routers.scheduler import send_gmail_message
from routers.auth import require_user

router = APIRouter(prefix="/csv", tags=["csv-campaigns"], dependencies=[Depends(require_user)])


def clean_row(row: dict[str | None, str | None], columns: list[str]) -> dict[str, str]:
    return {column: (row.get(column) or "") for column in columns}


def validate_column(columns: list[str], column: str | None, label: str, required: bool = True) -> None:
    if required and not column:
        raise HTTPException(status_code=422, detail=f"Map the {label} column")
    if column and column not in columns:
        raise HTTPException(status_code=422, detail=f"Mapped {label} column no longer exists")


def preview_from_source(source: CsvSource, input: CsvCampaignCreate, limit: int = 5) -> CsvCampaignPreview:
    for column, label, required in [
        (input.email_column, "recipient email", True),
        (input.first_name_column, "first name", False),
        (input.company_column, "company", False),
        (input.status_column, "status", False),
    ]:
        validate_column(source.columns, column, label, required)
    for step in input.steps:
        validate_column(source.columns, step.subject_column, f"{step.label} subject")
        validate_column(source.columns, step.body_column, f"{step.label} body")

    leads: list[CsvCampaignPreviewLead] = []
    valid_count = 0
    skipped_count = 0
    for index, row in enumerate(source.rows, start=2):
        email = row.get(input.email_column, "").strip()
        step_values = [
            {
                "key": step.key,
                "label": step.label,
                "subject": row.get(step.subject_column, ""),
                "body": row.get(step.body_column, ""),
            }
            for step in input.steps
        ]
        missing = []
        if not email or "@" not in email:
            missing.append("valid recipient email")
        for value in step_values:
            if not value["subject"]:
                missing.append(f"{value['label']} subject")
            if not value["body"]:
                missing.append(f"{value['label']} body")
        error = f"Missing {', '.join(missing)}" if missing else None
        if error:
            skipped_count += 1
        else:
            valid_count += 1
        if len(leads) < limit:
            leads.append(
                CsvCampaignPreviewLead(
                    row_index=index,
                    email=email,
                    first_name=row.get(input.first_name_column or "", ""),
                    company=row.get(input.company_column or "", ""),
                    steps=step_values,
                    error=error,
                )
            )
    return CsvCampaignPreview(leads=leads, valid_count=valid_count, skipped_count=skipped_count)


async def build_edit_schedule(campaign_id: str, input: CsvCampaignCreate) -> tuple[list[ScheduledEmail], int]:
    source_row = await db.csv_sources.find_one({"id": input.source_id})
    if not source_row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    source = CsvSource(**source_row)
    preview = preview_from_source(source, input, limit=0)
    inbox_rows = await db.inboxes.find({"id": {"$in": input.inbox_ids}, "status": "connected"}).to_list(100)
    inbox_lookup = {row["id"]: Inbox(**row) for row in inbox_rows}
    inboxes = [inbox_lookup[inbox_id] for inbox_id in input.inbox_ids if inbox_id in inbox_lookup]
    if len(inboxes) != len(set(input.inbox_ids)):
        raise HTTPException(status_code=422, detail="Select connected inboxes only")
    try:
        zone = ZoneInfo(input.timezone)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Choose a valid timezone") from exc
    now_local = datetime.now(zone)
    existing_other = await db.scheduled_emails.find({
        "campaign_id": {"$ne": campaign_id},
        "inbox_id": {"$in": input.inbox_ids},
        "status": {"$nin": ["cancelled", "skipped"]},
    }).to_list(100000)
    usage: dict[tuple[str, str], int] = {}
    for item in existing_other:
        value = item.get("scheduled_at")
        if value:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            key = (item["inbox_id"], value.astimezone(zone).date().isoformat())
            usage[key] = usage.get(key, 0) + 1
    last_slots: dict[tuple[str, str], datetime] = {}
    scheduled: list[ScheduledEmail] = []
    inbox_index = 0
    for row_index, row in enumerate(source.rows, start=2):
        email = row.get(input.email_column, "").strip()
        if not email or "@" not in email:
            continue
        if any(not row.get(step.subject_column, "") or not row.get(step.body_column, "") for step in input.steps):
            continue
        for step in input.steps:
            try:
                hour, minute = [int(value) for value in step.send_time.split(":", 1)]
                base_send = datetime.combine(
                    now_local.date() + timedelta(days=step.day_offset), time(hour=hour, minute=minute), zone
                )
            except (ValueError, TypeError) as exc:
                raise HTTPException(status_code=422, detail=f"Invalid send time for {step.label}") from exc
            if step.day_offset == 0 and base_send <= now_local:
                base_send = now_local + timedelta(minutes=1)
            selected: Inbox | None = None
            selected_send = base_send
            for _ in range(len(inboxes)):
                candidate = inboxes[inbox_index % len(inboxes)]
                inbox_index += 1
                previous = last_slots.get((candidate.id, step.key))
                deterministic_gap = random.Random(f"{campaign_id}:{candidate.id}:{step.key}:{row_index}").randint(10, 20)
                candidate_send = base_send if not previous else max(base_send, previous + timedelta(minutes=deterministic_gap))
                usage_key = (candidate.id, candidate_send.date().isoformat())
                if usage.get(usage_key, 0) < candidate.daily_sending_limit:
                    selected = candidate
                    selected_send = candidate_send
                    usage[usage_key] = usage.get(usage_key, 0) + 1
                    last_slots[(candidate.id, step.key)] = candidate_send
                    break
            if not selected:
                raise HTTPException(status_code=409, detail=f"Daily inbox limits are too low for {base_send.date().isoformat()}")
            scheduled.append(ScheduledEmail(
                campaign_id=campaign_id,
                campaign_name=input.name,
                source_id=source.id,
                row_index=row_index,
                recipient_email=email,
                first_name=row.get(input.first_name_column or "", ""),
                company=row.get(input.company_column or "", ""),
                step_key=step.key,
                step_label=step.label,
                subject=row[step.subject_column],
                body=row[step.body_column],
                inbox_id=selected.id,
                scheduled_at=selected_send.astimezone(timezone.utc),
            ))
    return scheduled, preview.skipped_count


async def calculate_edit_impact(campaign_id: str, proposed: list[ScheduledEmail], skipped: int) -> CampaignEditImpact:
    existing = await db.scheduled_emails.find({"campaign_id": campaign_id}).to_list(100000)
    protected_rows = [row for row in existing if row.get("status") in {"sent", "failed"} or row.get("replied_at")]
    future_rows = [row for row in existing if row.get("status") == "scheduled" and not row.get("replied_at")]
    protected_keys = {(row["recipient_email"].lower(), row["step_key"]) for row in protected_rows}
    existing_by_key = {(row["recipient_email"].lower(), row["step_key"]): row for row in future_rows}
    proposed_by_key = {
        (row.recipient_email.lower(), row.step_key): row
        for row in proposed
        if (row.recipient_email.lower(), row.step_key) not in protected_keys
    }
    added = len(set(proposed_by_key) - set(existing_by_key))
    removed = len(set(existing_by_key) - set(proposed_by_key))
    unchanged = 0
    rescheduled = 0
    for key in set(existing_by_key) & set(proposed_by_key):
        old = existing_by_key[key]
        new = proposed_by_key[key]
        old_time = old["scheduled_at"].replace(tzinfo=timezone.utc) if old["scheduled_at"].tzinfo is None else old["scheduled_at"]
        same = (
            old.get("subject") == new.subject
            and old.get("body") == new.body
            and old.get("inbox_id") == new.inbox_id
            and old_time == new.scheduled_at
        )
        unchanged += int(same)
        rescheduled += int(not same)
    return CampaignEditImpact(
        added=added,
        removed=removed,
        rescheduled=rescheduled,
        unchanged=unchanged,
        protected=len(protected_rows),
        skipped_leads=skipped,
        proposed_scheduled=len(proposed_by_key),
    )


@router.post("/sources", response_model=CsvSource)
async def upload_csv(file: UploadFile = File(...)) -> CsvSource:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Upload a CSV file")
    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(status_code=413, detail="CSV must be smaller than 5 MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="CSV must use UTF-8 encoding") from exc
    reader = csv.DictReader(StringIO(text))
    columns = [column.strip() for column in (reader.fieldnames or []) if column and column.strip()]
    if not columns:
        raise HTTPException(status_code=422, detail="CSV needs a header row")
    rows = [clean_row(row, columns) for row in reader]
    if not rows:
        raise HTTPException(status_code=422, detail="CSV needs at least one lead row")
    source = CsvSource(filename=file.filename, columns=columns, row_count=len(rows), rows=rows)
    await db.csv_sources.insert_one(source.model_dump())
    return source


@router.get("/sources", response_model=list[CsvSourceSummary])
async def list_sources() -> list[CsvSourceSummary]:
    rows = await db.csv_sources.find({}, {"rows": 0}).sort("uploaded_at", -1).to_list(100)
    return [CsvSourceSummary(**row) for row in rows]


@router.get("/sources/{source_id}", response_model=CsvSource)
async def get_source(source_id: str) -> CsvSource:
    row = await db.csv_sources.find_one({"id": source_id})
    if not row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    return CsvSource(**row)


@router.post("/sources/{source_id}/derive", response_model=CsvSource)
async def derive_source(source_id: str, input: CsvSourceDeriveRequest) -> CsvSource:
    row = await db.csv_sources.find_one({"id": source_id})
    if not row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    original = CsvSource(**row)
    normalized = [{column: str(item.get(column, "")) for column in original.columns} for item in input.rows]
    source = CsvSource(
        filename=f"edited-{original.filename}",
        columns=original.columns,
        row_count=len(normalized),
        rows=normalized,
    )
    await db.csv_sources.insert_one(source.model_dump())
    return source


@router.post("/campaigns/preview", response_model=CsvCampaignPreview)
async def preview_campaign(input: CsvCampaignCreate) -> CsvCampaignPreview:
    row = await db.csv_sources.find_one({"id": input.source_id})
    if not row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    return preview_from_source(CsvSource(**row), input)


@router.post("/campaigns", response_model=CsvCampaign)
async def create_campaign(input: CsvCampaignCreate) -> CsvCampaign:
    source_row = await db.csv_sources.find_one({"id": input.source_id})
    if not source_row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    source = CsvSource(**source_row)
    preview = preview_from_source(source, input)
    if preview.valid_count == 0:
        raise HTTPException(status_code=422, detail="No complete leads are available to schedule")
    inbox_count = await db.inboxes.count_documents({"id": {"$in": input.inbox_ids}, "status": "connected"})
    if inbox_count != len(set(input.inbox_ids)):
        raise HTTPException(status_code=422, detail="Select connected inboxes only")
    try:
        ZoneInfo(input.timezone)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Choose a valid timezone") from exc
    campaign = CsvCampaign(
        **input.model_dump(),
        source_filename=source.filename,
        total_leads=source.row_count,
        skipped_leads=preview.skipped_count,
    )
    await db.csv_campaigns.insert_one(campaign.model_dump())
    return campaign


@router.get("/campaigns", response_model=list[CsvCampaign])
async def list_campaigns() -> list[CsvCampaign]:
    rows = await db.csv_campaigns.find().sort("created_at", -1).to_list(500)
    return [CsvCampaign(**row) for row in rows]


@router.post("/campaigns/{campaign_id}/edit-impact", response_model=CampaignEditImpact)
async def preview_edit_impact(campaign_id: str, input: CsvCampaignCreate) -> CampaignEditImpact:
    if not await db.csv_campaigns.find_one({"id": campaign_id}):
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    proposed, skipped = await build_edit_schedule(campaign_id, input)
    return await calculate_edit_impact(campaign_id, proposed, skipped)


@router.put("/campaigns/{campaign_id}", response_model=CampaignEditResult)
async def edit_campaign(campaign_id: str, input: CsvCampaignCreate) -> CampaignEditResult:
    campaign_row = await db.csv_campaigns.find_one({"id": campaign_id})
    if not campaign_row:
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    source_row = await db.csv_sources.find_one({"id": input.source_id})
    if not source_row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    await db.csv_campaigns.update_one({"id": campaign_id}, {"$set": {"edit_lock": True}})
    try:
        proposed, skipped = await build_edit_schedule(campaign_id, input)
        impact = await calculate_edit_impact(campaign_id, proposed, skipped)
        protected = await db.scheduled_emails.find({
            "campaign_id": campaign_id,
            "$or": [{"status": {"$in": ["sent", "failed"]}}, {"replied_at": {"$ne": None}}],
        }).to_list(100000)
        protected_keys = {(row["recipient_email"].lower(), row["step_key"]) for row in protected}
        replacement = [row for row in proposed if (row.recipient_email.lower(), row.step_key) not in protected_keys]
        if campaign_row.get("status") == "draft":
            replacement = []
        await db.scheduled_emails.delete_many({"campaign_id": campaign_id, "status": "scheduled"})
        if replacement:
            await db.scheduled_emails.insert_many([row.model_dump() for row in replacement])
        updates = {
            **input.model_dump(),
            "source_filename": source_row["filename"],
            "total_leads": source_row["row_count"],
            "skipped_leads": skipped,
            "emails_scheduled": len(replacement),
            "follow_ups_scheduled": sum(1 for row in replacement if row.step_key != input.steps[0].key),
            "updated_at": datetime.now(timezone.utc),
        }
        if replacement and campaign_row.get("status") in {"stopped", "completed"}:
            updates["status"] = "paused"
        await db.csv_campaigns.update_one({"id": campaign_id}, {"$set": updates, "$unset": {"edit_lock": ""}})
        updated = CsvCampaign(**{**campaign_row, **updates})
        return CampaignEditResult(campaign=updated, impact=impact)
    except Exception:
        await db.csv_campaigns.update_one({"id": campaign_id}, {"$unset": {"edit_lock": ""}})
        raise


@router.post("/campaigns/{campaign_id}/launch", response_model=CsvCampaignLaunchResponse)
async def launch_campaign(campaign_id: str) -> CsvCampaignLaunchResponse:
    campaign_row = await db.csv_campaigns.find_one({"id": campaign_id})
    if not campaign_row:
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    campaign = CsvCampaign(**campaign_row)
    if campaign.status != "draft":
        raise HTTPException(status_code=409, detail="Campaign has already been launched")
    source_row = await db.csv_sources.find_one({"id": campaign.source_id})
    if not source_row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    source = CsvSource(**source_row)
    inbox_rows = await db.inboxes.find({"id": {"$in": campaign.inbox_ids}, "status": "connected"}).to_list(100)
    inboxes = [Inbox(**row) for row in inbox_rows]
    if not inboxes:
        raise HTTPException(status_code=422, detail="Connect at least one sending inbox")
    zone = ZoneInfo(campaign.timezone)
    now_local = datetime.now(zone)
    scheduled: list[ScheduledEmail] = []
    skipped = campaign.skipped_leads
    inbox_index = 0
    usage: dict[tuple[str, str], int] = {}
    last_slots: dict[tuple[str, str], datetime] = {}
    existing = await db.scheduled_emails.find(
        {"inbox_id": {"$in": [inbox.id for inbox in inboxes]}, "status": {"$nin": ["cancelled", "skipped"]}}
    ).to_list(100000)
    for item in existing:
        existing_at = item.get("scheduled_at")
        if existing_at:
            if existing_at.tzinfo is None:
                existing_at = existing_at.replace(tzinfo=timezone.utc)
            day_key = existing_at.astimezone(zone).date().isoformat()
            usage[(item["inbox_id"], day_key)] = usage.get((item["inbox_id"], day_key), 0) + 1
    for row_index, row in enumerate(source.rows, start=2):
        email = row.get(campaign.email_column, "").strip()
        invalid = not email or "@" not in email
        if invalid:
            continue
        for step in campaign.steps:
            subject = row.get(step.subject_column, "")
            body = row.get(step.body_column, "")
            if not subject or not body:
                invalid = True
                break
        if invalid:
            continue
        for step in campaign.steps:
            try:
                hour, minute = [int(value) for value in step.send_time.split(":", 1)]
                local_send = datetime.combine(
                    now_local.date() + timedelta(days=step.day_offset),
                    time(hour=hour, minute=minute),
                    zone,
                )
            except (ValueError, TypeError) as exc:
                raise HTTPException(status_code=422, detail=f"Invalid send time for {step.label}") from exc
            if step.day_offset == 0 and local_send <= now_local:
                local_send = now_local + timedelta(minutes=1)
            selected: Inbox | None = None
            selected_send = local_send
            for _ in range(len(inboxes)):
                candidate = inboxes[inbox_index % len(inboxes)]
                inbox_index += 1
                previous = last_slots.get((candidate.id, step.key))
                candidate_send = local_send if not previous else max(
                    local_send, previous + timedelta(minutes=random.randint(10, 20))
                )
                key = (candidate.id, candidate_send.date().isoformat())
                if usage.get(key, 0) < candidate.daily_sending_limit:
                    selected = candidate
                    selected_send = candidate_send
                    usage[key] = usage.get(key, 0) + 1
                    last_slots[(candidate.id, step.key)] = candidate_send
                    break
            if not selected:
                raise HTTPException(
                    status_code=409,
                    detail=f"Daily inbox limits are too low for {local_send.date().isoformat()}",
                )
            scheduled.append(
                ScheduledEmail(
                    campaign_id=campaign.id,
                    campaign_name=campaign.name,
                    source_id=source.id,
                    row_index=row_index,
                    recipient_email=email,
                    first_name=row.get(campaign.first_name_column or "", ""),
                    company=row.get(campaign.company_column or "", ""),
                    step_key=step.key,
                    step_label=step.label,
                    subject=row[step.subject_column],
                    body=row[step.body_column],
                    inbox_id=selected.id,
                    scheduled_at=selected_send.astimezone(timezone.utc),
                )
            )
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


@router.patch("/campaigns/{campaign_id}/status", response_model=CsvCampaign)
async def update_campaign_status(campaign_id: str, input: CampaignStatusRequest) -> CsvCampaign:
    row = await db.csv_campaigns.find_one({"id": campaign_id})
    if not row:
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    await db.csv_campaigns.update_one({"id": campaign_id}, {"$set": {"status": input.status}})
    if input.status == "stopped":
        await db.scheduled_emails.update_many(
            {"campaign_id": campaign_id, "status": "scheduled"}, {"$set": {"status": "cancelled"}}
        )
    return CsvCampaign(**{**row, "status": input.status})


@router.get("/campaigns/{campaign_id}/activity", response_model=list[ScheduledEmail])
async def campaign_activity(campaign_id: str) -> list[ScheduledEmail]:
    rows = await db.scheduled_emails.find({"campaign_id": campaign_id}).sort("scheduled_at", 1).to_list(5000)
    return [ScheduledEmail(**row) for row in rows]


@router.get("/campaigns/{campaign_id}/export")
async def export_campaign_status(campaign_id: str) -> StreamingResponse:
    campaign_row = await db.csv_campaigns.find_one({"id": campaign_id})
    if not campaign_row:
        raise HTTPException(status_code=404, detail="CSV campaign not found")
    campaign = CsvCampaign(**campaign_row)
    source_row = await db.csv_sources.find_one({"id": campaign.source_id})
    if not source_row:
        raise HTTPException(status_code=404, detail="CSV source not found")
    source = CsvSource(**source_row)
    activities = await db.scheduled_emails.find({"campaign_id": campaign_id}).to_list(100000)
    by_row: dict[int, list[dict]] = {}
    for item in activities:
        by_row.setdefault(item["row_index"], []).append(item)
    output = StringIO()
    extra_columns = ["Mailflow Campaign ID", "Mailflow Status", "Mailflow Sending Inboxes", "Mailflow Message IDs"]
    writer = csv.DictWriter(output, fieldnames=[*source.columns, *extra_columns])
    writer.writeheader()
    for row_index, source_data in enumerate(source.rows, start=2):
        events = by_row.get(row_index, [])
        statuses = [f"{item['step_label']}: {item['status']}" for item in events]
        inbox_ids = sorted({item["inbox_id"] for item in events})
        inbox_rows = await db.inboxes.find({"id": {"$in": inbox_ids}}).to_list(100) if inbox_ids else []
        inbox_lookup = {item["id"]: item["email"] for item in inbox_rows}
        writer.writerow({
            **source_data,
            "Mailflow Campaign ID": campaign.id,
            "Mailflow Status": " | ".join(statuses) or "Skipped",
            "Mailflow Sending Inboxes": " | ".join(inbox_lookup.get(value, value) for value in inbox_ids),
            "Mailflow Message IDs": " | ".join(item.get("message_id") or "" for item in events if item.get("message_id")),
        })
    output.seek(0)
    filename = f"{campaign.name.replace(' ', '-').lower()}-delivery-status.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def process_due_sends() -> None:
    while True:
        try:
            now = datetime.now(timezone.utc)
            rows = await db.scheduled_emails.find(
                {"status": "scheduled", "scheduled_at": {"$lte": now}}
            ).sort("scheduled_at", 1).to_list(20)
            for row in rows:
                campaign = await db.csv_campaigns.find_one({"id": row["campaign_id"], "status": "running", "edit_lock": {"$ne": True}})
                if not campaign:
                    continue
                claimed = await db.scheduled_emails.find_one_and_update(
                    {"id": row["id"], "status": "scheduled"}, {"$set": {"status": "sending"}}
                )
                if not claimed:
                    continue
                inbox = await db.inboxes.find_one({"id": row["inbox_id"], "status": "connected"})
                if not inbox or inbox.get("is_mocked", True):
                    await db.scheduled_emails.update_one(
                        {"id": row["id"]},
                        {"$set": {"status": "failed", "error": "Sending inbox is not connected through Gmail OAuth"}},
                    )
                    await db.csv_campaigns.update_one({"id": row["campaign_id"]}, {"$inc": {"failed_emails": 1}})
                    continue
                try:
                    send_result = await send_gmail_message(
                        row["inbox_id"], row["recipient_email"], row["subject"], row["body"]
                    )
                    await db.scheduled_emails.update_one(
                        {"id": row["id"]},
                        {"$set": {"status": "sent", "sent_at": now, **send_result}},
                    )
                    await db.csv_campaigns.update_one(
                        {"id": row["campaign_id"]}, {"$inc": {"emails_sent": 1, "emails_scheduled": -1}}
                    )
                except Exception as exc:
                    await db.scheduled_emails.update_one(
                        {"id": row["id"]}, {"$set": {"status": "failed", "error": str(exc)[:300]}}
                    )
                    await db.csv_campaigns.update_one({"id": row["campaign_id"]}, {"$inc": {"failed_emails": 1}})
                remaining = await db.scheduled_emails.count_documents(
                    {"campaign_id": row["campaign_id"], "status": {"$in": ["scheduled", "sending"]}}
                )
                if remaining == 0:
                    await db.csv_campaigns.update_one(
                        {"id": row["campaign_id"], "status": "running"}, {"$set": {"status": "completed"}}
                    )
        except Exception:
            pass
        await asyncio.sleep(30)