import re
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from lib.db import db
from models.auth import UserPublic
from models.scheduler import new_id
from models.workspace import Workspace, WorkspaceContext, WorkspaceCreate, WorkspaceMembership, WorkspaceUpdate
from routers.auth import require_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
ACTIVE_WORKSPACE_COOKIE = "rohly_workspace"
TENANT_COLLECTIONS = (
    "campaigns", "csv_campaigns", "csv_sources", "inboxes", "recipients", "templates",
    "rohly_drafts", "activities", "history", "scheduled_emails", "oauth_tokens",
)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "workspace"


async def ensure_user_workspace(user: UserPublic) -> WorkspaceContext:
    membership = await db.workspace_memberships.find_one({"user_id": user.id})
    if membership:
        workspace = await db.workspaces.find_one({"id": membership["workspace_id"]})
        if workspace:
            return WorkspaceContext(workspace=Workspace(**workspace), role=membership["role"])

    now = datetime.now(timezone.utc)
    workspace = Workspace(id=new_id(), name=f"{user.name}'s workspace", slug=f"{_slugify(user.name)}-{user.id[:6]}", created_by=user.id, created_at=now)
    membership = WorkspaceMembership(id=new_id(), workspace_id=workspace.id, user_id=user.id, role="owner", created_at=now)
    await db.workspaces.insert_one(workspace.model_dump())
    await db.workspace_memberships.insert_one(membership.model_dump())
    for collection_name in TENANT_COLLECTIONS:
        await db[collection_name].update_many(
            {"user_id": user.id, "workspace_id": {"$exists": False}},
            {"$set": {"workspace_id": workspace.id}},
        )
    return WorkspaceContext(workspace=workspace, role="owner")


async def require_workspace(
    user: UserPublic = Depends(require_user),
    rohly_workspace: str | None = Cookie(default=None),
) -> WorkspaceContext:
    if rohly_workspace:
        membership = await db.workspace_memberships.find_one({"user_id": user.id, "workspace_id": rohly_workspace})
        if membership:
            workspace = await db.workspaces.find_one({"id": rohly_workspace})
            if workspace:
                return WorkspaceContext(workspace=Workspace(**workspace), role=membership["role"])
    return await ensure_user_workspace(user)


def require_workspace_role(*roles: str):
    async def dependency(context: WorkspaceContext = Depends(require_workspace)) -> WorkspaceContext:
        if context.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission for this workspace action")
        return context
    return dependency


@router.get("", response_model=list[WorkspaceContext])
async def list_workspaces(user: UserPublic = Depends(require_user)) -> list[WorkspaceContext]:
    await ensure_user_workspace(user)
    memberships = await db.workspace_memberships.find({"user_id": user.id}).to_list(100)
    result = []
    for membership in memberships:
        workspace = await db.workspaces.find_one({"id": membership["workspace_id"]})
        if workspace:
            result.append(WorkspaceContext(workspace=Workspace(**workspace), role=membership["role"]))
    return result


@router.get("/current", response_model=WorkspaceContext)
async def current_workspace(context: WorkspaceContext = Depends(require_workspace)) -> WorkspaceContext:
    return context


@router.post("", response_model=WorkspaceContext, status_code=201)
async def create_workspace(input: WorkspaceCreate, user: UserPublic = Depends(require_user)) -> WorkspaceContext:
    now = datetime.now(timezone.utc)
    workspace = Workspace(id=new_id(), name=input.name.strip(), slug=f"{_slugify(input.name)}-{new_id()[:6]}", created_by=user.id, created_at=now)
    membership = WorkspaceMembership(id=new_id(), workspace_id=workspace.id, user_id=user.id, role="owner", created_at=now)
    await db.workspaces.insert_one(workspace.model_dump())
    await db.workspace_memberships.insert_one(membership.model_dump())
    return WorkspaceContext(workspace=workspace, role="owner")


@router.post("/{workspace_id}/select", status_code=204)
async def select_workspace(workspace_id: str, response: Response, user: UserPublic = Depends(require_user)) -> Response:
    membership = await db.workspace_memberships.find_one({"user_id": user.id, "workspace_id": workspace_id})
    if not membership:
        raise HTTPException(status_code=404, detail="Workspace not found")
    response.set_cookie(ACTIVE_WORKSPACE_COOKIE, workspace_id, httponly=True, secure=os.environ.get("APP_URL", "").startswith("https://"), samesite="lax", max_age=30 * 24 * 60 * 60, path="/")
    response.status_code = 204
    return response


@router.patch("/{workspace_id}", response_model=WorkspaceContext)
async def update_workspace(input: WorkspaceUpdate, workspace_id: str, user: UserPublic = Depends(require_user)) -> WorkspaceContext:
    membership = await db.workspace_memberships.find_one({"user_id": user.id, "workspace_id": workspace_id, "role": {"$in": ["owner", "admin"]}})
    if not membership:
        raise HTTPException(status_code=403, detail="Only workspace owners and admins can update workspace settings")
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"name": input.name.strip()}})
    workspace = await db.workspaces.find_one({"id": workspace_id})
    return WorkspaceContext(workspace=Workspace(**workspace), role=membership["role"])
