import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  FileSpreadsheet,
  FlaskConical,
  Inbox as InboxIcon,
  Mail,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { ApiError, apiGet, apiPost, apiUpload } from "@/lib/api";
import type {
  CsvCampaign,
  CsvCampaignCreate,
  CsvCampaignLaunchResponse,
  CsvCampaignPreview,
  CsvSource,
  Inbox,
  SequenceStepInput,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { TestEmailDialog } from "@/components/rohly/TestEmailDialog";

const wizardSteps = ["Upload CSV", "Map columns", "Select inboxes", "Configure sequence", "Preview", "Launch"];

const errorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | null;
    return typeof body?.detail === "string" ? body.detail : `Request failed (${error.status})`;
  }
  return "Request failed. Please try again.";
};

const guess = (columns: string[], terms: string[]) => columns.find((column) => {
  const normalized = column.toLowerCase().replace(/[^a-z0-9]/g, "");
  return terms.some((term) => normalized.includes(term));
}) ?? "";

const defaultSteps = (columns: string[]): SequenceStepInput[] => [
  { key: "initial", label: "Initial email", subject_column: guess(columns, ["firstsubject", "initialsubject", "subject1"]), body_column: guess(columns, ["firstbody", "initialbody", "body1"]), day_offset: 0, send_time: "10:30" },
  { key: "follow_up_1", label: "Follow-up 1", subject_column: guess(columns, ["followup1subject", "followupsubject1"]), body_column: guess(columns, ["followup1body", "followupbody1"]), day_offset: 2, send_time: "11:00" },
  { key: "follow_up_2", label: "Follow-up 2", subject_column: guess(columns, ["followup2subject", "followupsubject2"]), body_column: guess(columns, ["followup2body", "followupbody2"]), day_offset: 3, send_time: "14:00" },
];

function ColumnSelect({ label, value, columns, onChange, optional = false, testId }: { label: string; value: string; columns: string[]; onChange: (value: string) => void; optional?: boolean; testId: string }) {
  return <label className="block" data-testid={`${testId}-field`}><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-500" data-testid={`${testId}-label`}>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10" data-testid={testId}><option value="">{optional ? "Not mapped" : "Select a column"}</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>;
}

