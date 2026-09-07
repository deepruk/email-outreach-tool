from datetime import datetime, timezone
import hashlib

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from models.scheduler import Recipient
from routers.auth import require_user

router = APIRouter(prefix="/workspace/rohly-campaign-lists", tags=["rohly-campaign-lists"], dependencies=[Depends(require_user)])


def _column(columns: list[str], *names: str) -> str | None:
    lookup = {name.strip().lower(): name for name in columns}
    for name in names:
        if name.lower() in lookup:
            return lookup[name.lower()]
    return None


@router.get("")
async def list_recipient_lists() -> list[dict]:
    rows = await db.csv_sources.find({}, {"rows": 0}).sort("uploaded_at", -1).to_list(100)
    return [
        {
            "id": row["id"],
            "filename": row["filename"],
            "row_count": row.get("row_count", 0),
            "columns": row.get("columns", []),
            "uploaded_at": row.get("uploaded_at"),
        }
        for row in rows
    ]


@router.post("/{source_id}/use")
async def use_recipient_list(source_id: str) -> dict:
    row = await db.csv_sources.find_one({"id": source_id})
    if not row:
        raise HTTPException(status_code=404, detail="Recipient list not found")

    columns = row.get("columns", [])
    email_column = _column(columns, "email", "email_address", "e-mail", "contact_email")
    if not email_column:
        raise HTTPException(status_code=422, detail="This list does not have an email column")
    name_column = _column(columns, "name", "full_name", "contact_name")
    first_column = _column(columns, "first_name", "first name", "firstname", "first")
    last_column = _column(columns, "last_name", "last name", "lastname", "last")
    company_column = _column(columns, "company", "company_name", "company name", "organization")

    recipient_ids: list[str] = []
    now = datetime.now(timezone.utc)
    seen: set[str] = set()
    for source_row in row.get("rows", []):
        email = str(source_row.get(email_column, "") or "").strip().lower()
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)
        if name_column:
            name = str(source_row.get(name_column, "") or "").strip()
        else:
            first = str(source_row.get(first_column, "") or "").strip() if first_column else ""
            last = str(source_row.get(last_column, "") or "").strip() if last_column else ""
            name = " ".join(part for part in (first, last) if part).strip()
        if not name:
            name = email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
        company = str(source_row.get(company_column, "") or "").strip() if company_column else ""
        recipient_id = hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]
        recipient = Recipient(id=recipient_id, name=name, email=email, company=company, created_at=now)
        await db.recipients.update_one({"id": recipient_id}, {"$set": recipient.model_dump()}, upsert=True)
        recipient_ids.append(recipient_id)

    if not recipient_ids:
        raise HTTPException(status_code=422, detail="No valid email addresses were found in this list")
    return {"source_id": source_id, "filename": row["filename"], "recipient_ids": recipient_ids, "count": len(recipient_ids)}
