from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from models.scheduler import new_id


class CsvSource(BaseModel):
    id: str = Field(default_factory=new_id)
    filename: str
    columns: list[str]
    row_count: int
    rows: list[dict[str, str]]
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class CsvSourceSummary(BaseModel):
    id: str
    filename: str
    columns: list[str]
    row_count: int
    uploaded_at: datetime


class SequenceStepInput(BaseModel):
    key: str
    label: str
    subject_column: str
    body_column: str
    day_offset: int = Field(ge=0, le=365)
    send_time: str


class CsvCampaignCreate(BaseModel):
    name: str
    source_id: str
    email_column: str
    first_name_column: str | None = None
    company_column: str | None = None
    status_column: str | None = None
    inbox_ids: list[str] = Field(min_length=1)
    steps: list[SequenceStepInput] = Field(min_length=1)
    timezone: str = "Asia/Kolkata"
    min_gap_minutes: int = Field(default=10, ge=1, le=1440)
    max_gap_minutes: int = Field(default=20, ge=1, le=1440)
    sending_window_start: str = "09:00"
    sending_window_end: str = "18:00"
    sending_days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])

    @model_validator(mode="after")
    def validate_schedule(self) -> "CsvCampaignCreate":
        if self.min_gap_minutes > self.max_gap_minutes:
            raise ValueError("Minimum gap must be less than or equal to maximum gap")
        def minutes(value: str) -> int:
            try:
                hour, minute = value.split(":", 1)
                hour_i, minute_i = int(hour), int(minute)
            except (ValueError, TypeError):
                raise ValueError("Working hours must use HH:MM format")
            if hour_i < 0 or hour_i > 23 or minute_i < 0 or minute_i > 59:
                raise ValueError("Working hours must use HH:MM format")
            return hour_i * 60 + minute_i
        if minutes(self.sending_window_start) >= minutes(self.sending_window_end):
            raise ValueError("Working-hours start must be before the end time")
        if not self.sending_days or any(day < 0 or day > 6 for day in self.sending_days) or len(set(self.sending_days)) != len(self.sending_days):
            raise ValueError("Working days must contain unique values from 0 (Monday) to 6 (Sunday)")
        return self


class CsvCampaign(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    source_id: str
    source_filename: str
    email_column: str
    first_name_column: str | None = None
    company_column: str | None = None
    status_column: str | None = None
    inbox_ids: list[str]
    steps: list[SequenceStepInput]
    timezone: str
    min_gap_minutes: int = Field(default=10, ge=1, le=1440)
    max_gap_minutes: int = Field(default=20, ge=1, le=1440)
    sending_window_start: str = "09:00"
    sending_window_end: str = "18:00"
    sending_days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    total_leads: int
    emails_sent: int = 0
    emails_scheduled: int = 0
    follow_ups_scheduled: int = 0
    failed_emails: int = 0
    skipped_leads: int = 0
    replies: int = 0
    positive_replies: int = 0
    status: Literal["draft", "scheduled", "running", "paused", "stopped", "completed"] = "draft"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    launched_at: datetime | None = None


class CsvCampaignPreviewLead(BaseModel):
    row_index: int
    email: str
    first_name: str
    company: str
    steps: list[dict[str, str]]
    error: str | None = None


class CsvCampaignPreview(BaseModel):
    leads: list[CsvCampaignPreviewLead]
    valid_count: int
    skipped_count: int


class ScheduledEmail(BaseModel):
    id: str = Field(default_factory=new_id)
    campaign_id: str
    campaign_name: str
    source_id: str
    row_index: int
    recipient_email: str
    first_name: str = ""
    company: str = ""
    step_key: str
    step_label: str
    subject: str
    body: str
    inbox_id: str
    scheduled_at: datetime
    status: Literal["scheduled", "sending", "sent", "failed", "skipped", "cancelled"] = "scheduled"
    error: str | None = None
    sent_at: datetime | None = None
    message_id: str | None = None
    thread_id: str | None = None
    replied_at: datetime | None = None


class CsvCampaignLaunchResponse(BaseModel):
    campaign: CsvCampaign
    scheduled_count: int
    skipped_count: int


class CampaignStatusRequest(BaseModel):
    status: Literal["running", "paused", "stopped"]


class CsvSourceDeriveRequest(BaseModel):
    rows: list[dict[str, str]] = Field(min_length=1)


class CampaignEditImpact(BaseModel):
    added: int
    removed: int
    rescheduled: int
    unchanged: int
    protected: int
    skipped_leads: int
    proposed_scheduled: int


class CampaignEditResult(BaseModel):
    campaign: CsvCampaign
    impact: CampaignEditImpact


class TestEmailRequest(BaseModel):
    recipient_email: str = Field(min_length=3, max_length=320)
    subject: str = Field(min_length=1, max_length=998)
    body: str = Field(min_length=1, max_length=100000)


class TestEmailInboxResult(BaseModel):
    inbox_id: str
    inbox_email: str
    success: bool
    message_id: str | None = None
    error: str | None = None


class TestEmailResponse(BaseModel):
    campaign_id: str
    recipient_email: str
    sent_count: int
    failed_count: int
    results: list[TestEmailInboxResult]
