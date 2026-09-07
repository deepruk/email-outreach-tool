import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Braces, Clock3, Plus, Rocket, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Inbox, Recipient, Template } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/rohly/Primitives";

type Step = { template_id: string; label: string; delay_days: number };
type CreatedCampaign = { id: string };

const previewValue = (value: string, recipient?: Recipient) => {
  const name = recipient?.name || "John Smith";
  const values: Record<string, string> = {
    first_name: name.split(" ")[0], name, full_name: name, email: recipient?.email || "john@example.com",
    company: recipient?.company || "ABC Corp", job_title: "Sales Manager", industry: "Leather Products", city: "Toronto", country: "Canada",
  };
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key.toLowerCase()] ?? "");
};

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const [name, setName] = useState("Rohly outreach campaign");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedInboxes, setSelectedInboxes] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([{ template_id: "", label: "Initial email", delay_days: 0 }]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [minGapMinutes, setMinGapMinutes] = useState(10);
  const [maxGapMinutes, setMaxGapMinutes] = useState(20);
  const [sendingWindowStart, setSendingWindowStart] = useState("09:00");
  const [sendingWindowEnd, setSendingWindowEnd] = useState("18:00");
  const [sendingDays, setSendingDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [previewRecipient, setPreviewRecipient] = useState("");

  const templatesQuery = useQuery({ queryKey: ["rohly-campaign-templates"], queryFn: () => apiGet<Template[]>("/workspace/rohly-campaigns/templates") });
  const recipientsQuery = useQuery({ queryKey: ["rohly-campaign-recipients"], queryFn: () => apiGet<Recipient[]>("/workspace/rohly-campaigns/recipients") });
  const inboxesQuery = useQuery({ queryKey: ["rohly-campaign-inboxes"], queryFn: () => apiGet<Inbox[]>("/workspace/rohly-campaigns/inboxes") });
  const templates = templatesQuery.data ?? [];
  const recipients = recipientsQuery.data ?? [];
  const inboxes = inboxesQuery.data ?? [];
  const selectedPreview = recipients.find((item) => item.id === previewRecipient) || recipients.find((item) => selectedRecipients.includes(item.id));
  const selectedTemplates = useMemo(() => Object.fromEntries(templates.map((template) => [template.id, template])), [templates]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await apiPost<CreatedCampaign>("/workspace/rohly-campaigns", { name, inbox_ids: selectedInboxes, recipient_ids: selectedRecipients, steps, timezone, min_gap_minutes: minGapMinutes, max_gap_minutes: maxGapMinutes, sending_window_start: sendingWindowStart, sending_window_end: sendingWindowEnd, sending_days: sendingDays });
      await apiPost(`/workspace/rohly-campaigns/${created.id}/launch`, {});
      return created;
    },
    onSuccess: () => { toast.success("Rohly campaign launched"); setTimeout(() => navigate("/campaigns"), 700); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not launch campaign"),
  });

  const toggle = (setter: Dispatch<SetStateAction<string[]>>, id: string) => setter((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const addFollowUp = () => { const number = steps.length; setSteps((current) => [...current, { template_id: "", label: `Follow-up ${number}`, delay_days: number === 1 ? 2 : 3 }]); };
  const updateStep = (index: number, patch: Partial<Step>) => setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  const removeStep = (index: number) => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  const validateAndLaunch = () => {
    if (!name.trim()) return toast.error("Enter a campaign name");
    if (!selectedRecipients.length) return toast.error("Select at least one recipient");
    if (!selectedInboxes.length) return toast.error("Select at least one sending inbox");
    if (steps.some((step) => !step.template_id)) return toast.error("Choose a template for every email step");
    if (steps.slice(1).some((step) => step.delay_days < 1)) return toast.error("Follow-ups must be at least 1 day after the previous email");
    if (minGapMinutes < 1 || maxGapMinutes < minGapMinutes) return toast.error("Enter a valid minimum/maximum email gap");
    if (sendingWindowStart >= sendingWindowEnd) return toast.error("Working-hours start must be before the end time");
    if (!sendingDays.length) return toast.error("Select at least one working day");
    createMutation.mutate();
  };

  return <div data-testid="template-campaign-wizard-page">
    <Link to="/campaigns/new" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><ArrowLeft size={13} /> Campaign source</Link>
    <PageHeader eyebrow="Rohly Template Campaign" title="Set up a reusable outreach sequence" description="Use one template across your recipients. Rohly replaces variables like {{first_name}} and {{company}} automatically for every email." />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
      <div className="space-y-4">
        <Surface className="p-5" testId="template-campaign-details"><h2 className="font-heading text-lg font-medium">Campaign details</h2><label className="mt-4 block text-xs font-semibold">Campaign name<Input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10" /></label></Surface>
        <Surface className="p-5" testId="template-campaign-recipients"><div className="flex items-center justify-between"><div><h2 className="font-heading text-lg font-medium">Recipients</h2><p className="mt-1 text-xs text-slate-500">Choose the contacts who will receive the sequence.</p></div><span className="text-xs font-semibold text-blue-700">{selectedRecipients.length} selected</span></div><div className="mt-4 max-h-64 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">{recipients.length ? recipients.map((recipient) => <label key={recipient.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50"><input type="checkbox" checked={selectedRecipients.includes(recipient.id)} onChange={() => toggle(setSelectedRecipients, recipient.id)} className="size-4 accent-blue-700" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{recipient.name}</p><p className="truncate text-xs text-slate-500">{recipient.email}{recipient.company ? ` · ${recipient.company}` : ""}</p></div></label>) : <p className="p-6 text-center text-sm text-slate-500">No recipients yet. Add contacts from Imports first.</p>}</div></Surface>
        <Surface className="p-5" testId="template-campaign-inboxes"><div className="flex items-center justify-between"><div><h2 className="font-heading text-lg font-medium">Sending inboxes</h2><p className="mt-1 text-xs text-slate-500">Emails are distributed round-robin across selected connected inboxes.</p></div><span className="text-xs font-semibold text-blue-700">{selectedInboxes.length} selected</span></div><div className="mt-4 space-y-2">{inboxes.length ? inboxes.map((inbox) => <label key={inbox.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={selectedInboxes.includes(inbox.id)} onChange={() => toggle(setSelectedInboxes, inbox.id)} className="size-4 accent-blue-700" /><div className="flex-1"><p className="text-sm font-medium">{inbox.display_name}</p><p className="text-xs text-slate-500">{inbox.email} · {inbox.daily_sending_limit}/day</p></div></label>) : <p className="p-4 text-sm text-slate-500">No connected Gmail inboxes.</p>}</div></Surface>
        <Surface className="p-5" testId="template-campaign-sequence"><div className="flex items-center justify-between"><div><h2 className="font-heading text-lg font-medium">Email sequence</h2><p className="mt-1 text-xs text-slate-500">Choose a reusable Rohly template for each step.</p></div><Button variant="outline" size="sm" onClick={addFollowUp} className="gap-1"><Plus size={14} /> Add follow-up</Button></div><div className="mt-5 space-y-3">{steps.map((step, index) => { const template = selectedTemplates[step.template_id]; return <div key={`${index}-${step.template_id}`} className="rounded-lg border border-slate-200 p-4"><div className="flex items-center gap-3"><div className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{index + 1}</div><div className="flex-1"><p className="text-sm font-semibold">{step.label}</p>{index > 0 && <p className="text-[11px] text-slate-500">Days after previous email</p>}</div>{index > 0 && <Button variant="ghost" size="icon" onClick={() => removeStep(index)}><Trash2 size={15} /></Button>}</div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px]"><label className="block text-xs font-semibold">Template<select value={step.template_id} onChange={(event) => updateStep(index, { template_id: event.target.value })} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Select a saved template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{index > 0 && <label className="block text-xs font-semibold">Delay<Input type="number" min={1} value={step.delay_days} onChange={(event) => updateStep(index, { delay_days: Number(event.target.value) })} className="mt-2 h-10" /></label>}</div>{template && <div className="mt-3 rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold">{previewValue(template.subject, selectedPreview)}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{previewValue(template.body, selectedPreview)}</p></div>}</div>; })}</div></Surface>
        <Surface className="p-5" testId="template-campaign-schedule"><div className="flex items-center gap-2"><Clock3 size={16} /><h2 className="font-heading text-lg font-medium">Sending schedule</h2></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option>Asia/Kolkata</option><option>America/Toronto</option><option>America/New_York</option><option>Europe/London</option><option>UTC</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Min gap<Input type="number" min={1} value={minGapMinutes} onChange={(event) => setMinGapMinutes(Number(event.target.value))} className="mt-2 h-10" /></label><label className="text-xs font-semibold">Max gap<Input type="number" min={1} value={maxGapMinutes} onChange={(event) => setMaxGapMinutes(Number(event.target.value))} className="mt-2 h-10" /></label></div><label className="text-xs font-semibold">Start time<Input type="time" value={sendingWindowStart} onChange={(event) => setSendingWindowStart(event.target.value)} className="mt-2 h-10" /></label><label className="text-xs font-semibold">End time<Input type="time" value={sendingWindowEnd} onChange={(event) => setSendingWindowEnd(event.target.value)} className="mt-2 h-10" /></label></div><div className="mt-4"><p className="text-xs font-semibold">Working days</p><div className="mt-2 flex flex-wrap gap-2">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, index) => <button type="button" key={day} onClick={() => setSendingDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${sendingDays.includes(index) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>{day}</button>)}</div></div></Surface>
      </div>
      <div className="space-y-4"><Surface className="sticky top-4 p-5" testId="template-campaign-preview"><div className="flex items-center gap-2"><Braces size={15} /><h2 className="font-heading text-lg font-medium">Personalization preview</h2></div><select value={previewRecipient} onChange={(event) => setPreviewRecipient(event.target.value)} className="mt-4 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Preview sample lead</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.company || recipient.email}</option>)}</select>{steps[0]?.template_id && selectedTemplates[steps[0].template_id] ? <div className="mt-5 rounded-lg border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Initial email</p><p className="mt-3 text-sm font-semibold">{previewValue(selectedTemplates[steps[0].template_id].subject, selectedPreview)}</p><div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{previewValue(selectedTemplates[steps[0].template_id].body, selectedPreview)}</div></div> : <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Select a template to preview the personalized email.</div>}<div className="mt-5 rounded-md bg-blue-50 p-3 text-xs leading-5 text-blue-800"><strong>Automatic:</strong> every recipient gets the same template, with their own name, company, email and other supported variables filled in before sending.</div><Button onClick={validateAndLaunch} disabled={createMutation.isPending} className="mt-5 w-full gap-2 bg-blue-700 hover:bg-blue-800"><Rocket size={15} /> {createMutation.isPending ? "Scheduling campaign…" : "Launch campaign"} <ArrowRight size={14} /></Button><Link to="/campaigns/new" className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-slate-500"><ArrowLeft size={12} /> Back to campaign source</Link></Surface></div>
    </div>
  </div>;
}
