import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi import HTTPException

from models.auth import UserPublic
from routers import csv_campaigns, rohly_campaigns
from datetime import datetime, timezone


def user(uid: str):
    return UserPublic(id=uid, email=f"{uid}@example.com", name=uid, role="user", created_at=datetime.now(timezone.utc), email_verified=True)


@pytest.mark.asyncio
async def test_csv_source_delete_is_scoped_to_authenticated_user(monkeypatch):
    find_one = AsyncMock(return_value=None)
    monkeypatch.setattr(csv_campaigns.db, "csv_sources", SimpleNamespace(find_one=find_one))
    with pytest.raises(HTTPException) as exc:
        await csv_campaigns.delete_source("source-other", user("alice"))
    assert exc.value.status_code == 404
    find_one.assert_awaited_once_with({"id": "source-other", "user_id": "alice"})


@pytest.mark.asyncio
async def test_rohly_draft_lookup_is_scoped_to_authenticated_user(monkeypatch):
    find_one = AsyncMock(return_value=None)
    monkeypatch.setattr(rohly_campaigns.db, "rohly_drafts", SimpleNamespace(find_one=find_one))
    with pytest.raises(HTTPException) as exc:
        await rohly_campaigns.get_draft("draft-other", user("alice"))
    assert exc.value.status_code == 404
    find_one.assert_awaited_once_with({"id": "draft-other", "user_id": "alice"})
