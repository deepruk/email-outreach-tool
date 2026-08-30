export interface Inbox {
  id: string;
  email: string;
  display_name: string;
  provider: "gmail";
  status: "connected" | "paused" | "error";
  connected_at: string;
  last_used_at: string | null;
  is_mocked: boolean;
  signature: string;
  daily_sending_limit: number;
}

export interface CsvSource {
  id: string;
  filename: string;
  columns: string[];
  row_count: number;
  rows: Record<string, string>[];
  uploaded_at: string;
}

export interface CsvSourceSummary {
  id: string;
  filename: string;
  columns: string[];
  row_count: number;
  uploaded_at: string;
}

export interface SequenceStepInput {
  key: string;
  label: string;
  subject_column: string;
  body_column: string;
  day_offset: number;
  send_time: string;
}

export interface CsvCampaignCreate {
  name: string;
  source_id: string;
  email_column: string;
  first_name_column: string | null;
  company_column: string | null;
  status_column: string | null;
  inbox_ids: string[];
  steps: SequenceStepInput[];
  timezone: string;
}

export interface CsvCampaignPreviewLead {
  row_index: number;
  email: string;
  first_name: string;
  company: string;
  steps: Record<string, string>[];
  error: string | null;
}

export interface CsvCampaignPreview {
  leads: CsvCampaignPreviewLead[];
  valid_count: number;
  skipped_count: number;
}

export interface CsvCampaign {
  id: string;
  name: string;
  source_id: string;
  source_filename: string;
  email_column: string;
  first_name_column: string | null;
  company_column: string | null;
  status_column: string | null;
  inbox_ids: string[];
  steps: SequenceStepInput[];
  timezone: string;
  total_leads: number;
  emails_sent: number;
  emails_scheduled: number;
  follow_ups_scheduled: number;
  failed_emails: number;
  skipped_leads: number;
  status: "draft" | "scheduled" | "running" | "paused" | "stopped" | "completed";
  created_at: string;
  launched_at: string | null;
}

export interface CsvCampaignLaunchResponse {
  campaign: CsvCampaign;
  scheduled_count: number;
  skipped_count: number;
}

export interface ScheduledEmail {
  id: string;
  campaign_id: string;
  campaign_name: string;
  source_id: string;
  row_index: number;
  recipient_email: string;
  first_name: string;
  company: string;
  step_key: string;
  step_label: string;
  subject: string;
  body: string;
  inbox_id: string;
  scheduled_at: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "skipped" | "cancelled";
  error: string | null;
  sent_at: string | null;
  message_id: string | null;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  company: string;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  inbox_id: string;
  template_id: string;
  recipient_ids: string[];
  total_count: number;
  sent_count: number;
  failed_count: number;
  status: "draft" | "queued" | "active" | "paused" | "completed";
  min_gap_minutes: number;
  max_gap_minutes: number;
  next_send_at: string | null;
  created_at: string;
  launched_at: string | null;
}

export interface Activity {
  id: string;
  message: string;
  detail: string;
  time: string;
  tone: "success" | "warning" | "error" | "neutral";
}

export interface Overview {
  sent_today: number;
  queued: number;
  error_rate: number;
  active_inboxes: number;
  active_campaigns: number;
  next_send_at: string | null;
  next_send_in_minutes: number | null;
  recent_activity: Activity[];
}

export interface HistoryEntry {
  id: string;
  campaign_name: string;
  recipient_email: string;
  inbox_email: string;
  status: "sent" | "failed" | "waiting";
  sent_at: string;
}

export interface LaunchResponse {
  campaign: Campaign;
  message: string;
  is_mocked: boolean;
}