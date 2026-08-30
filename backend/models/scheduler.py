from datetime import datetime
from typing import Literal
import uuid

from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


class Inbox(BaseModel):
    id: str = Field(default_factory=new_id)
    email: str
    display_name: str
    provider: Literal["gmail"] = "gmail"
    status: Literal["connected", "paused", "error"] = "connected"
    connected_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime | None = None
    is_mocked: bool = True


class InboxConnectRequest(BaseModel):
    email: str
    display_name: str = ""


class Recipient(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    email: str
    company: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RecipientCreate(BaseModel):
    name: str
    email: str
    company: str = ""


class Template(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    subject: str
    body: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str


class Campaign(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    inbox_id: str
    template_id: str
    recipient_ids: list[str]
    total_count: int
    sent_count: int = 0
    failed_count: int = 0
    status: Literal["draft", "queued", "active", "paused", "completed"] = "draft"
    min_gap_minutes: int = Field(ge=1)
    max_gap_minutes: int = Field(ge=1)
    next_send_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    launched_at: datetime | None = None


class CampaignCreate(BaseModel):
    name: str
    inbox_id: str
    template_id: str
    recipient_ids: list[str] = Field(min_length=1)
    min_gap_minutes: int = Field(default=10, ge=1, le=1440)
    max_gap_minutes: int = Field(default=20, ge=1, le=1440)


class Activity(BaseModel):
    id: str = Field(default_factory=new_id)
    message: str
    detail: str
    time: datetime = Field(default_factory=datetime.utcnow)
    tone: Literal["success", "warning", "error", "neutral"] = "neutral"


class Overview(BaseModel):
    sent_today: int
    queued: int
    error_rate: float
    active_inboxes: int
    active_campaigns: int
    next_send_at: datetime | None = None
    next_send_in_minutes: int | None = None
    recent_activity: list[Activity]


class HistoryEntry(BaseModel):
    id: str = Field(default_factory=new_id)
    campaign_name: str
    recipient_email: str
    inbox_email: str
    status: Literal["sent", "failed", "waiting"]
    sent_at: datetime = Field(default_factory=datetime.utcnow)


class LaunchResponse(BaseModel):
    campaign: Campaign
    message: str
    is_mocked: bool = True