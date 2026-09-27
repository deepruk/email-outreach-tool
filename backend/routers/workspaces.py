import re
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from lib.db import db
from models.auth import UserPublic
from models.scheduler import new_id
from models.workspace import Workspace, WorkspaceContext, WorkspaceCreate, WorkspaceInvite, WorkspaceInviteCreate, WorkspaceMember, WorkspaceMembership, WorkspaceUpdate
from routers.auth import require_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
ACTIVE_WORKSPACE_COOKIE = "rohly_workspace"
TENANT_COLLECTIONS = (
    "campaigns", "csv_campaigns", "csv_sources", "inboxes", "recipients", "templates",
    "rohly_drafts", "activities", "history", "scheduled_emails", "oauth_tokens", "replies", "reply_messages",
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


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMember])
async def list_members(workspace_id: str, user: UserPublic = Depends(require_user)) -> list[WorkspaceMember]:
    membership = await db.workspace_memberships.find_one({"workspace_id": workspace_id, "user_id": user.id})
    if not membership:
        raise HTTPException(status_code=404, detail="Workspace not found")
    memberships = await db.workspace_memberships.find({"workspace_id": workspace_id}).sort("created_at", 1).to_list(500)
    users = await db.users.find({"id": {"$in": [row["user_id"] for row in memberships]}}).to_list(500)
    lookup = {row["id"]: row for row in users}
    return [WorkspaceMember(user_id=row["user_id"], email=lookup.get(row["user_id"], {}).get("email", ""), name=lookup.get(row["user_id"], {}).get("name", "Member"), role=row["role"], joined_at=row["created_at"]) for row in memberships]


@router.get("/{workspace_id}/invites", response_model=list[WorkspaceInvite])
async def list_invites(workspace_id: str, user: UserPublic = Depends(require_user)) -> list[WorkspaceInvite]:
    membership = await db.workspace_memberships.find_one({"workspace_id": workspace_id, "user_id": user.id, "role": {"$in": ["owner", "admin"]}})
    if not membership:
        raise HTTPException(status_code=403, detail="Only workspace owners and admins can view invitations")
    rows = await db.workspace_invites.find({"workspace_id": workspace_id, "accepted_at": None}).sort("created_at", -1).to_list(500)
    return [WorkspaceInvite(**row) for row in rows]


@router.post("/{workspace_id}/invites", response_model=WorkspaceInvite, status_code=201)
async def invite_member(workspace_id: str, input: WorkspaceInviteCreate, user: UserPublic = Depends(require_user)) -> WorkspaceInvite:
    membership = await db.workspace_memberships.find_one({"workspace_id": workspace_id, "user_id": user.id, "role": {"$in": ["owner", "admin"]}})
    if not membership:
        raise HTTPException(status_code=403, detail="Only workspace owners and admins can invite members")
    email = input.email.strip().lower()
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        existing_membership = await db.workspace_memberships.find_one({"workspace_id": workspace_id, "user_id": existing_user["id"]})
        if existing_membership:
            raise HTTPException(status_code=409, detail="This user is already a workspace member")
        now = datetime.now(timezone.utc)
        new_membership = WorkspaceMembership(id=new_id(), workspace_id=workspace_id, user_id=existing_user["id"], role=input.role, created_at=now)
        await db.workspace_memberships.insert_one(new_membership.model_dump())
        invite = WorkspaceInvite(id=new_id(), workspace_id=workspace_id, email=email, role=input.role, invited_by=user.id, created_at=now, accepted_at=now)
        await db.workspace_invites.insert_one(invite.model_dump())
        return invite
    existing = await db.workspace_invites.find_one({"workspace_id": workspace_id, "email": email, "accepted_at": None})
    if existing:
        return WorkspaceInvite(**existing)
    invite = WorkspaceInvite(id=new_id(), workspace_id=workspace_id, email=email, role=input.role, invited_by=user.id, created_at=datetime.now(timezone.utc))
    await db.workspace_invites.insert_one(invite.model_dump())
    return invite


@router.post("/invites/accept", response_model=list[WorkspaceContext])
async def accept_pending_invites(user: UserPublic = Depends(require_user)) -> list[WorkspaceContext]:
    invites = await db.workspace_invites.find({"email": user.email.strip().lower(), "accepted_at": None}).to_list(100)
    now = datetime.now(timezone.utc)
    for invite in invites:
        await db.workspace_memberships.update_one(
            {"workspace_id": invite["workspace_id"], "user_id": user.id},
            {"$setOnInsert": {"id": new_id(), "workspace_id": invite["workspace_id"], "user_id": user.id, "role": invite["role"], "created_at": now}},
            upsert=True,
        )
        await db.workspace_invites.update_one({"id": invite["id"]}, {"$set": {"accepted_at": now}})
    return await list_workspaces(user)


@router.delete("/{workspace_id}/members/{member_user_id}", status_code=204)
async def remove_member(workspace_id: str, member_user_id: str, user: UserPublic = Depends(require_user)) -> Response:
    actor = await db.workspace_memberships.find_one({"workspace_id": workspace_id, "user_id": user.id, "role": {"$in": ["owner", "admin"]}})
    target = await db.workspace_memberships.find_one({"workspace_id": workspace_id, "user_id": member_user_id})
    if not actor or not target:
        raise HTTPException(status_code=404, detail="Workspace member not found")
    if target["role"] == "owner":
        raise HTTPException(status_code=400, detail="Workspace owner cannot be removed")
    await db.workspace_memberships.delete_one({"workspace_id": workspace_id, "user_id": member_user_id})
    return Response(status_code=204)
