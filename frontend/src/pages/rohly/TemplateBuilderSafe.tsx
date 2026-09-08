import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, Plus, RefreshCw, Rocket, Trash2, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Inbox, Recipient, Template } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/rohly/Primitives";

type Step = { template_id: string; label: string; delay_days: number };
type RecipientList = { id: string; filename: string; row_count: number; columns: string[]; uploaded_at: string };
type UseListResponse = { source_id: string; filename: string; recipient_ids: string[]; count: number };

const previewValue = (value: string, recipient?: Recipient) => {
  const name = recipient?.name || "John Smith";
  const values: Record<string, string> = {
    first_name: name.split(" ")[0],
    name,
    full_name: name,
    email: recipient?.email || "john@example.com",
    company: recipient?.company || "ABC Corp",
    job_title: "Sales Manager",
    industry: "Leather Products",
    city: "Toronto",
    country: "Canada",
  };
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key.toLowerCase()] ?? "");
};

export default function TemplateBuilderSafe() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("Rohly outreach campaign");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedInboxes, setSelectedInboxes] = useState<string[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [templateCreatorOpen, setTemplateCreatorOpen] = useState(false);
  const [templateCreatorStep, setTemplateCreatorStep] = useState(0);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
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
  const inboxesQuery = useQuery({ queryKey: ["rohly-campaign-inboxes"], queryFn: () => apiGet<Inbox[]>("/workspace/inboxes") });
  const listsQuery = useQuery({ queryKey: ["rohly-recipient-lists"], queryFn: () => apiGet<RecipientList[]>("/workspace/rohly-campaign-lists") });
  const templates = templatesQuery.data ?? [];
  const recipients = recipientsQuery.data ?? [];
  const inboxes = (inboxesQuery.data ?? []).filter((inbox) => inbox.status === "connected");
  const lists = listsQuery.data ?? [];
  const selectedPreview = recipients.find((item) => item.id === previewRecipient) || recipients.find((item) => selectedRecipients.includes(item.id));
  const selectedTemplates = useMemo(() => Object.fromEntries(templates.map((template) => [template.id, template])), [templates]);

  const useListMutation = useMutation({
    mutationFn: (sourceId: string) => apiPost<UseListResponse>(`/workspace/rohly-campaign-lists/${sourceId}/use`, {}),
    onSuccess: async (result) => {
      setSelectedRecipients((current) => Array.from(new Set([...current, ...result.recipient_ids])));
      setSelectedLists((current) => Array.from(new Set([...current, result.source_id])));
      await queryClient.invalidateQueries({ queryKey: ["rohly-campaign-recipients"] });
      toast.success(`${result.count} contacts added from ${result.filename}`);
      setListPickerOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add this list"),
  });

  const createTemplateMutation = useMutation({
    mutationFn: () => apiPost<Template>("/workspace/templates", {
      name: newTemplateName.trim(),
      subject: newTemplateSubject,
      body: newTemplateBody,
    }),
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: ["rohly-campaign-templates"] });
      setSteps((current) => current.map((step, index) => index === templateCreatorStep ? { ...step, template_id: template.id } : step));
      setTemplateCreatorOpen(false);
      setNewTemplateName("");
      setNewTemplateSubject("");
      setNewTemplateBody("");
      toast.success(`Template “${template.name}” created and selected`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create template"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await apiPost<{ id: string }>("/workspace/rohly-campaigns", {
        name,
        inbox_ids: selectedInboxes,
        recipient_ids: selectedRecipients,
        steps,
        timezone,
        min_gap_minutes: minGapMinutes,
        max_gap_minutes: maxGapMinutes,
        sending_window_start: sendingWindowStart,
        sending_window_end: sendingWindowEnd,
        sending_days: sendingDays,
      });
      await apiPost(`/workspace/rohly-campaigns/${created.id}/launch`, {});
      return created;
    },
    onSuccess: () => {
      toast.success("Rohly campaign launched");
      setTimeout(() => navigate("/campaigns"), 700);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not launch campaign"),
  });

  const toggle = (current: string[], id: string) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
  const addFollowUp = () => {
    const number = steps.length;
    setSteps((current) => [...current, { template_id: "", label: `Follow-up ${number}`, delay_days: number === 1 ? 2 : 3 }]);
  };
  const openTemplateCreator = (stepIndex: number) => {
    setTemplateCreatorStep(stepIndex);
    setNewTemplateName("");
    setNewTemplateSubject("");
    setNewTemplateBody("");
    setTemplateCreatorOpen(true);
  };
  const updateStep = (index: number, patch: Partial<Step>) => setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  const removeStep = (index: number) => setSteps((current) => current.filter((_, i) => i !== index));
  const validateAndLaunch = () => {
    if (!name.trim()) return toast.error("Enter a campaign name");
    if (!selectedRecipients.length) return toast.error("Select at least one recipient or add a recipient list");
    if (!selectedInboxes.length) return toast.error("Select at least one sending inbox");
    if (steps.some((step) => !step.template_id)) return toast.error("Choose a template for every email step");
    if (steps.slice(1).some((step) => step.delay_days < 1)) return toast.error("Follow-ups must be at least 1 day after the previous email");
    if (minGapMinutes < 1 || maxGapMinutes < minGapMinutes) return toast.error("Enter a valid minimum/maximum email gap");
    if (sendingWindowStart >= sendingWindowEnd) return toast.error("Working-hours start must be before the end time");
    if (!sendingDays.length) return toast.error("Select at least one working day");
    createMutation.mutate();
  };

  return (
    <div data-testid="template-campaign-wizard-page">
      <Link to="/campaigns/new" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><ArrowLeft size={13} /> Campaign source</Link>
      <PageHeader eyebrow="Rohly Template Campaign" title="Set up a reusable outreach sequence" description="Use one template across your recipients. Rohly replaces variables like {{first_name}} and {{company}} automatically for every email." />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="space-y-4">
          <Surface className="p-5"><h2 className="font-heading text-lg font-medium">Campaign details</h2><label className="mt-4 block text-xs font-semibold">Campaign name<Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-10" /></label></Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-medium">Sending inboxes</h2><p className="mt-1 text-xs text-slate-500">Select the Gmail inboxes that can send this campaign. Emails are distributed round-robin.</p></div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => inboxesQuery.refetch()} className="gap-1"><RefreshCw size={13} /> Refresh</Button><Link to="/inboxes" className="text-xs font-semibold text-blue-700">Connect inbox</Link></div></div>
            <div className="mt-4 space-y-2">{inboxes.length ? inboxes.map((inbox) => <label key={inbox.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${selectedInboxes.includes(inbox.id) ? "border-blue-300 bg-blue-50/40" : "border-slate-200"}`}><input type="checkbox" checked={selectedInboxes.includes(inbox.id)} onChange={() => setSelectedInboxes(toggle(selectedInboxes, inbox.id))} className="size-4 accent-blue-700" /><div className="flex-1"><p className="text-sm font-medium">{inbox.display_name}</p><p className="text-xs text-slate-500">{inbox.email}</p></div><span className="text-xs text-slate-500">{inbox.daily_sending_limit}/day</span></label>) : <div className="p-5 text-center text-sm text-slate-500">No connected Gmail inboxes found. <Link to="/inboxes" className="font-semibold text-blue-700">Connect one</Link></div>}</div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-medium">Recipients</h2><p className="mt-1 text-xs text-slate-500">Choose individual contacts or add an existing imported list.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setListPickerOpen(true)} className="gap-1"><FileSpreadsheet size={13} /> Add recipient list</Button></div>
            <p className="mt-2 text-xs font-semibold text-blue-700">{selectedRecipients.length} selected</p>
            <div className="mt-4 max-h-64 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">{recipients.length ? recipients.map((recipient) => <label key={recipient.id} className="flex cursor-pointer items-center gap-3 p-3"><input type="checkbox" checked={selectedRecipients.includes(recipient.id)} onChange={() => setSelectedRecipients(toggle(selectedRecipients, recipient.id))} className="size-4 accent-blue-700" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{recipient.name}</p><p className="truncate text-xs text-slate-500">{recipient.email}{recipient.company ? ` · ${recipient.company}` : ""}</p></div></label>) : <div className="p-6 text-center text-sm text-slate-500">No recipients yet. Add an imported list to continue.</div>}</div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-medium">Email sequence</h2><p className="mt-1 text-xs text-slate-500">Choose a reusable template for each step, or create one now.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openTemplateCreator(steps.length - 1)} className="gap-1"><Plus size={14} /> Create template</Button><Button variant="outline" size="sm" onClick={addFollowUp} className="gap-1"><Plus size={14} /> Add follow-up</Button></div></div>
            <div className="mt-5 space-y-3">{steps.map((step, index) => { const template = selectedTemplates[step.template_id]; return <div key={`${index}-${step.template_id}`} className="rounded-lg border border-slate-200 p-4"><div className="flex items-center gap-3"><div className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{index + 1}</div><div className="flex-1"><p className="text-sm font-semibold">{step.label}</p>{index > 0 && <p className="text-[11px] text-slate-500">Days after previous email</p>}</div>{index > 0 && <Button variant="ghost" size="icon" onClick={() => removeStep(index)}><Trash2 size={15} /></Button>}</div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px]"><div><label className="block text-xs font-semibold">Template<select value={step.template_id} onChange={(e) => updateStep(index, { template_id: e.target.value })} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Select a saved template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button type="button" variant="ghost" size="sm" onClick={() => openTemplateCreator(index)} className="mt-1 px-0 text-xs text-blue-700"><Plus size={12} /> Create new template for this step</Button>{template && <p className="mt-1 truncate text-[11px] text-slate-500">{template.subject}</p>}</div>{index > 0 && <label className="block text-xs font-semibold">Delay (days)<Input type="number" min={1} value={step.delay_days} onChange={(e) => updateStep(index, { delay_days: Number(e.target.value) })} className="mt-2 h-10" /></label>}</div></div>; })}</div>
          </Surface>

          <Surface className="p-5">
            <h2 className="font-heading text-lg font-medium">Sending schedule</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Timezone<select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option>Asia/Kolkata</option><option>America/Toronto</option><option>America/New_York</option><option>Europe/London</option><option>UTC</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Min gap (min)<Input type="number" min={1} value={minGapMinutes} onChange={(e) => setMinGapMinutes(Number(e.target.value))} className="mt-2 h-10" /></label><label className="text-xs font-semibold">Max gap (min)<Input type="number" min={1} value={maxGapMinutes} onChange={(e) => setMaxGapMinutes(Number(e.target.value))} className="mt-2 h-10" /></label></div><label className="text-xs font-semibold">Start time<Input type="time" value={sendingWindowStart} onChange={(e) => setSendingWindowStart(e.target.value)} className="mt-2 h-10" /></label><label className="text-xs font-semibold">End time<Input type="time" value={sendingWindowEnd} onChange={(e) => setSendingWindowEnd(e.target.value)} className="mt-2 h-10" /></label></div>
            <div className="mt-4"><p className="text-xs font-semibold">Sending days</p><div className="mt-2 flex flex-wrap gap-2">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, index) => <button type="button" key={day} onClick={() => setSendingDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${sendingDays.includes(index) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>{day}</button>)}</div></div>
          </Surface>

          <div className="flex justify-end"><Button onClick={validateAndLaunch} disabled={createMutation.isPending} className="gap-2"><Rocket size={15} /> {createMutation.isPending ? "Launching…" : "Launch campaign"}</Button></div>
        </div>

        <Surface className="h-fit p-5"><h2 className="font-heading text-lg font-medium">Personalization preview</h2><p className="mt-1 text-xs text-slate-500">Preview how your selected template will look for a recipient.</p><select value={previewRecipient} onChange={(e) => setPreviewRecipient(e.target.value)} className="mt-4 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Choose recipient</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} — {recipient.email}</option>)}</select>{steps[0]?.template_id && selectedTemplates[steps[0].template_id] ? <div className="mt-4 rounded-lg border border-slate-200 p-4"><p className="text-sm font-semibold">{previewValue(selectedTemplates[steps[0].template_id].subject, selectedPreview)}</p><div className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{previewValue(selectedTemplates[steps[0].template_id].body, selectedPreview)}</div></div> : <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">Select or create a template to see a preview.</div>}</Surface>
      </div>

      {listPickerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h3 className="font-heading text-lg font-medium">Choose recipient list</h3><Button variant="ghost" size="icon" onClick={() => setListPickerOpen(false)}><X size={16} /></Button></div><div className="mt-4 space-y-2">{lists.length ? lists.map((list) => <button key={list.id} type="button" disabled={useListMutation.isPending} onClick={() => useListMutation.mutate(list.id)} className="w-full rounded-lg border border-slate-200 p-4 text-left hover:bg-slate-50"><p className="text-sm font-semibold">{list.filename}</p><p className="mt-1 text-xs text-slate-500">{list.row_count} rows · {list.columns.join(", ")}</p>{selectedLists.includes(list.id) && <p className="mt-1 text-xs font-semibold text-blue-700">Already added</p>}</button>) : <p className="p-5 text-center text-sm text-slate-500">No imported lists found. <Link to="/imports" className="font-semibold text-blue-700">Import a CSV</Link> first.</p>}</div></div></div>}

      {templateCreatorOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"><div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><div><h3 className="font-heading text-lg font-medium">Create email template</h3><p className="mt-1 text-xs text-slate-500">This template will be saved and selected for step {templateCreatorStep + 1}.</p></div><Button variant="ghost" size="icon" onClick={() => setTemplateCreatorOpen(false)}><X size={16} /></Button></div><label className="mt-5 block text-xs font-semibold">Template name<Input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="First outreach" className="mt-2 h-10" /></label><label className="mt-4 block text-xs font-semibold">Subject<Input value={newTemplateSubject} onChange={(e) => setNewTemplateSubject(e.target.value)} placeholder="Quick question about {{company}}" className="mt-2 h-10" /></label><label className="mt-4 block text-xs font-semibold">Email body<textarea value={newTemplateBody} onChange={(e) => setNewTemplateBody(e.target.value)} placeholder={'Hi {{first_name}},\n\nI wanted to reach out about {{company}}...'} className="mt-2 min-h-48 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" /></label><div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600"><strong>Personalization:</strong> You can use {"{{first_name}}, {{name}}, {{email}}, {{company}}, {{job_title}}, {{industry}}, {{city}}, and {{country}}"}.</div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setTemplateCreatorOpen(false)}>Cancel</Button><Button disabled={createTemplateMutation.isPending || !newTemplateName.trim() || !newTemplateSubject.trim() || !newTemplateBody.trim()} onClick={() => createTemplateMutation.mutate()}>{createTemplateMutation.isPending ? "Creating…" : "Create template"}</Button></div></div></div>}
    </div>
  );
}
