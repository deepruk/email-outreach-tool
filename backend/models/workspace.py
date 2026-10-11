from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


WorkspaceRole = Literal["owner", "admin", "member"]


class Workspace(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=80)
    created_by: str
    created_at: datetime


class WorkspaceMembership(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    role: WorkspaceRole = "member"
    created_at: datetime


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class WorkspaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class WorkspaceInvite(BaseModel):
    id: str
    workspace_id: str
    email: str
    role: WorkspaceRole = "member"
    invited_by: str
    created_at: datetime
    accepted_at: datetime | None = None


class WorkspaceInviteCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: WorkspaceRole = "member"


class WorkspaceMember(BaseModel):
    user_id: str
    email: str
    name: str
    role: WorkspaceRole
    joined_at: datetime


class WorkspaceContext(BaseModel):
    workspace: Workspace
    role: WorkspaceRole
