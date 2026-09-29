import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, CalendarClock, Download, FlaskConical, Mail, Pause, Pencil, Play, Send, Settings2, Square, Users, Webhook } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { CsvCampaign, ScheduledEmail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { StatusBadge } from "@/components/rohly/StatusBadge";
import { TestEmailDialog } from "@/components/rohly/TestEmailDialog";
import { formatCampaignDateTime, parseServerUtc } from "@/lib/dates";

const tabs = ["Overview", "Sequence", "Leads", "Activity", "Settings"];

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const [tab, setTab] = useState("Overview");
  const [testOpen, setTestOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const client = useQueryClient();
  const campaigns = useQuery({ queryKey: ["csv-campaigns"], queryFn: () => apiGet<CsvCampaign[]>("/csv/campaigns") });
  const rohlyCampaigns = useQuery({ queryKey: ["rohly-campaigns"], queryFn: () => apiGet<any[]>("/workspace/rohly-campaigns/campaigns") });
  const isRohly = Boolean(rohlyCampaigns.data?.some((item) => item.id === campaignId));
  const activity = useQuery({
    queryKey: ["campaign-activity", campaignId, isRohly ? "rohly" : "csv"],
    queryFn: () => apiGet<any[]>(isRohly ? `/workspace/rohly-campaigns/${campaignId}/activity` : `/csv/campaigns/${campaignId}/activity`),
    enabled: Boolean(campaignId) && (isRohly || campaigns.isSuccess),
    refetchInterval: 5000,
  });
  const rohly = rohlyCampaigns.data?.find((item) => item.id === campaignId);
  const campaign = (campaigns.data?.find((item) => item.id === campaignId) ?? (rohly ? {
    ...rohly,
    source_id: "",
    source_filename: "Rohly Template",
    email_column: "email",
    first_name_column: "name",
    company_column: "company",
    status_column: null,
    emails_sent: rohly.sent_count ?? 0,
    emails_scheduled: rohly.emails_scheduled ?? 0,
    follow_ups_scheduled: 0,
    failed_emails: rohly.failed_count ?? 0,
    skipped_leads: 0,
    replies: 0,
    positive_replies: 0,
    total_leads: rohly.total_count ?? 0,
    status: rohly.status === "active" ? "running" : rohly.status === "queued" ? "draft" : rohly.status,
    launched_at: rohly.launched_at ?? null,
    sending_days: rohly.sending_days ?? [0,1,2,3,4],
    min_gap_minutes: rohly.min_gap_minutes ?? 10,
    max_gap_minutes: rohly.max_gap_minutes ?? 20,
    sending_window_start: rohly.sending_window_start ?? "09:00",
    sending_window_end: rohly.sending_window_end ?? "18:00",
    timezone: rohly.timezone ?? "Asia/Kolkata",
    steps: (rohly.steps ?? []).map((step: any, index: number) => ({ key: `step_${index + 1}`, label: step.label ?? `Email ${index + 1}`, subject_column: "", body_column: "", day_offset: step.delay_days ?? 0, send_time: rohly.sending_window_start ?? "09:00" })),
  } : undefined)) as CsvCampaign | undefined;
  const status = useMutation({
    mutationFn: (value: "running" | "paused" | "stopped") => isRohly
      ? apiPatch<any>(`/workspace/rohly-campaigns/${campaignId}/status`, { status: value === "running" ? "active" : value })
      : apiPatch<CsvCampaign>(`/csv/campaigns/${campaignId}/status`, { status: value }),
    onSuccess: (_, value) => {
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      client.invalidateQueries({ queryKey: ["rohly-campaigns"] });
      client.invalidateQueries({ queryKey: ["campaign-activity", campaignId] });
      toast.success(value === "running" ? (campaign.status === "stopped" ? "Campaign reactivated" : "Campaign resumed") : `Campaign ${value}`);
    },
    onError: (error: any) => toast.error(error?.message || "Could not update campaign status"),
  });
  if (campaigns.isLoading || rohlyCampaigns.isLoading || !campaign) return <SkeletonRows rows={8} />;
  const events = activity.data ?? [];
  const leadEmails = [...new Set(events.map((item) => item.recipient_email))];

  const nextScheduled = events.filter((item) => item.status === "scheduled").sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
  const completed = events.filter((item) => item.status === "sent").length;
  const totalPlanned = Math.max(1, campaign.total_leads * Math.max(1, campaign.steps.length));
  const progress = Math.min(100, Math.round((completed / totalPlanned) * 100));

  return <div data-testid="campaign-detail-page" className="min-h-[calc(100vh-7rem)]">
    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.025)] lg:px-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Link to="/campaigns" className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ArrowLeft size={14} /></Link><div><div className="flex items-center gap-2"><h1 className="text-[16px] font-bold text-slate-900">{campaign.name}</h1><StatusBadge status={campaign.status} /></div><p className="mt-1 text-[10px] text-slate-400">Created {new Date(campaign.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div></div><div className="flex flex-wrap gap-2">{!isRohly ? <Button onClick={() => setTestOpen(true)} variant="outline" className="h-9 gap-2 rounded-lg text-xs"><FlaskConical size={13} /> Send test</Button> : null}{!isRohly ? <Button render={<Link to={`/campaigns/${campaign.id}/edit`} />} variant="outline" className="h-9 gap-2 rounded-lg text-xs"><Pencil size={13} /> Edit</Button> : <Button onClick={() => setScheduleOpen(true)} variant="outline" className="h-9 gap-2 rounded-lg text-xs"><Pencil size={13} /> Edit schedule</Button>}{campaign.status === "running" ? <Button onClick={() => status.mutate("paused")} variant="outline" className="h-9 gap-2 rounded-lg text-xs"><Pause size={13} /> Pause</Button> : campaign.status === "paused" ? <Button onClick={() => status.mutate("running")} variant="outline" className="h-9 gap-2 rounded-lg text-xs"><Play size={13} /> Resume</Button> : campaign.status === "stopped" && isRohly ? <Button onClick={() => { if (window.confirm("Reactivate this campaign? Remaining unsent emails will be rebuilt from the current time using the campaign schedule.")) status.mutate("running"); }} variant="outline" className="h-9 gap-2 rounded-lg border-emerald-200 bg-emerald-50 text-xs text-emerald-700 hover:bg-emerald-100"><Play size={13} /> Reactivate</Button> : null}{!["stopped", "completed"].includes(campaign.status) ? <Button onClick={() => { if (window.confirm("Stop this campaign? Future unsent emails will be cancelled.")) status.mutate("stopped"); }} variant="outline" className="h-9 gap-2 rounded-lg text-xs text-red-600"><Square size={12} /> Stop</Button> : null}{!isRohly ? <Button variant="default" onClick={() => { window.location.href = `/api/csv/campaigns/${campaign.id}/export`; }} className="h-9 gap-2 rounded-lg bg-blue-700 text-xs hover:bg-blue-800"><Download size={13} /> Export</Button> : null}</div></div></div>
    <div className="mb-3 grid grid-cols-2 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)] sm:grid-cols-3 lg:grid-cols-6">{[{ icon: CalendarClock, label: "Follow-ups Today", value: events.filter((item) => item.step_key !== campaign.steps[0]?.key && item.status === "scheduled").length },{ icon: Webhook, label: "Webhooks", value: (campaign as any).webhook_url ? "Enabled" : "Disabled" },{ icon: Send, label: "Sending Capacity", value: campaign.inbox_ids.length + " inbox" + (campaign.inbox_ids.length === 1 ? "" : "es") },{ icon: BarChart3, label: "Active Sequences", value: campaign.steps.length },{ icon: Mail, label: "Emails Sent", value: completed },{ icon: CalendarClock, label: "Next Email In", value: nextScheduled ? formatNextEmailCountdown(nextScheduled.scheduled_at, countdownNow) : "None scheduled", title: nextScheduled ? formatCampaignDateTime(nextScheduled.scheduled_at, campaign.timezone) : undefined }].map(({ icon: Icon, label, value, title }) => <div key={label} title={title} className="flex min-h-[68px] items-center gap-3 px-4 py-3 lg:px-5"><span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${label === "Next Email In" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-700"}`}><Icon size={14} /></span><div className="min-w-0"><p className="text-[10px] font-medium text-slate-400">{label}</p><p className={`mt-1 truncate text-xs font-semibold ${label === "Next Email In" && nextScheduled ? "text-emerald-600" : "text-slate-700"}`}>{value}</p></div></div>)}</div>
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-1" role="tablist">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`relative whitespace-nowrap px-4 py-3.5 text-xs font-semibold ${tab === item ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`} role="tab" aria-selected={tab === item}>{item}{tab === item ? <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-blue-700" /> : null}</button>)}</div>
    <div className="py-3">{tab === "Overview" ? <Overview campaign={campaign} events={events} progress={progress} /> : null}{tab === "Sequence" ? <Sequence campaign={campaign} events={events} /> : null}{tab === "Leads" ? <Leads events={events} leadEmails={leadEmails} /> : null}{tab === "Activity" ? <Activity events={events} timezone={campaign.timezone} /> : null}{tab === "Settings" ? (isRohly ? <GrowthSettings campaign={campaign as any} onSaved={() => client.invalidateQueries({ queryKey: ["rohly-campaigns"] })} /> : <Surface className="p-4" testId="campaign-settings"><div className="flex items-center gap-2"><Settings2 size={16} className="text-blue-700" /><h2 className="text-sm font-semibold">Campaign settings</h2></div><p className="mt-2 text-xs leading-relaxed text-slate-500">Timezone: {campaign.timezone}. Use Edit to change source rows, mappings, inboxes, or schedule.</p></Surface>) : null}</div>
    {testOpen && !isRohly ? <TestEmailDialog campaignId={campaign.id} inboxCount={campaign.inbox_ids.length} onClose={() => setTestOpen(false)} /> : null}
    {scheduleOpen && isRohly ? <ScheduleDialog campaign={campaign} onClose={() => setScheduleOpen(false)} onSaved={() => { setScheduleOpen(false); client.invalidateQueries({ queryKey: ["rohly-campaigns"] }); client.invalidateQueries({ queryKey: ["campaign-activity", campaignId] }); }} /> : null}
  </div>;
}

function Overview({ campaign, events, progress }: { campaign: CsvCampaign; events: ScheduledEmail[]; progress: number }) {
  const repliedLeads = new Set(events.filter((item) => item.replied_at).map((item) => item.recipient_email)).size;
  const replyCount = Math.max(campaign.replies ?? 0, repliedLeads);
  const metrics = [{ label: "Total leads contacted", value: campaign.emails_sent ? campaign.total_leads : 0, icon: Users, tone: "text-blue-700" },{ label: "Emails sent", value: campaign.emails_sent, icon: Mail, tone: "text-blue-700" },{ label: "Replies", value: replyCount, icon: Send, tone: "text-cyan-600" },{ label: "Positive replies", value: campaign.positive_replies, icon: BarChart3, tone: "text-emerald-600" },{ label: "Failed", value: campaign.failed_emails, icon: Square, tone: "text-red-500" }];
  return <div className="space-y-5">
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1.6fr]"><Surface className="overflow-hidden bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5" testId="campaign-progress"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-600">Campaign progress</p><p className="mt-1 text-[10px] text-slate-400">Email sends tracking</p></div><StatusBadge status={campaign.status} /></div><div className="mt-4 flex items-end gap-2"><span className="text-4xl font-bold tracking-tight text-slate-900">{progress}%</span><span className="pb-1 text-xs text-slate-400">complete</span></div><p className="mt-1 text-xs text-slate-500">{events.filter((item)=>item.status==="sent").length} of {Math.max(1,campaign.total_leads*Math.max(1,campaign.steps.length))} sends processed</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-500" style={{ width: progress + "%" }} /></div></Surface>
      <Surface className="p-4" testId="campaign-metrics"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-xl bg-slate-50 p-4"><Icon size={15} className={tone} /><p className="mt-3 text-[10px] text-slate-400">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p></div>)}</div></Surface></div>
    <CampaignAnalytics campaign={campaign} events={events} compact />
    <Surface className="p-4" testId="campaign-send-forecast"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Campaign Send Forecast vs. Actual</h2><p className="mt-1 text-[10px] text-slate-400">Scheduled delivery and actual send progress</p></div><div className="flex gap-2 text-[10px]"><span className="rounded-md bg-blue-50 px-3 py-2 font-semibold text-blue-700">Sent {campaign.emails_sent}</span><span className="rounded-md bg-slate-50 px-3 py-2 font-semibold text-slate-500">Scheduled {campaign.emails_scheduled}</span><span className="rounded-md bg-red-50 px-3 py-2 font-semibold text-red-500">Failed {campaign.failed_emails}</span></div></div><div className="mt-4 flex h-32 items-end gap-3 border-b border-slate-100 px-3">{[campaign.emails_sent,campaign.emails_scheduled,campaign.replies,campaign.positive_replies].map((value,index)=><div key={index} className="flex h-full flex-1 items-end"><div className={`w-full rounded-t-md ${index===0?"bg-violet-400":index===1?"bg-fuchsia-300":index===2?"bg-cyan-400":"bg-emerald-400"}`} style={{height:Math.max(4,Math.min(100,(value/Math.max(1,campaign.total_leads*Math.max(1,campaign.steps.length)))*100))+"%"}} /></div>)}</div><div className="mt-3 flex justify-center gap-5 text-[10px] text-slate-400"><span>● Sent</span><span>● Scheduled</span><span>● Replies</span><span>● Positive</span></div></Surface>
    <Surface className="overflow-hidden" testId="campaign-source"><div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold">Campaign details</h2></div><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-[10px] text-slate-400">Source</p><p className="mt-1 text-xs font-semibold">{campaign.source_filename}</p></div><div><p className="text-[10px] text-slate-400">Sending inboxes</p><p className="mt-1 text-xs font-semibold">{campaign.inbox_ids.length}</p></div><div><p className="text-[10px] text-slate-400">Sending window</p><p className="mt-1 text-xs font-semibold">{campaign.sending_window_start} – {campaign.sending_window_end}</p></div><div><p className="text-[10px] text-slate-400">Timezone</p><p className="mt-1 text-xs font-semibold">{campaign.timezone}</p></div></div></Surface>
  </div>;
}

