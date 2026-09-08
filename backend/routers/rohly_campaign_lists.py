from datetime import datetime, timezone
import hashlib

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from models.scheduler import Recipient
from routers.auth import require_user

router = APIRouter(prefix="/workspace/rohly-campaign-lists", tags=["rohly-campaign-lists"], dependencies=[Depends(require_user)])


def _normalized(value: object) -> str:
    return "".join(ch for ch in str(value or "").strip().lower() if ch.isalnum())


def _column(columns: list[str], *names: str) -> str | None:
    lookup = {_normalized(name): name for name in columns}
    for name in names:
        if _normalized(name) in lookup:
            return lookup[_normalized(name)]
    return None


def _row_value(row: dict, column: str | None) -> str:
    if not column:
        return ""
    if column in row:
        return str(row.get(column) or "").strip()
    wanted = _normalized(column)
    for key, value in row.items():
        if _normalized(key) == wanted:
            return str(value or "").strip()
    return ""


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

    columns = [str(value) for value in row.get("columns", [])]
    email_column = _column(columns, "email", "email_address", "e-mail", "contact_email", "emailaddress", "recipientemail")
    if not email_column:
        raise HTTPException(status_code=422, detail="This list does not have an email column")
    name_column = _column(columns, "name", "full_name", "contact_name", "contactname")
    first_column = _column(columns, "first_name", "first name", "firstname", "first")
    last_column = _column(columns, "last_name", "last name", "lastname", "last")
    company_column = _column(columns, "company", "company_name", "company name", "organization", "companyname")
    title_column = _column(columns, "title", "job_title", "job title", "jobtitle", "role")
    industry_column = _column(columns, "industry", "niche", "sector")
    city_column = _column(columns, "city", "location")
    country_column = _column(columns, "country")

    recipient_ids: list[str] = []
    now = datetime.now(timezone.utc)
    seen: set[str] = set()
    for source_row in row.get("rows", []):
        email = _row_value(source_row, email_column).lower()
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)
        name = _row_value(source_row, name_column)
        if not name:
            first = _row_value(source_row, first_column)
            last = _row_value(source_row, last_column)
            name = " ".join(part for part in (first, last) if part).strip()
        if not name:
            name = email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
        company = _row_value(source_row, company_column)
        recipient_id = hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]
        recipient_data = {
            "id": recipient_id,
            "name": name,
            "email": email,
            "company": company,
            "job_title": _row_value(source_row, title_column),
            "industry": _row_value(source_row, industry_column),
            "city": _row_value(source_row, city_column),
            "country": _row_value(source_row, country_column),
            "created_at": now,
        }
        recipient = Recipient(**recipient_data)
        await db.recipients.update_one({"id": recipient_id}, {"$set": recipient.model_dump()}, upsert=True)
        recipient_ids.append(recipient_id)

    if not recipient_ids:
        available = ", ".join(columns[:12]) or "none"
        raise HTTPException(status_code=422, detail=f"No valid email addresses were found in this list. Available columns: {available}")
    return {"source_id": source_id, "filename": row["filename"], "recipient_ids": recipient_ids, "count": len(recipient_ids)}
