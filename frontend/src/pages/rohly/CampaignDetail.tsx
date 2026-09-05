import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FlaskConical, Pause, Pencil, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import type { CsvCampaign, ScheduledEmail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { StatusBadge } from "@/components/rohly/StatusBadge";
import { TestEmailDialog } from "@/components/rohly/TestEmailDialog";
import { formatCampaignDateTime } from "@/lib/dates";

const tabs = ["Overview", "Sequence", "Leads", "Analytics", "Activity", "Settings"];

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const [tab, setTab] = useState("Overview");
  const [testOpen, setTestOpen] = useState(false);
  const client = useQueryClient();
  const campaigns = useQuery({ queryKey: ["csv-campaigns"], queryFn: () => apiGet<CsvCampaign[]>("/csv/campaigns") });
  const activity = useQuery({ queryKey: ["campaign-activity", campaignId], queryFn: () => apiGet<ScheduledEmail[]>(`/csv/campaigns/${campaignId}/activity`), enabled: Boolean(campaignId) });
  const campaign = campaigns.data?.find((item) => item.id === campaignId);
  const status = useMutation({
    mutationFn: (value: "running" | "paused" | "stopped") => apiPatch<CsvCampaign>(`/csv/campaigns/${campaignId}/status`, { status: value }),
    onSuccess: (_, value) => { client.invalidateQueries({ queryKey: ["csv-campaigns"] }); toast.success(`Campaign ${value}`); },
  });
  if (campaigns.isLoading || !campaign) return <SkeletonRows rows={8} />;
  const events = activity.data ?? [];
  const leadEmails = [...new Set(events.map((item) => item.recipient_email))];

  return <div data-testid="campaign-detail-page">
    <Link to="/campaigns" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={13} /> Campaigns</Link>
    <div className="sticky top-16 z-20 -mx-4 border-y border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7" data-testid="campaign-action-bar">
      <div className="mx-auto flex max-w-[1444px] flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.03em]">{campaign.name}</h1><StatusBadge status={campaign.status} /></div><p className="mt-1 text-xs text-slate-500">{campaign.source_filename} · {campaign.timezone}</p></div><div className="flex gap-2"><Button onClick={() => setTestOpen(true)} variant="outline" className="gap-2" data-testid="open-test-email-button"><FlaskConical size={13} /> Send test</Button><Button render={<Link to={`/campaigns/${campaign.id}/edit`} />} className="gap-2 bg-blue-700 hover:bg-blue-800" data-testid="edit-campaign-button"><Pencil size={13} /> Edit</Button>{campaign.status === "running" ? <Button onClick={() => status.mutate("paused")} variant="outline" className="gap-2"><Pause size={13} /> Pause</Button> : campaign.status === "paused" ? <Button onClick={() => status.mutate("running")} variant="outline" className="gap-2"><Play size={13} /> Resume</Button> : null}{!["stopped", "completed"].includes(campaign.status) ? <Button onClick={() => status.mutate("stopped")} variant="outline" className="gap-2 text-red-600"><Square size={12} /> Stop</Button> : null}<Button variant="outline" onClick={() => { window.location.href = `/api/csv/campaigns/${campaign.id}/export`; }} className="gap-2"><Download size={13} /> Export</Button></div></div>
    </div>
    <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${tab === item ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`} role="tab" aria-selected={tab === item}>{item}</button>)}</div>
    <div className="mt-5">
      {tab === "Overview" ? <Overview campaign={campaign} /> : null}
      {tab === "Sequence" ? <Sequence campaign={campaign} /> : null}
      {tab === "Leads" ? <Leads events={events} leadEmails={leadEmails} /> : null}
      {tab === "Analytics" ? <CampaignAnalytics campaign={campaign} /> : null}
      {tab === "Activity" ? <Activity events={events} timezone={campaign.timezone} /> : null}
      {tab === "Settings" ? <Surface className="p-5" testId="campaign-settings"><h2 className="text-sm font-semibold">Campaign settings</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">Timezone: {campaign.timezone}. Use Edit to change source rows, mappings, inboxes, or schedule. Rohly protects sent, failed, and replied history while rebuilding future unsent emails.</p></Surface> : null}
    </div>
    {testOpen ? <TestEmailDialog campaignId={campaign.id} inboxCount={campaign.inbox_ids.length} onClose={() => setTestOpen(false)} /> : null}
  </div>;
}

function Overview({ campaign }: { campaign: CsvCampaign }) {
  const metrics = [["Total leads", campaign.total_leads], ["Emails sent", campaign.emails_sent], ["Replies", campaign.replies], ["Failed / skipped", `${campaign.failed_emails} / ${campaign.skipped_leads}`]];
  return <div className="grid gap-4 lg:grid-cols-[1fr_0.65fr]"><div className="grid gap-3 sm:grid-cols-2">{metrics.map(([label, value]) => <Surface key={label} className="p-4" testId={`campaign-${String(label).toLowerCase().replaceAll(" ", "-")}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-4 text-3xl font-semibold">{value}</p></Surface>)}</div><Surface className="p-5" testId="campaign-source"><h2 className="text-sm font-semibold">Campaign source</h2><dl className="mt-4 space-y-4 text-xs"><div><dt className="text-slate-400">CSV file</dt><dd className="mt-1 font-semibold">{campaign.source_filename}</dd></div><div><dt className="text-slate-400">Email column</dt><dd className="mt-1 font-semibold">{campaign.email_column}</dd></div><div><dt className="text-slate-400">Sending inboxes</dt><dd className="mt-1 font-semibold">{campaign.inbox_ids.length}</dd></div><div><dt className="text-slate-400">Created</dt><dd className="mt-1 font-semibold">{new Date(campaign.created_at).toLocaleString()}</dd></div></dl></Surface></div>;
}

function Sequence({ campaign }: { campaign: CsvCampaign }) {
  return <div className="max-w-3xl space-y-3">{campaign.steps.map((step, index) => <Surface key={step.key} className="p-4" testId={`sequence-step-${index}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-700">{step.label}</p><p className="mt-2 text-sm font-semibold">Day {step.day_offset} · {step.send_time}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-md bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-400">Subject column</p><p className="mt-1 text-xs font-medium">{step.subject_column}</p></div><div className="rounded-md bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-400">Body column</p><p className="mt-1 text-xs font-medium">{step.body_column}</p></div></div></Surface>)}</div>;
}

function Leads({ events, leadEmails }: { events: ScheduledEmail[]; leadEmails: string[] }) {
  return <Surface testId="campaign-leads-list"><div className="divide-y divide-slate-100">{leadEmails.map((email) => { const rows = events.filter((item) => item.recipient_email === email); return <div key={email} className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-[1fr_1fr_120px]"><div><p className="font-semibold">{rows[0]?.first_name || email}</p><p className="mt-1 text-slate-400">{email}</p></div><p className="text-slate-500">{rows[0]?.company || "—"}</p><StatusBadge status={rows.some((item) => item.replied_at) ? "replied" : rows[0]?.status || "scheduled"} /></div>; })}</div></Surface>;
}

function Activity({ events, timezone }: { events: ScheduledEmail[]; timezone: string }) {
  return <Surface testId="campaign-activity"><div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-500" data-testid="campaign-timezone-label">All times shown in {timezone}</div><div className="divide-y divide-slate-100">{events.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-xs font-semibold">{item.first_name || item.recipient_email} · {item.step_label}</p><p className="mt-1 text-[11px] text-slate-400">{item.subject}</p></div><div className="text-right"><StatusBadge status={item.status} /><p className="mt-1 text-[10px] text-slate-400" data-testid={`campaign-event-time-${item.id}`}>{formatCampaignDateTime(item.scheduled_at, timezone)}</p></div></div>)}</div></Surface>;
}

function CampaignAnalytics({ campaign }: { campaign: CsvCampaign }) {
  return <Surface className="p-5" testId="campaign-analytics"><h2 className="text-sm font-semibold">Campaign conversion</h2><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-md bg-slate-50 p-4"><p className="text-xs text-slate-500">Reply rate</p><p className="mt-2 text-2xl font-semibold">{campaign.emails_sent ? ((campaign.replies / campaign.emails_sent) * 100).toFixed(1) : "0.0"}%</p></div><div className="rounded-md bg-slate-50 p-4"><p className="text-xs text-slate-500">Positive replies</p><p className="mt-2 text-2xl font-semibold">{campaign.positive_replies}</p></div><div className="rounded-md bg-slate-50 p-4"><p className="text-xs text-slate-500">Scheduled</p><p className="mt-2 text-2xl font-semibold">{campaign.emails_scheduled}</p></div></div></Surface>;
}