function Sequence({ campaign, events }: { campaign: CsvCampaign; events: ScheduledEmail[] }) {
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Sequence Analytics & Management</h2><p className="mt-1 text-[10px] text-slate-400">{campaign.steps.length} steps in this campaign</p></div><Button variant="outline" className="h-8 gap-2 text-xs"><span>+</span> Add Sequence</Button></div>{campaign.steps.map((step,index)=>{const rows=events.filter((item)=>item.step_key===step.key);const sent=rows.filter((item)=>item.status==="sent").length;const replies=rows.filter((item)=>item.replied_at).length;const failed=rows.filter((item)=>item.status==="failed").length;return <Surface key={step.key} className="overflow-hidden" testId={`sequence-step-${index}`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><p className="text-xs font-bold text-slate-900">Email {index+1} – Email Outreach <span className="ml-1 font-medium text-orange-500">• {replies ? "Engaged" : "Medium Engagement"}</span></p><p className="mt-2 text-[11px] text-slate-500">Subject: <span className="font-medium text-slate-700">{step.label}</span></p></div><Button variant="outline" size="icon" className="size-8"><Pencil size={13}/></Button></div><div className="grid grid-cols-2 divide-x sm:grid-cols-4"><MetricMini label="Sent" value={sent} tone="violet"/><MetricMini label="Replies" value={replies} tone="cyan"/><MetricMini label="Failed" value={failed} tone="red"/><MetricMini label="Scheduled" value={rows.filter((item)=>item.status==="scheduled").length} tone="slate"/></div></Surface>})}</div>;
}

function MetricMini({ label, value, tone }: { label:string; value:number; tone:"violet"|"cyan"|"red"|"slate" }) {
  const tones={violet:"text-blue-700",cyan:"text-cyan-600",red:"text-red-500",slate:"text-slate-600"};
  return <div className="px-4 py-4 text-center"><p className={`text-lg font-semibold ${tones[tone]}`}>{value}</p><p className="mt-1 text-[10px] text-slate-400">{label}</p></div>;
}

function Leads({ events, leadEmails }: { events: ScheduledEmail[]; leadEmails: string[] }) {
  return <Surface testId="campaign-leads-list"><div className="divide-y divide-slate-100">{leadEmails.map((email) => { const rows = events.filter((item) => item.recipient_email === email); const opens = rows.reduce((sum, item) => sum + (item.open_count ?? 0), 0); const clicks=rows.reduce((sum,item)=>sum+(item.click_count??0),0); const bounced=rows.some(item=>item.bounced_at); const unsubscribed=rows.some(item=>item.unsubscribed_at); return <div key={email} className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-[1fr_1fr_170px_120px]"><div><p className="font-semibold">{rows[0]?.first_name || email}</p><p className="mt-1 text-slate-400">{email}</p></div><p className="text-slate-500">{rows[0]?.company || "—"}</p><div className="flex flex-wrap gap-1"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px]">{opens} opens</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{clicks} clicks</span>{unsubscribed?<span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">unsubscribed</span>:null}</div><StatusBadge status={bounced?"failed":rows.some((item) => item.replied_at) ? "replied" : rows[0]?.status || "scheduled"} /></div>; })}</div></Surface>;
}

function Activity({ events, timezone }: { events: ScheduledEmail[]; timezone: string }) {
  return <Surface testId="campaign-activity"><div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-500" data-testid="campaign-timezone-label">All times shown in {timezone}</div><div className="divide-y divide-slate-100">{events.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-xs font-semibold">{item.first_name || item.recipient_email} · {item.step_label}</p><p className="mt-1 text-[11px] text-slate-400">{item.subject}</p></div><div className="text-right"><div className="flex items-center justify-end gap-2"><StatusBadge status={item.status} />{item.status === "sent" && <><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{item.open_count ?? 0} open{(item.open_count ?? 0) === 1 ? "" : "s"}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{item.click_count ?? 0} click{(item.click_count ?? 0) === 1 ? "" : "s"}</span></>}</div><p className="mt-1 text-[10px] text-slate-400" data-testid={`campaign-event-time-${item.id}`}>{formatCampaignDateTime(item.scheduled_at, timezone)}</p></div></div>)}</div></Surface>;
}

function CampaignAnalytics({ campaign, events = [], compact = false }: { campaign: CsvCampaign; events?: ScheduledEmail[]; compact?: boolean }) {
  const c = campaign as any; const sent=Math.max(0,campaign.emails_sent||0); const rate=(value:number)=>sent?((value/sent)*100).toFixed(1)+"%":"0.0%";
  const [drilldown, setDrilldown] = useState<string | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const repliedLeads = new Set(events.filter((item) => item.replied_at).map((item) => item.recipient_email)).size;
  const replies = Math.max(campaign.replies ?? 0, repliedLeads);
  const pendingScheduled = events.filter((item) => item.status === "scheduled").length;
  const metrics=[["Delivered",sent],["Unique opens",c.unique_opens??0],["Open rate",rate(c.unique_opens??0)],["Unique clicks",c.unique_clicks??0],["Click rate",rate(c.unique_clicks??0)],["Replies",replies],["Reply rate",rate(replies)],["Positive replies",campaign.positive_replies??0],["Bounces",c.bounces??0],["Bounce rate",rate(c.bounces??0)],["Unsubscribed",c.unsubscribes??0],["Scheduled",pendingScheduled]];
  const drillable = new Set(["Delivered","Unique opens","Unique clicks","Replies","Bounces","Unsubscribed","Scheduled"]);
  const rowsFor = (label:string) => {
    const byLead = new Map<string, { key:string; email:string; name:string; company:string; at:string|null; detail:string; stepLabel:string; subject:string; body:string; sentAt:string|null }>();
    for (const item of events) {
      let at:string|null=null, detail="";
      if(label==="Delivered" && item.sent_at){at=item.sent_at;detail="Delivered";}
      else if(label==="Unique opens" && item.first_opened_at){at=item.first_opened_at;detail=`${item.open_count ?? 1} open${(item.open_count ?? 1)===1?"":"s"}`;}
      else if(label==="Unique clicks" && item.first_clicked_at){at=item.first_clicked_at;detail=`${item.click_count ?? 1} click${(item.click_count ?? 1)===1?"":"s"}`;}
      else if(label==="Replies" && item.replied_at){at=item.replied_at;detail="Replied";}
      else if(label==="Bounces" && item.bounced_at){at=item.bounced_at;detail="Bounced";}
      else if(label==="Unsubscribed" && item.unsubscribed_at){at=item.unsubscribed_at;detail="Unsubscribed";}
      else if(label==="Scheduled" && item.scheduled_at && item.status==="scheduled"){at=item.scheduled_at;detail=item.step_label || "Scheduled";}
      if(!at) continue;
      const key=item.recipient_email.toLowerCase();
      const current=byLead.get(key);
      if(!current || new Date(at).getTime()<new Date(current.at || at).getTime()) byLead.set(key,{key:item.id,email:item.recipient_email,name:item.first_name || item.recipient_email,company:item.company || "",at,detail,stepLabel:item.step_label || "Email",subject:item.subject || "(No subject)",body:item.body || "",sentAt:item.sent_at || null});
    }
    return [...byLead.values()].sort((a,b)=>new Date(b.at||0).getTime()-new Date(a.at||0).getTime());
  };
  const detailRows = drilldown ? rowsFor(drilldown) : [];
  return <><Surface className="p-4" testId={compact ? "campaign-overview-analytics" : "campaign-analytics"}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{compact ? "Delivery & engagement" : "Campaign performance"}</h2><p className="mt-1 text-[10px] text-slate-400">{compact ? "Opens, clicks, replies and delivery health at a glance." : "Delivery and engagement across this campaign."}</p></div>{compact ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">Live campaign analytics</span> : null}</div><div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{metrics.map(([label,value])=>{const clickable=drillable.has(String(label));return <button type="button" key={String(label)} onClick={()=>clickable&&setDrilldown(String(label))} className={`rounded-lg border border-slate-100 bg-slate-50 p-4 text-left transition ${clickable?"cursor-pointer hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-sm":"cursor-default"}`}><p className="text-[10px] font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>{clickable?<p className="mt-2 text-[9px] font-semibold text-blue-600">View leads →</p>:null}</button>})}</div><p className="mt-4 text-[10px] leading-relaxed text-slate-400">Open tracking is approximate because some email clients block or proxy images. Clicks are counted through tracked redirect links when click tracking is enabled.</p></Surface>{drilldown?<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" onClick={()=>setDrilldown(null)}><div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-base font-semibold">{drilldown}</h3><p className="mt-1 text-xs text-slate-500">{detailRows.length} lead{detailRows.length===1?"":"s"} with recorded activity</p></div><button className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100" onClick={()=>setDrilldown(null)}>✕</button></div><div className="max-h-[65vh] overflow-auto">{detailRows.length?detailRows.map(row=><div key={row.email} className="border-b border-slate-100"><button type="button" onClick={()=>setExpandedActivity(expandedActivity===row.key?null:row.key)} className="grid w-full gap-2 px-5 py-4 text-left hover:bg-slate-50 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center"><div><p className="text-sm font-semibold text-slate-900">{row.name}</p><p className="mt-0.5 text-xs text-slate-500">{row.email}</p></div><div><p className="text-xs text-slate-500">{row.company || "—"}</p><p className="mt-1 text-[11px] font-medium text-violet-600">{row.stepLabel} · {row.subject}</p></div><div className="sm:text-right"><p className="text-xs font-semibold text-slate-700">{row.detail}</p><p className="mt-0.5 text-[11px] text-slate-400">{row.at?formatCampaignDateTime(row.at,campaign.timezone):"—"}</p><p className="mt-1 text-[10px] font-semibold text-blue-600">{expandedActivity===row.key?"Hide message ↑":"View message ↓"}</p></div></button>{expandedActivity===row.key?<div className="mx-5 mb-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><div className="border-b border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{row.stepLabel}</p><p className="mt-1 text-sm font-semibold text-slate-900">{row.subject}</p></div><div className="text-right"><p className="text-[10px] text-slate-400">Sent</p><p className="text-[11px] text-slate-500">{row.sentAt?formatCampaignDateTime(row.sentAt,campaign.timezone):"—"}</p></div></div><p className="mt-2 text-[11px] text-slate-500">To: {row.email}</p></div><div className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-slate-700">{row.body || "No message body was stored for this email."}</div>{drilldown==="Unique opens"?<div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">First opened: {row.at?formatCampaignDateTime(row.at,campaign.timezone):"—"} · {row.detail}</div>:null}</div>:null}</div>):<div className="px-5 py-12 text-center text-sm text-slate-500">No matching lead activity has been recorded yet.</div>}</div></div></div>:null}</>;
}

function ScheduleDialog({ campaign, onClose, onSaved }: { campaign: CsvCampaign; onClose: () => void; onSaved: () => void }) {
  const [timezone, setTimezone] = useState(campaign.timezone);
  const [start, setStart] = useState(campaign.sending_window_start);
  const [end, setEnd] = useState(campaign.sending_window_end);
  const [minGap, setMinGap] = useState(campaign.min_gap_minutes);
  const [maxGap, setMaxGap] = useState(campaign.max_gap_minutes);
  const [days, setDays] = useState<number[]>(campaign.sending_days);
  const save = useMutation({
    mutationFn: () => apiPatch(`/workspace/rohly-campaigns/${campaign.id}/schedule`, { timezone, sending_window_start: start, sending_window_end: end, min_gap_minutes: minGap, max_gap_minutes: maxGap, sending_days: days }),
    onSuccess: () => { toast.success("Campaign schedule updated"); onSaved(); },
    onError: () => toast.error("Could not update campaign schedule"),
  });
  const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4" onClick={onClose}><div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(e)=>e.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Edit sending schedule</h2><p className="mt-1 text-xs text-slate-500">Only future unsent emails are rebuilt. Sent history stays unchanged.</p></div><button onClick={onClose} className="text-slate-400">✕</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Start time<input type="time" value={start} onChange={e=>setStart(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3"/></label><label className="text-xs font-semibold">End time<input type="time" value={end} onChange={e=>setEnd(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3"/></label><label className="text-xs font-semibold">Minimum gap (minutes)<input type="number" min={1} value={minGap} onChange={e=>setMinGap(Number(e.target.value))} className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3"/></label><label className="text-xs font-semibold">Maximum gap (minutes)<input type="number" min={1} value={maxGap} onChange={e=>setMaxGap(Number(e.target.value))} className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3"/></label><label className="text-xs font-semibold sm:col-span-2">Timezone<select value={timezone} onChange={e=>setTimezone(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="Asia/Kolkata">India Standard Time</option><option value="America/New_York">Eastern Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="Europe/London">London</option><option value="UTC">UTC</option></select></label></div><div className="mt-4"><p className="text-xs font-semibold">Sending days</p><div className="mt-2 flex flex-wrap gap-2">{labels.map((label,index)=><button type="button" key={label} onClick={()=>setDays(current=>current.includes(index)?current.filter(d=>d!==index):[...current,index].sort())} className={`rounded-md border px-3 py-2 text-xs font-semibold ${days.includes(index)?"border-blue-300 bg-blue-50 text-blue-700":"border-slate-200 text-slate-500"}`}>{label}</button>)}</div></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || !days.length} onClick={()=>save.mutate()} className="bg-blue-700 hover:bg-blue-800">{save.isPending?"Saving…":"Save & reschedule"}</Button></div></div></div>;
}


function GrowthSettings({ campaign, onSaved }: { campaign:any; onSaved:()=>void }) {
  const [openTracking,setOpenTracking]=useState(campaign.open_tracking ?? true);
  const [clickTracking,setClickTracking]=useState(campaign.click_tracking ?? false);
  const [unsubscribe,setUnsubscribe]=useState(campaign.unsubscribe_enabled ?? true);
  const [stopReply,setStopReply]=useState(campaign.stop_on_reply ?? true);
  const [stopOpen,setStopOpen]=useState(campaign.stop_on_open ?? false);
  const [stopClick,setStopClick]=useState(campaign.stop_on_click ?? false);
  const [bounceRate,setBounceRate]=useState(campaign.bounce_auto_pause_rate ?? 5);
  const [webhookUrl,setWebhookUrl]=useState(campaign.webhook_url ?? "");
  const allEvents=["sent","opened","clicked","replied","bounced","unsubscribed","campaign_completed"];
  const [events,setEvents]=useState<string[]>(campaign.webhook_events ?? allEvents);
  const save=useMutation({mutationFn:()=>apiPatch(`/workspace/rohly-campaigns/${campaign.id}/features`,{open_tracking:openTracking,click_tracking:clickTracking,unsubscribe_enabled:unsubscribe,stop_on_reply:stopReply,stop_on_open:stopOpen,stop_on_click:stopClick,bounce_auto_pause_rate:bounceRate,webhook_url:webhookUrl,webhook_events:events}),onSuccess:()=>{toast.success("Campaign growth settings saved");onSaved();},onError:()=>toast.error("Could not save campaign settings")});
  const Toggle=({label,description,value,setValue}:{label:string;description:string;value:boolean;setValue:(v:boolean)=>void})=><label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-200 p-4"><div><p className="text-xs font-semibold text-slate-800">{label}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{description}</p></div><input type="checkbox" checked={value} onChange={e=>setValue(e.target.checked)} className="mt-1 size-4 accent-blue-700"/></label>;
  return <div className="space-y-4"><Surface className="p-4" testId="campaign-growth-settings"><div className="flex items-center gap-2"><Settings2 size={16} className="text-blue-700"/><h2 className="text-sm font-semibold">Tracking & sequence behavior</h2></div><div className="mt-4 grid gap-3 md:grid-cols-2"><Toggle label="Open tracking" description="Track unique and total opens with a tiny image pixel." value={openTracking} setValue={setOpenTracking}/><Toggle label="Click tracking" description="Route links through Rohly to measure unique and total clicks." value={clickTracking} setValue={setClickTracking}/><Toggle label="Unsubscribe link" description="Add an unsubscribe link and suppress opted-out leads globally." value={unsubscribe} setValue={setUnsubscribe}/><Toggle label="Stop on reply" description="Cancel remaining follow-ups as soon as a lead replies." value={stopReply} setValue={setStopReply}/><Toggle label="Stop on open" description="Cancel future follow-ups after the first tracked open." value={stopOpen} setValue={setStopOpen}/><Toggle label="Stop on click" description="Cancel future follow-ups after the first tracked click." value={stopClick} setValue={setStopClick}/></div><div className="mt-4 max-w-sm"><label className="text-xs font-semibold">Auto-pause bounce threshold (%)<input type="number" min={0} max={100} step={0.5} value={bounceRate} onChange={e=>setBounceRate(Number(e.target.value))} className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"/></label><p className="mt-1 text-[10px] text-slate-400">After at least 10 delivery attempts, pause the campaign when this bounce rate is reached. Set 0 to disable.</p></div></Surface><Surface className="p-4"><div className="flex items-center gap-2"><Webhook size={16} className="text-blue-700"/><h2 className="text-sm font-semibold">Webhooks</h2></div><label className="mt-4 block text-xs font-semibold">Endpoint URL<input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://your-app.com/webhooks/rohly" className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"/></label><div className="mt-4 flex flex-wrap gap-2">{allEvents.map(event=><label key={event} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs ${events.includes(event)?"border-blue-300 bg-blue-50 text-blue-700":"border-slate-200 text-slate-500"}`}><input type="checkbox" checked={events.includes(event)} onChange={()=>setEvents(current=>current.includes(event)?current.filter(x=>x!==event):[...current,event])}/>{event.replaceAll("_"," ")}</label>)}</div></Surface><SuppressionManager/><div className="flex justify-end"><Button onClick={()=>save.mutate()} disabled={save.isPending} className="bg-blue-700 hover:bg-blue-800">{save.isPending?"Saving…":"Save campaign settings"}</Button></div></div>;
}


function SuppressionManager(){
  const client=useQueryClient(); const [email,setEmail]=useState("");
  const query=useQuery({queryKey:["suppressions"],queryFn:()=>apiGet<any[]>("/workspace/rohly-campaigns/suppressions")});
  const add=useMutation({mutationFn:()=>apiPost("/workspace/rohly-campaigns/suppressions",{email,reason:"manual"}),onSuccess:()=>{setEmail("");client.invalidateQueries({queryKey:["suppressions"]});toast.success("Email suppressed");},onError:()=>toast.error("Could not suppress email")});
  const remove=useMutation({mutationFn:(value:string)=>apiDelete(`/workspace/rohly-campaigns/suppressions/${encodeURIComponent(value)}`),onSuccess:()=>client.invalidateQueries({queryKey:["suppressions"]})});
  return <Surface className="p-4"><h2 className="text-sm font-semibold">Global suppression list</h2><p className="mt-1 text-[10px] text-slate-500">Unsubscribed, bounced, or manually blocked addresses are prevented from receiving future campaign emails.</p><div className="mt-4 flex gap-2"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="person@company.com" className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"/><Button variant="outline" disabled={!email||add.isPending} onClick={()=>add.mutate()}>Suppress</Button></div><div className="mt-4 max-h-56 divide-y divide-slate-100 overflow-y-auto">{(query.data??[]).slice(0,100).map((row:any)=><div key={row.email} className="flex items-center justify-between py-2 text-xs"><div><p className="font-medium">{row.email}</p><p className="text-[10px] text-slate-400">{row.reason}</p></div><button onClick={()=>remove.mutate(row.email)} className="text-[10px] font-semibold text-red-600">Remove</button></div>)}{query.isSuccess&&!query.data?.length?<p className="py-4 text-xs text-slate-400">No suppressed addresses.</p>:null}</div></Surface>;
}


function formatNextEmailCountdown(value: string, now: number): string {
  const target = parseServerUtc(value).getTime();
  if (!Number.isFinite(target)) return "None scheduled";
  const remaining = target - now;
  if (remaining <= 0) return "Sending now…";
  const totalSeconds = Math.ceil(remaining / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (totalHours > 0) return `${totalHours}h ${minutes}m ${seconds}s`;
  if (totalMinutes > 0) return `${totalMinutes}m ${seconds}s`;
  return `${seconds}s`;
}
