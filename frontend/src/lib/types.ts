export interface Inbox {
  id: string;
  email: string;
  display_name: string;
  provider: "gmail";
  status: "connected" | "paused" | "error";
  connected_at: string;
  last_used_at: string | null;
  is_mocked: boolean;
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