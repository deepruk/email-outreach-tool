import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Braces, Check, Clock3, FileSpreadsheet, Plus, RefreshCw, Rocket, Trash2, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Inbox, Recipient, Template } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/rohly/Primitives";

type Step = {
  label: string;
  delay_days: number;
  template_name: string;
  subject: string;
  body: string;
  template_id?: string;
};

type RecipientList = { id: string; filename: string; row_count: number; columns: string[]; uploaded_at: string };
type UseListResponse = { source_id: string; filename: string; recipient_ids: string[]; count: number; duplicate_count?: number; skipped_duplicates?: number };
type CreatedCampaign = { id: string };

const VARIABLES = ["{{first_name}}", "{{name}}", "{{email}}", "{{company}}", "{{job_title}}", "{{industry}}", "{{city}}", "{{country}}"];

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

const emptyStep = (index: number): Step => ({
  label: index === 0 ? "Initial email" : `Follow-up ${index}`,
  delay_days: index === 0 ? 0 : index === 1 ? 2 : 3,
  template_name: index === 0 ? "Initial outreach" : `Follow-up ${index}`,
  subject: index === 0 ? "" : "",
  body: "",
});

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("Rohly outreach campaign");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedInboxes, setSelectedInboxes] = useState<string[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [listRecipientMap, setListRecipientMap] = useState<Record<string, string[]>>({});
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([emptyStep(0)]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [minGapMinutes, setMinGapMinutes] = useState(10);
  const [maxGapMinutes, setMaxGapMinutes] = useState(20);
  const [sendingWindowStart, setSendingWindowStart] = useState("09:00");
  const [sendingWindowEnd, setSendingWindowEnd] = useState("18:00");
  const [sendingDays, setSendingDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [previewRecipient, setPreviewRecipient] = useState("");

  const recipientsQuery = useQuery({
    queryKey: ["rohly-campaign-recipients"],
    queryFn: () => apiGet<Recipient[]>("/workspace/rohly-campaigns/recipients"),
  });
  const inboxesQuery = useQuery({
    queryKey: ["rohly-campaign-inboxes"],
    queryFn: () => apiGet<Inbox[]>("/workspace/inboxes"),
  });
  const listsQuery = useQuery({
    queryKey: ["rohly-recipient-lists"],
    queryFn: () => apiGet<RecipientList[]>("/workspace/rohly-campaign-lists"),
  });
  const templatesQuery = useQuery({
    queryKey: ["rohly-campaign-templates"],
    queryFn: () => apiGet<Template[]>("/workspace/rohly-campaigns/templates"),
  });

  const recipients = recipientsQuery.data ?? [];
  const inboxes = (inboxesQuery.data ?? []).filter((inbox) => inbox.status === "connected");
  const lists = listsQuery.data ?? [];
  const selectedPreview = recipients.find((item) => item.id === previewRecipient) ||
    recipients.find((item) => selectedRecipients.includes(item.id));

  const useListMutation = useMutation({
    mutationFn: (sourceId: string) => apiPost<UseListResponse>(`/workspace/rohly-campaign-lists/${sourceId}/use`, {}),
    onSuccess: async (result) => {
      setSelectedRecipients((current) => Array.from(new Set([...current, ...result.recipient_ids])));
      setSelectedLists((current) => Array.from(new Set([...current, result.source_id])));
      setListRecipientMap((current) => ({ ...current, [result.source_id]: result.recipient_ids }));
      await queryClient.invalidateQueries({ queryKey: ["rohly-campaign-recipients"] });
      const duplicates = result.duplicate_count ?? result.skipped_duplicates ?? 0;
      if (duplicates > 0) {
        toast.success(`${result.count} new contacts added from ${result.filename}; ${duplicates} duplicates skipped`);
      } else {
        toast.success(`${result.count} contacts added from ${result.filename}`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add this list"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const templateIds: string[] = [];
      for (const step of steps) {
        const template = await apiPost<Template>("/workspace/templates", {
          name: step.template_name.trim(),
          subject: step.subject.trim(),
          body: step.body,
        });
        templateIds.push(template.id);
      }

      const created = await apiPost<CreatedCampaign>("/workspace/rohly-campaigns", {
        name,
        inbox_ids: selectedInboxes,
        recipient_ids: selectedRecipients,
        steps: steps.map((step, index) => ({
          template_id: templateIds[index],
          label: step.label,
          delay_days: step.delay_days,
        })),
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

  const toggle = (setter: Dispatch<SetStateAction<string[]>>, id: string) =>
    setter((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const removeRecipientList = (sourceId: string) => {
    const idsToRemove = new Set(listRecipientMap[sourceId] ?? []);
    setSelectedLists((current) => current.filter((id) => id !== sourceId));
    setListRecipientMap((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
    setSelectedRecipients((current) => current.filter((id) => !idsToRemove.has(id)));
    toast.success("Recipient list removed from this campaign");
  };

  const updateStep = (index: number, patch: Partial<Step>) =>
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));

  const addFollowUp = () => setSteps((current) => [...current, emptyStep(current.length)]);

  const removeStep = (index: number) =>
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));

  const insertVariable = (index: number, variable: string, field: "subject" | "body") => {
    const step = steps[index];
    updateStep(index, { [field]: step[field] + variable });
  };

  const validateAndLaunch = () => {
    if (!name.trim()) return toast.error("Enter a campaign name");
    if (!selectedRecipients.length) return toast.error("Select at least one recipient or add a recipient list");
    if (!selectedInboxes.length) return toast.error("Select at least one sending inbox");
    if (steps.some((step) => !step.template_name.trim() || !step.subject.trim() || !step.body.trim())) {
      return toast.error("Complete the template name, subject, and body for every email step");
    }
    if (steps.slice(1).some((step) => step.delay_days < 1)) return toast.error("Follow-ups must be at least 1 day after the previous email");
    if (minGapMinutes < 1 || maxGapMinutes < minGapMinutes) return toast.error("Enter a valid minimum/maximum email gap");
    if (sendingWindowStart >= sendingWindowEnd) return toast.error("Working-hours start must be before the end time");
    if (!sendingDays.length) return toast.error("Select at least one working day");
    createMutation.mutate();
  };

  return (
    <div data-testid="template-campaign-wizard-page">
      <Link to="/campaigns" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
        <ArrowLeft size={13} /> Campaigns
      </Link>

      <PageHeader
        eyebrow="New campaign"
        title="Create your outreach campaign"
        description="Write your email directly in Rohly, personalize it with variables, add follow-ups, choose your leads and inboxes, then launch."
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="space-y-4">
          <Surface className="p-5" testId="template-campaign-details">
            <h2 className="font-heading text-lg font-medium">Campaign details</h2>
            <label className="mt-4 block text-xs font-semibold">
              Campaign name
              <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10" />
            </label>
          </Surface>

          <Surface className="p-5" testId="template-campaign-inboxes">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-medium">Sending inboxes</h2>
                <p className="mt-1 text-xs text-slate-500">Select Gmail inboxes for this campaign. Emails are distributed round-robin.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inboxesQuery.refetch()} className="gap-1">
                  <RefreshCw size={13} /> Refresh
                </Button>
                <Link to="/inboxes" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  <Plus size={13} /> Connect inbox
                </Link>
                <span className="text-xs font-semibold text-blue-700">{selectedInboxes.length} selected</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {inboxes.length ? inboxes.map((inbox) => (
                <label key={inbox.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-slate-50 ${selectedInboxes.includes(inbox.id) ? "border-blue-300 bg-blue-50/40" : "border-slate-200"}`}>
                  <input type="checkbox" checked={selectedInboxes.includes(inbox.id)} onChange={() => toggle(setSelectedInboxes, inbox.id)} className="size-4 accent-blue-700" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{inbox.display_name}</p>
                    <p className="text-xs text-slate-500">{inbox.email}</p>
                  </div>
                  <span className="text-xs text-slate-500">{inbox.daily_sending_limit}/day</span>
                </label>
              )) : (
                <div className="p-5 text-center">
                  <p className="text-sm text-slate-500">No connected Gmail inboxes found.</p>
                  <Link to="/inboxes" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <Plus size={13} /> Connect a Gmail inbox
                  </Link>
                </div>
              )}
            </div>
          </Surface>

          <Surface className="p-5" testId="template-campaign-recipients">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-medium">Recipients</h2>
                <p className="mt-1 text-xs text-slate-500">Choose leads already in Rohly or add a list. Existing and previously used contacts are automatically skipped.</p>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setListPickerOpen(true)} className="gap-1">
                  <FileSpreadsheet size={13} /> Add recipient list
                </Button>
                <span className="text-xs font-semibold text-blue-700">{selectedRecipients.length} selected</span>
              </div>
            </div>

            {selectedLists.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedLists.map((sourceId) => {
                  const list = lists.find((item) => item.id === sourceId);
                  return <span key={sourceId} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"><Check size={11} /> {list?.filename || "Imported list"}<button type="button" aria-label={`Remove ${list?.filename || "imported list"}`} onClick={() => removeRecipientList(sourceId)} className="ml-1 rounded-full p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800"><X size={11} /></button></span>;
                })}
              </div>
            )}

            <div className="mt-4 max-h-64 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">
              {recipients.length ? recipients.map((recipient) => (
                <label key={recipient.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50">
                  <input type="checkbox" checked={selectedRecipients.includes(recipient.id)} onChange={() => toggle(setSelectedRecipients, recipient.id)} className="size-4 accent-blue-700" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{recipient.name}</p>
                    <p className="truncate text-xs text-slate-500">{recipient.email}{recipient.company ? ` · ${recipient.company}` : ""}</p>
                  </div>
                </label>
              )) : (
                <div className="p-6 text-center text-sm text-slate-500">No recipients yet. Add a recipient list to get started.</div>
              )}
            </div>
          </Surface>

          <Surface className="p-5" testId="template-campaign-sequence">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-medium">Email sequence</h2>
                <p className="mt-1 text-xs text-slate-500">Write each email directly here, just like a modern outreach platform.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addFollowUp} className="gap-1">
                <Plus size={14} /> Add follow-up
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              {steps.map((step, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{index + 1}</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{step.label}</p>
                      {index > 0 && <p className="text-[11px] text-slate-500">Days after previous email</p>}
                    </div>
                    {index > 0 && <Button type="button" variant="ghost" size="icon" onClick={() => removeStep(index)}><Trash2 size={15} /></Button>}
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-semibold">
                      Template name
                      <Input value={step.template_name} onChange={(event) => updateStep(index, { template_name: event.target.value })} className="mt-2 h-10" />
                    </label>

                    <label className="block text-xs font-semibold">
                      Subject
                      <Input value={step.subject} onChange={(event) => updateStep(index, { subject: event.target.value })} placeholder="Hi {{first_name}} — quick question" className="mt-2 h-10" />
                    </label>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold">Email body</label>
                        <span className="text-[10px] font-medium text-slate-400">Click a variable to insert it</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {VARIABLES.map((variable) => (
                          <button type="button" key={variable} onClick={() => insertVariable(index, variable, "body")} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                            {variable}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={step.body}
                        onChange={(event) => updateStep(index, { body: event.target.value })}
                        placeholder={"Hi {{first_name}},\n\nI wanted to reach out about {{company}}..."}
                        rows={10}
                        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><Braces size={12} /> Variables are replaced automatically for every recipient before sending.</p>
                    </div>

                    {index > 0 && (
                      <label className="block max-w-48 text-xs font-semibold">
                        Delay after previous email
                        <Input type="number" min={1} value={step.delay_days} onChange={(event) => updateStep(index, { delay_days: Number(event.target.value) })} className="mt-2 h-10" />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="p-5" testId="template-campaign-schedule">
            <div className="flex items-center gap-2"><Clock3 size={16} /><h2 className="font-heading text-lg font-medium">Sending schedule</h2></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option>Asia/Kolkata</option><option>America/Toronto</option><option>America/New_York</option><option>Europe/London</option><option>UTC</option></select></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Min gap<Input type="number" min={1} value={minGapMinutes} onChange={(event) => setMinGapMinutes(Number(event.target.value))} className="mt-2 h-10" /></label><label className="text-xs font-semibold">Max gap<Input type="number" min={1} value={maxGapMinutes} onChange={(event) => setMaxGapMinutes(Number(event.target.value))} className="mt-2 h-10" /></label></div>
              <label className="text-xs font-semibold">Start time<Input type="time" value={sendingWindowStart} onChange={(event) => setSendingWindowStart(event.target.value)} className="mt-2 h-10" /></label>
              <label className="text-xs font-semibold">End time<Input type="time" value={sendingWindowEnd} onChange={(event) => setSendingWindowEnd(event.target.value)} className="mt-2 h-10" /></label>
            </div>
            <div className="mt-4"><p className="text-xs font-semibold">Working days</p><div className="mt-2 flex flex-wrap gap-2">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, index) => <button type="button" key={day} onClick={() => setSendingDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${sendingDays.includes(index) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>{day}</button>)}</div></div>
          </Surface>
        </div>

        <div className="space-y-4">
          <Surface className="sticky top-4 p-5" testId="template-campaign-preview">
            <div className="flex items-center gap-2"><Braces size={15} /><h2 className="font-heading text-lg font-medium">Live preview</h2></div>
            <select value={previewRecipient} onChange={(event) => setPreviewRecipient(event.target.value)} className="mt-4 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
              <option value="">Preview sample lead</option>
              {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.company || recipient.email}</option>)}
            </select>
            <div className="mt-5 rounded-lg border border-slate-200 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{steps[0]?.label}</p>
              <p className="mt-3 text-sm font-semibold">{previewValue(steps[0]?.subject || "Your personalized subject", selectedPreview)}</p>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{previewValue(steps[0]?.body || "Write your email body on the left to see the personalized preview here.", selectedPreview)}</div>
            </div>
            <div className="mt-5 rounded-md bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              <strong>Personalization:</strong> Use the variable buttons in each email. Rohly fills the values for every lead before sending.
            </div>
            <Button onClick={validateAndLaunch} disabled={createMutation.isPending} className="mt-5 w-full gap-2 bg-blue-700 hover:bg-blue-800">
              <Rocket size={15} /> {createMutation.isPending ? "Creating campaign…" : "Launch campaign"} <ArrowRight size={14} />
            </Button>
          </Surface>
        </div>
      </div>

      {listPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Choose recipient list">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-lg font-semibold">Choose a recipient list</h2><p className="mt-1 text-xs text-slate-500">Add an imported list to this campaign.</p></div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => listsQuery.refetch()} className="gap-1"><RefreshCw size={13} /> Refresh</Button>
                <Link to="/imports" target="_blank" className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white"><Plus size={13} /> Upload list</Link>
                <Button type="button" variant="ghost" size="icon" onClick={() => setListPickerOpen(false)}><X size={17} /></Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto p-5">
              {lists.length ? lists.map((list) => {
                const active = selectedLists.includes(list.id);
                const busy = useListMutation.isPending && useListMutation.variables === list.id;
                return <div key={list.id} className={`flex items-center gap-3 rounded-lg border p-4 ${active ? "border-blue-300 bg-blue-50/50" : "border-slate-200"}`}>
                  <div className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><FileSpreadsheet size={15} /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{list.filename}</p><p className="mt-1 text-xs text-slate-500">{list.row_count} contacts · {list.columns.slice(0, 5).join(" · ")}{list.columns.length > 5 ? " …" : ""}</p></div>
                  <Button type="button" size="sm" variant={active ? "outline" : "default"} disabled={busy || active} onClick={() => useListMutation.mutate(list.id)} className="gap-1">{active ? <><Check size={13} /> Added</> : busy ? "Adding…" : "Add list"}</Button>
                </div>;
              }) : <div className="py-10 text-center"><p className="text-sm font-medium text-slate-700">No imported lists yet</p><p className="mt-1 text-xs text-slate-500">Upload a list and refresh.</p></div>}
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3"><Button type="button" variant="outline" onClick={() => setListPickerOpen(false)}>Done</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