export default function CsvCampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<CsvSource | null>(null);
  const [name, setName] = useState("Personalized outreach");
  const [emailColumn, setEmailColumn] = useState("");
  const [firstNameColumn, setFirstNameColumn] = useState("");
  const [companyColumn, setCompanyColumn] = useState("");
  const [statusColumn, setStatusColumn] = useState("");
  const [selectedInboxes, setSelectedInboxes] = useState<string[]>([]);
  const [sequence, setSequence] = useState<SequenceStepInput[]>([]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [minGapMinutes, setMinGapMinutes] = useState(10);
  const [maxGapMinutes, setMaxGapMinutes] = useState(20);
  const [preview, setPreview] = useState<CsvCampaignPreview | null>(null);
  const [createdCampaign, setCreatedCampaign] = useState<CsvCampaign | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const inboxesQuery = useQuery({ queryKey: ["inboxes"], queryFn: () => apiGet<Inbox[]>("/workspace/inboxes") });
  const inboxes = inboxesQuery.data ?? [];
  const connectedInboxes = inboxes.filter((inbox) => inbox.status === "connected");

  const payload = useMemo<CsvCampaignCreate | null>(() => source ? {
    name,
    source_id: source.id,
    email_column: emailColumn,
    first_name_column: firstNameColumn || null,
    company_column: companyColumn || null,
    status_column: statusColumn || null,
    inbox_ids: selectedInboxes,
    steps: sequence,
    timezone,
    min_gap_minutes: minGapMinutes,
    max_gap_minutes: maxGapMinutes,
  } : null, [
    source, name, emailColumn, firstNameColumn, companyColumn, statusColumn,
    selectedInboxes, sequence, timezone, minGapMinutes, maxGapMinutes,
  ]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<CsvSource>("/csv/sources", form);
    },
    onSuccess: (result) => {
      setSource(result);
      setEmailColumn(guess(result.columns, ["email", "recipientemail"]));
      setFirstNameColumn(guess(result.columns, ["firstname", "first"]));
      setCompanyColumn(guess(result.columns, ["company", "organization"]));
      setStatusColumn(guess(result.columns, ["status"]));
      setSequence(defaultSteps(result.columns));
      setStep(1);
      toast.success(`${result.row_count} leads loaded`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const previewMutation = useMutation({
    mutationFn: (data: CsvCampaignCreate) => apiPost<CsvCampaignPreview>("/csv/campaigns/preview", data),
    onSuccess: (result) => { setPreview(result); setStep(4); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const createMutation = useMutation({
    mutationFn: (data: CsvCampaignCreate) => apiPost<CsvCampaign>("/csv/campaigns", data),
    onSuccess: (result) => { setCreatedCampaign(result); setStep(5); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const launchMutation = useMutation({
    mutationFn: (campaignId: string) => apiPost<CsvCampaignLaunchResponse>(`/csv/campaigns/${campaignId}/launch`),
    onSuccess: (result) => {
      toast.success(`${result.scheduled_count} exact emails scheduled`);
      setTimeout(() => navigate("/"), 800);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggleInbox = (id: string) => setSelectedInboxes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const updateSequence = (index: number, patch: Partial<SequenceStepInput>) => setSequence((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const goNext = () => {
    if (!source || !payload) return;
    if (step === 1 && (!emailColumn || sequence.some((item) => !item.subject_column || !item.body_column))) return toast.error("Map email, subject, and body columns for every step");
    if (step === 2 && selectedInboxes.length === 0) return toast.error("Select at least one inbox");
    if (step === 3) {
      if (sequence.length === 0 || sequence[0].day_offset !== 0) {
        return toast.error("Initial email must use 0 days");
      }
      if (sequence.slice(1).some((item) => !Number.isFinite(item.day_offset) || item.day_offset < 1)) {
        return toast.error("Each follow-up must be at least 1 day after the previous email");
      }
      if (!Number.isFinite(minGapMinutes) || !Number.isFinite(maxGapMinutes) || minGapMinutes < 1 || maxGapMinutes < 1) {
        return toast.error("Email gap must be at least 1 minute");
      }
      if (minGapMinutes > maxGapMinutes) {
        return toast.error("Maximum gap must be greater than or equal to minimum gap");
      }
      return previewMutation.mutate(payload);
    }
    if (step === 4) return createMutation.mutate(payload);
    setStep((current) => Math.min(5, current + 1));
  };

  return <div className="min-h-svh bg-[#f4f4f5] text-zinc-950" data-testid="csv-campaign-wizard"><header className="border-b border-zinc-200 bg-white" data-testid="wizard-header"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6"><Link to="/" className="flex items-center gap-3" data-testid="wizard-brand-link"><div className="flex size-8 items-center justify-center rounded-md bg-zinc-950 text-white"><Mail size={16} /></div><div><p className="font-heading text-base font-semibold tracking-tight" data-testid="wizard-brand-name">Mailflow</p><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400" data-testid="wizard-brand-subtitle">Deepanshu's workspace</p></div></Link><Link to="/" className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950" data-testid="wizard-exit-button"><ArrowLeft size={14} /> Exit setup</Link></div></header>
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6"><div className="grid gap-7 lg:grid-cols-[250px_1fr]"><aside data-testid="wizard-stepper"><p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Campaign setup</p><div className="space-y-1">{wizardSteps.map((label, index) => <div key={label} className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${index === step ? "bg-zinc-950 text-white" : index < step ? "text-emerald-700" : "text-zinc-400"}`} data-testid={`wizard-step-${index}`}><span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${index === step ? "bg-white text-zinc-950" : index < step ? "bg-emerald-100" : "bg-zinc-200 text-zinc-500"}`}>{index < step ? <Check size={12} /> : index + 1}</span><span className="text-sm font-medium">{label}</span></div>)}</div><div className="mt-6 border border-emerald-200 bg-emerald-50 p-3" data-testid="exact-copy-rule"><div className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-700" /><div><p className="text-xs font-semibold text-emerald-900">Exact-copy guarantee</p><p className="mt-1 text-[11px] leading-relaxed text-emerald-800">Mailflow reads, schedules, and sends your CSV text without generating or rewriting it.</p></div></div></div></aside>
      <section className="min-w-0" data-testid="wizard-content"><div className="mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500" data-testid="wizard-eyebrow">Step {step + 1} of 6</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="wizard-title">{wizardSteps[step]}</h1></div>
        {step === 0 ? <div className="border border-zinc-200 bg-white p-5" data-testid="upload-step"><label className="flex min-h-80 cursor-pointer flex-col items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center transition-colors hover:border-zinc-500 hover:bg-zinc-100" data-testid="csv-upload-dropzone"><div className="flex size-12 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600"><Upload size={19} /></div><h2 className="mt-5 font-heading text-xl font-medium">Upload your lead CSV</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">The first row must contain column names. Every lead keeps its own subject and body exactly as uploaded.</p><span className="mt-5 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">{uploadMutation.isPending ? "Reading CSV…" : "Choose CSV file"}</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadMutation.mutate(file); }} data-testid="csv-file-input" /></label></div> : null}

        {step === 1 && source ? <div className="space-y-4" data-testid="mapping-step"><div className="border border-zinc-200 bg-white p-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><FileSpreadsheet size={17} /></div><div><p className="text-sm font-medium" data-testid="uploaded-filename">{source.filename}</p><p className="text-xs text-zinc-500" data-testid="uploaded-summary">{source.row_count} leads · {source.columns.length} columns</p></div></div></div><div className="border border-zinc-200 bg-white p-5"><h2 className="font-heading text-lg font-medium">Lead identity</h2><p className="mt-1 text-xs text-zinc-500">Map your CSV headers. No fixed column names are assumed.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><ColumnSelect label="Recipient email" value={emailColumn} columns={source.columns} onChange={setEmailColumn} testId="map-email-column" /><ColumnSelect label="First name" value={firstNameColumn} columns={source.columns} onChange={setFirstNameColumn} optional testId="map-first-name-column" /><ColumnSelect label="Company" value={companyColumn} columns={source.columns} onChange={setCompanyColumn} optional testId="map-company-column" /><ColumnSelect label="Existing status" value={statusColumn} columns={source.columns} onChange={setStatusColumn} optional testId="map-status-column" /></div></div><div className="border border-zinc-200 bg-white p-5"><h2 className="font-heading text-lg font-medium">Personalized message columns</h2><p className="mt-1 text-xs text-zinc-500">Each pair is read from the same lead row. Content is never mixed between leads.</p><div className="mt-5 space-y-5">{sequence.map((item, index) => <div key={item.key} className="border-t border-zinc-100 pt-4 first:border-0 first:pt-0" data-testid={`mapping-sequence-${index}`}><p className="mb-3 text-sm font-medium">{item.label}</p><div className="grid gap-4 sm:grid-cols-2"><ColumnSelect label="Subject column" value={item.subject_column} columns={source.columns} onChange={(value) => updateSequence(index, { subject_column: value })} testId={`map-${item.key}-subject`} /><ColumnSelect label="Body column" value={item.body_column} columns={source.columns} onChange={(value) => updateSequence(index, { body_column: value })} testId={`map-${item.key}-body`} /></div></div>)}</div></div></div> : null}

        {step === 2 ? <div className="border border-zinc-200 bg-white" data-testid="inbox-step"><div className="border-b border-zinc-200 p-5"><h2 className="font-heading text-lg font-medium">Choose sending inboxes</h2><p className="mt-1 text-xs text-zinc-500">Mailflow distributes leads round-robin and respects each inbox's daily limit.</p></div><div className="max-h-[430px] divide-y divide-zinc-100 overflow-y-auto">{connectedInboxes.length ? connectedInboxes.map((inbox) => <label key={inbox.id} className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-zinc-50" data-testid={`wizard-inbox-${inbox.id}`}><input type="checkbox" checked={selectedInboxes.includes(inbox.id)} onChange={() => toggleInbox(inbox.id)} className="size-4 accent-zinc-950" data-testid={`wizard-inbox-checkbox-${inbox.id}`} /><div className="flex size-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-600"><InboxIcon size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{inbox.display_name}</p><p className="truncate text-xs text-zinc-500">{inbox.email}</p></div><div className="text-right"><p className="text-xs font-medium">{inbox.daily_sending_limit} / day</p><p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${inbox.is_mocked ? "text-amber-600" : "text-emerald-600"}`}>{inbox.is_mocked ? "Preview inbox" : "Gmail connected"}</p></div></label>) : <div className="p-8 text-center"><p className="text-sm font-medium">No inboxes available</p><p className="mt-1 text-xs text-zinc-500">Return to the dashboard and connect Gmail first.</p></div>}</div></div> : null}

        {step === 3 ? <div className="space-y-4" data-testid="sequence-step"><div className="border border-zinc-200 bg-white p-5"><label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-500">Campaign name</span><Input value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-md" data-testid="csv-campaign-name-input" /></label><label className="mt-4 block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-500">Timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm" data-testid="campaign-timezone-select"><option value="Asia/Kolkata">India Standard Time</option><option value="America/New_York">Eastern Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="Europe/London">London</option><option value="UTC">UTC</option></select></label><div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4" data-testid="random-email-gap-settings"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-500">Random email gap</span><p className="mb-4 text-xs leading-relaxed text-zinc-500">Each email will be randomly scheduled between the minimum and maximum gap.</p><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-medium text-zinc-700">Minimum gap</span><div className="flex items-center gap-2"><Input type="number" min="1" max="1440" value={minGapMinutes} onChange={(event) => setMinGapMinutes(Number(event.target.value))} className="h-10 rounded-md" data-testid="min-gap-minutes" /><span className="text-sm text-zinc-500">minutes</span></div></label><label><span className="mb-2 block text-xs font-medium text-zinc-700">Maximum gap</span><div className="flex items-center gap-2"><Input type="number" min="1" max="1440" value={maxGapMinutes} onChange={(event) => setMaxGapMinutes(Number(event.target.value))} className="h-10 rounded-md" data-testid="max-gap-minutes" /><span className="text-sm text-zinc-500">minutes</span></div></label></div><p className="mt-3 text-[11px] text-zinc-500">Default: 10–20 minutes.</p></div></div>{sequence.map((item, index) => <div key={item.key} className="border border-zinc-200 bg-white p-5" data-testid={`sequence-card-${index}`}><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-600"><Clock3 size={16} /></div><div><h2 className="text-sm font-medium">{item.label}</h2><p className="text-xs text-zinc-500">{item.subject_column} + {item.body_column}</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-500">{index === 0 ? "Days after campaign start" : "Days after previous email"}</span><Input type="number" min={index === 0 ? "0" : "1"} value={item.day_offset} onChange={(event) => updateSequence(index, { day_offset: Number(event.target.value) })} className="h-10 rounded-md" data-testid={`sequence-day-${index}`} /></label><label><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-500">Send time</span><Input type="time" value={item.send_time} onChange={(event) => updateSequence(index, { send_time: event.target.value })} className="h-10 rounded-md" data-testid={`sequence-time-${index}`} /></label></div></div>)}</div> : null}

        {step === 4 && preview ? <div className="space-y-4" data-testid="preview-step"><div className="grid gap-3 sm:grid-cols-3"><div className="border border-zinc-200 bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Total rows</p><p className="mt-3 font-heading text-2xl font-semibold">{source?.row_count}</p></div><div className="border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700">Ready</p><p className="mt-3 font-heading text-2xl font-semibold text-emerald-900">{preview.valid_count}</p></div><div className="border border-amber-200 bg-amber-50 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">Will skip</p><p className="mt-3 font-heading text-2xl font-semibold text-amber-900">{preview.skipped_count}</p></div></div>{preview.leads.map((lead) => <article key={lead.row_index} className="border border-zinc-200 bg-white p-5" data-testid={`preview-lead-${lead.row_index}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-medium" data-testid="preview-lead-name">{lead.first_name || lead.email}{lead.company ? ` — ${lead.company}` : ""}</h2><p className="mt-1 text-xs text-zinc-500" data-testid="preview-lead-email">{lead.email} · CSV row {lead.row_index}</p></div>{lead.error ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">Skipped: {lead.error}</span> : <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">Exact content ready</span>}</div><div className="mt-4 space-y-4">{lead.steps.map((message) => <div key={message.key} className="border-t border-zinc-100 pt-4 first:border-0 first:pt-0"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">{message.label}</p><p className="mt-2 text-sm font-medium" data-testid="preview-message-subject">{message.subject}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600" data-testid="preview-message-body">{message.body}</p></div>)}</div></article>)}</div> : null}

        {step === 5 ? <div className="border border-zinc-200 bg-white p-6" data-testid="launch-step"><div className="flex size-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><Check size={20} /></div><h2 className="mt-5 font-heading text-2xl font-semibold">Ready to schedule</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{preview?.valid_count ?? 0} leads will be scheduled across {selectedInboxes.length} inbox{selectedInboxes.length === 1 ? "" : "es"}. Each subject and body remains byte-for-byte equivalent to the parsed CSV value. Incomplete rows are skipped.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="border border-zinc-200 p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-400">Emails</p><p className="mt-2 text-lg font-semibold">{(preview?.valid_count ?? 0) * sequence.length}</p></div><div className="border border-zinc-200 p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-400">Sequence steps</p><p className="mt-2 text-lg font-semibold">{sequence.length}</p></div><div className="border border-zinc-200 p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-400">Skipped leads</p><p className="mt-2 text-lg font-semibold">{preview?.skipped_count ?? 0}</p></div></div><Button onClick={() => createdCampaign && launchMutation.mutate(createdCampaign.id)} disabled={!createdCampaign || launchMutation.isPending} className="mt-7 gap-2 rounded-md bg-zinc-950 px-5 hover:bg-zinc-800" data-testid="launch-csv-campaign-button"><Mail size={15} /> {launchMutation.isPending ? "Scheduling…" : "Launch campaign"}</Button></div> : null}

        {step > 0 && step < 5 ? <div className="mt-6 flex w-full flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5" data-testid="wizard-footer"><Button type="button" variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} className="gap-2 rounded-md" data-testid="wizard-back-button"><ArrowLeft size={14} /> Back</Button><Button type="button" onClick={goNext} disabled={previewMutation.isPending || createMutation.isPending || (step === 2 && selectedInboxes.length === 0)} className="ml-auto gap-2 rounded-md bg-zinc-950 px-5 hover:bg-zinc-800" data-testid="wizard-next-button">{step === 4 ? "Create campaign" : step === 3 ? "Build preview" : "Continue"} <ArrowRight size={14} /></Button></div> : null}
      </section></div></main>{step === 5 && createdCampaign ? <div className="fixed bottom-5 right-5 z-30"><Button onClick={() => setTestOpen(true)} variant="outline" className="gap-2 border-blue-200 bg-white text-blue-700 shadow-lg hover:bg-blue-50" data-testid="launch-review-test-email-button"><FlaskConical size={14} /> Send test before launch</Button></div> : null}{testOpen && createdCampaign ? <TestEmailDialog campaignId={createdCampaign.id} inboxCount={createdCampaign.inbox_ids.length} onClose={() => setTestOpen(false)} /> : null}<Toaster position="bottom-right" richColors /></div>;
}
