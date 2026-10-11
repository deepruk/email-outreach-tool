from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.auth import UserPublic
from routers import workspaces


@pytest.mark.asyncio
async def test_ensure_user_workspace_creates_owner_membership(monkeypatch):
    user = UserPublic(id="user-1", email="owner@example.com", name="Acme", role="user", created_at=datetime.now(timezone.utc), email_verified=True)
    workspaces.db.workspace_memberships.find_one = AsyncMock(return_value=None)
    workspaces.db.workspaces.insert_one = AsyncMock()
    workspaces.db.workspace_memberships.insert_one = AsyncMock()
    for name in workspaces.TENANT_COLLECTIONS:
        getattr(workspaces.db, name).update_many = AsyncMock()

    context = await workspaces.ensure_user_workspace(user)

    assert context.role == "owner"
    assert context.workspace.created_by == user.id
    assert context.workspace.name == "Acme's workspace"
    workspaces.db.workspaces.insert_one.assert_awaited_once()
    workspaces.db.workspace_memberships.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_require_workspace_uses_only_membership_for_requested_workspace():
    user = UserPublic(id="user-1", email="member@example.com", name="Member", role="user", created_at=datetime.now(timezone.utc), email_verified=True)
    membership = {"workspace_id": "workspace-2", "user_id": user.id, "role": "member"}
    workspace = {"id": "workspace-2", "name": "Team", "slug": "team", "created_by": "user-2", "created_at": datetime.now(timezone.utc)}
    workspaces.db.workspace_memberships.find_one = AsyncMock(return_value=membership)
    workspaces.db.workspaces.find_one = AsyncMock(return_value=workspace)

    context = await workspaces.require_workspace(user=user, rohly_workspace="workspace-2")

    assert context.workspace.id == "workspace-2"
    assert context.role == "member"
    workspaces.db.workspace_memberships.find_one.assert_awaited_once_with({"user_id": user.id, "workspace_id": "workspace-2"})
