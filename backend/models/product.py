from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.scheduler import new_id


class Metric(BaseModel):
    label: str
    value: int | float
    change: float | None = None


class ChartPoint(BaseModel):
    date: str
    sends: int
    replies: int
    positive_replies: int


class CampaignPerformance(BaseModel):
    id: str
    name: str
    status: str
    source: str
    leads: int
    sent: int
    replies: int
    positive_replies: int
    reply_rate: float
    progress: float
    created_at: datetime


class CommandCenter(BaseModel):
    emails_sent: Metric
    replies: Metric
    positive_replies: Metric
    active_campaigns: Metric
    scheduled: int
    failed: int
    inboxes_needing_attention: int
    chart: list[ChartPoint]
    campaigns: list[CampaignPerformance]


class SearchResult(BaseModel):
    id: str
    type: Literal["campaign", "lead", "inbox", "reply"]
    title: str
    subtitle: str
    href: str


class LeadSummary(BaseModel):
    id: str
    name: str
    email: str
    company: str
    campaign_id: str
    campaign_name: str
    status: str
    last_activity: datetime | None = None
    next_step: str | None = None
    next_step_at: datetime | None = None
    inbox_email: str
    paused: bool = False


class LeadPage(BaseModel):
    items: list[LeadSummary]
    total: int
    page: int
    page_size: int


class Reply(BaseModel):
    id: str = Field(default_factory=new_id)
    gmail_message_id: str
    thread_id: str
    inbox_id: str
    inbox_email: str
    campaign_id: str
    campaign_name: str
    recipient_email: str
    sender_name: str
    subject: str
    snippet: str
    received_at: datetime
    sentiment: Literal["unclassified", "positive", "neutral", "negative"] = "unclassified"
    read: bool = False


class ReplyUpdate(BaseModel):
    sentiment: Literal["unclassified", "positive", "neutral", "negative"] | None = None
    read: bool | None = None


class ReplySendRequest(BaseModel):
    body: str = Field(min_length=1, max_length=50000)


class InboxHealth(BaseModel):
    id: str
    email: str
    display_name: str
    status: str
    reply_tracking_status: str
    daily_limit: int
    sent_today: int
    utilization: float
    health_score: int
    health: Literal["healthy", "attention", "disconnected"]
    failed_last_7_days: int
    last_activity: datetime | None = None


class AnalyticsSummary(BaseModel):
    date_range_days: int
    emails_sent: int
    replies: int
    positive_replies: int
    failed: int
    reply_rate: float
    positive_reply_rate: float
    bounce_rate: float
    chart: list[ChartPoint]
    campaign_comparison: list[CampaignPerformance]
    inbox_performance: list[InboxHealth]