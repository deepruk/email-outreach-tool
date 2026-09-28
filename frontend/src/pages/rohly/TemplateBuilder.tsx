import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Braces, CalendarClock, Check, Clock3, FileSpreadsheet,
  FlaskConical, Mail, Plus, RefreshCw, Rocket, Settings2, Trash2, Upload, Users, X
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiUpload } from "@/lib/api";
import type { CsvSource, Inbox, Recipient, Template } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = {
  label: string;
  delay_days: number;
  template_name: string;
  subject: string;
  body: string;
  template_id?: string;
  variant_subject?: string;
  variant_body?: string;
  condition?: "always" | "opened" | "clicked" | "not_opened" | "not_clicked";
};

type RecipientList = { id: string; filename: string; row_count: number; columns: string[]; uploaded_at: string };
type UseListResponse = { source_id: string; filename: string; recipient_ids: string[]; recipients?: Recipient[]; count: number; duplicate_count?: number; skipped_duplicates?: number };
type CreatedCampaign = { id: string };
type RohlyDraft = { id: string; name: string; active_step: number; selected_recipients: string[]; selected_inboxes: string[]; selected_lists: string[]; list_recipient_map: Record<string, string[]>; steps: Step[]; timezone: string; min_gap_minutes: number; max_gap_minutes: number; sending_window_start: string; sending_window_end: string; sending_days: number[]; stop_on_reply: boolean; follow_up_priority: number; distribution_mode: "pattern" | "random"; updated_at: string };

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
  subject: "",
  body: "",
  condition: "always",
});

const stepLabels = ["Lead List", "Sequence", "Email Accounts", "SubSequences", "Settings"];

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(0);
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
  const [testEmail, setTestEmail] = useState("");
  const [testPassed, setTestPassed] = useState(false);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [followUpPriority, setFollowUpPriority] = useState(100);
  const [distributionMode, setDistributionMode] = useState<"pattern" | "random">("pattern");
  const [draftId, setDraftId] = useState<string | null>(searchParams.get("draft"));
  const [draftReady, setDraftReady] = useState(!searchParams.get("draft"));
  const hydratedDraft = useRef(false);

  const draftQuery = useQuery({
    queryKey: ["rohly-draft", searchParams.get("draft")],
    queryFn: () => apiGet<RohlyDraft>(`/workspace/rohly-campaigns/drafts/${searchParams.get("draft")}`),
    enabled: Boolean(searchParams.get("draft")),
  });

  useEffect(() => {
    const draft = draftQuery.data;
    if (!draft || hydratedDraft.current) return;
    hydratedDraft.current = true;
    setDraftId(draft.id); setName(draft.name || "Rohly outreach campaign"); setActiveStep(draft.active_step ?? 0);
    setSelectedRecipients(draft.selected_recipients ?? []); setSelectedInboxes(draft.selected_inboxes ?? []);
    setSelectedLists(draft.selected_lists ?? []); setListRecipientMap(draft.list_recipient_map ?? {});
    setSteps(draft.steps?.length ? draft.steps : [emptyStep(0)]); setTimezone(draft.timezone || "Asia/Kolkata");
    setMinGapMinutes(draft.min_gap_minutes ?? 10); setMaxGapMinutes(draft.max_gap_minutes ?? 20);
    setSendingWindowStart(draft.sending_window_start || "09:00"); setSendingWindowEnd(draft.sending_window_end || "18:00");
    setSendingDays(draft.sending_days?.length ? draft.sending_days : [0, 1, 2, 3, 4]);
    setStopOnReply(draft.stop_on_reply ?? true); setFollowUpPriority(draft.follow_up_priority ?? 100);
    setDistributionMode(draft.distribution_mode === "random" ? "random" : "pattern"); setDraftReady(true);
  }, [draftQuery.data]);

  useEffect(() => {
    if (searchParams.get("draft") && draftQuery.isError) { toast.error("This draft could not be loaded"); setDraftReady(true); }
  }, [searchParams, draftQuery.isError]);

  const saveDraftMutation = useMutation({
    mutationFn: (payload: Omit<RohlyDraft, "id" | "updated_at"> & { id?: string }) => apiPost<RohlyDraft>("/workspace/rohly-campaigns/drafts", payload),
    onSuccess: (draft) => {
      if (!draftId) { setDraftId(draft.id); window.history.replaceState({}, "", `/campaigns/new/template?draft=${draft.id}`); }
    },
    onError: () => undefined,
  });

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => saveDraftMutation.mutate({
      id: draftId || undefined, name, active_step: activeStep, selected_recipients: selectedRecipients, selected_inboxes: selectedInboxes,
      selected_lists: selectedLists, list_recipient_map: listRecipientMap, steps, timezone, min_gap_minutes: minGapMinutes, max_gap_minutes: maxGapMinutes,
      sending_window_start: sendingWindowStart, sending_window_end: sendingWindowEnd, sending_days: sendingDays, stop_on_reply: stopOnReply,
      follow_up_priority: followUpPriority, distribution_mode: distributionMode,
    }), 600);
    return () => window.clearTimeout(timer);
  }, [draftReady, draftId, name, activeStep, selectedRecipients, selectedInboxes, selectedLists, listRecipientMap, steps, timezone, minGapMinutes, maxGapMinutes, sendingWindowStart, sendingWindowEnd, sendingDays, stopOnReply, followUpPriority, distributionMode]);
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
      if (result.recipients?.length) {
        queryClient.setQueryData<Recipient[]>(["rohly-campaign-recipients"], (current = []) => {
          const byId = new Map(current.map((recipient) => [recipient.id, recipient]));
          for (const recipient of result.recipients ?? []) byId.set(recipient.id, recipient);
          return Array.from(byId.values());
        });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["rohly-campaign-recipients"] });
      }
      const duplicates = result.duplicate_count ?? result.skipped_duplicates ?? 0;
      toast.success(duplicates > 0
        ? `${result.count} new contacts added; ${duplicates} duplicates skipped`
        : `${result.count} contacts added from ${result.filename}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add this list"),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<CsvSource>("/csv/sources", form);
    },
    onSuccess: (result) => {
      // Upload creates the CSV source; import its leads into this campaign before showing success.
      useListMutation.mutate(result.id);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not upload this CSV"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!testEmail.trim()) throw new Error("Enter the email address where you want to receive the test");
      if (!selectedInboxes.length) throw new Error("Select a sending inbox first");
      const first = steps[0];
      return apiPost<{ success: boolean; recipient_email: string; inbox_email: string; mode: string }>(
        "/workspace/rohly-campaigns/test-run",
        {
          inbox_id: selectedInboxes[0],
          recipient_email: testEmail.trim(),
          subject: previewValue(first.subject.trim(), selectedPreview).trim(),
          body: previewValue(first.body, selectedPreview).trim(),
        }
      );
    },
    onSuccess: (result) => {
      setTestPassed(true);
      toast.success(`Test email sent to ${result.recipient_email} via ${result.inbox_email}`);
    },
    onError: (error) => {
      setTestPassed(false);
      toast.error(error instanceof Error ? error.message : "Test email failed");
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const templateIds: string[] = [];
      const variantTemplateIds: string[][] = [];
      for (let index = 0; index < steps.length; index += 1) {
        try {
          const step = steps[index];
          const template = await apiPost<Template>("/workspace/templates", {
            name: step.template_name.trim(),
            subject: step.subject.trim(),
            body: step.body,
          });
          templateIds.push(template.id);
          const variants: string[] = [];
          if ((step.variant_subject || "").trim() || (step.variant_body || "").trim()) {
            const variant = await apiPost<Template>("/workspace/templates", { name: `${step.template_name.trim()} · Variant B`, subject: (step.variant_subject || step.subject).trim(), body: step.variant_body || step.body });
            variants.push(variant.id);
          }
          variantTemplateIds.push(variants);
        } catch (error) {
          throw new Error(`Could not save sequence step ${index + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      let created: CreatedCampaign;
      try {
        created = await apiPost<CreatedCampaign>("/workspace/rohly-campaigns", {
          name,
          inbox_ids: selectedInboxes,
          recipient_ids: selectedRecipients,
          steps: steps.map((step, index) => ({
            template_id: templateIds[index],
            label: step.label,
            delay_days: step.delay_days,
            variant_template_ids: variantTemplateIds[index] || [],
            condition: step.condition || "always",
          })),
          timezone,
          min_gap_minutes: minGapMinutes,
          max_gap_minutes: maxGapMinutes,
          sending_window_start: sendingWindowStart,
          sending_window_end: sendingWindowEnd,
          sending_days: sendingDays,
          stop_on_reply: stopOnReply,
          follow_up_priority: followUpPriority,
          distribution_mode: distributionMode,
        });
      } catch (error) {
        throw new Error(`Could not create campaign: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      try {
        await apiPost(`/workspace/rohly-campaigns/${created.id}/launch`, {});
      } catch (error) {
        throw new Error(`Could not launch campaign: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
      return created;
    },
    onSuccess: async () => {
      if (draftId) await apiDelete(`/workspace/rohly-campaigns/drafts/${draftId}`).catch(() => undefined);
      toast.success("Rohly campaign launched");
      setTimeout(() => navigate("/campaigns"), 700);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not launch campaign"),
  });

  const toggle = (setter: Dispatch<SetStateAction<string[]>>, id: string) => {
    setTestPassed(false);
    setter((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const updateStep = (index: number, patch: Partial<Step>) => {
    setTestPassed(false);
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  };

  const addFollowUp = () => {
    setTestPassed(false);
    setSteps((current) => [...current, emptyStep(current.length)]);
  };

  const removeStep = (index: number) => {
    setTestPassed(false);
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  const insertVariable = (index: number, variable: string, field: "subject" | "body") => {
    const step = steps[index];
    updateStep(index, { [field]: step[field] + variable });
  };

  const removeRecipientList = (sourceId: string) => {
    const idsToRemove = new Set(listRecipientMap[sourceId] ?? []);
    setSelectedLists((current) => current.filter((id) => id !== sourceId));
    setListRecipientMap((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
    setSelectedRecipients((current) => current.filter((id) => !idsToRemove.has(id)));
    setTestPassed(false);
  };

  const validate = () => {
    if (!name.trim()) return "Enter a campaign name";
    if (!selectedRecipients.length) return "Select at least one lead or add a recipient list";
    if (!selectedInboxes.length) return "Select at least one sending inbox";
    if (!steps.length || steps.some((step) => !step.template_name.trim() || !step.subject.trim() || !step.body.trim())) {
      return "Complete the template name, subject, and body for every sequence step";
    }
    if (steps.slice(1).some((step) => step.delay_days < 1)) return "Follow-ups must be at least 1 day after the previous email";
    if (minGapMinutes < 1 || maxGapMinutes < minGapMinutes) return "Enter a valid minimum/maximum email gap";
    if (sendingWindowStart >= sendingWindowEnd) return "Working-hours start must be before the end time";
    if (!sendingDays.length) return "Select at least one working day";
    return null;
  };

  const reviewAndLaunch = () => {
    const error = validate();
    if (error) {
      toast.error(error);
      if (!selectedRecipients.length) setActiveStep(0);
      else if (!steps.length || steps.some((step) => !step.subject.trim() || !step.body.trim())) setActiveStep(1);
      else if (!selectedInboxes.length) setActiveStep(2);
      return;
    }
    createMutation.mutate();
  };

  const canNext = () => {
    if (activeStep === 0) return Boolean(selectedRecipients.length);
    if (activeStep === 1) return Boolean(steps.length && steps.every((step) => step.subject.trim() && step.body.trim()));
    if (activeStep === 2) return Boolean(selectedInboxes.length);
    return true;
  };

  return (
    <div data-testid="template-campaign-wizard-page" className="-mx-4 -mt-4 min-h-[calc(100vh-5rem)] bg-slate-50 sm:-mx-6 lg:-mx-7">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link to="/campaigns" className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-violet-600">
            <ArrowLeft size={14} /> Campaigns
          </Link>
          <Button
            onClick={reviewAndLaunch}
            disabled={createMutation.isPending}
            className="h-9 bg-violet-600 px-4 text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
          >
            <Rocket size={14} /> {createMutation.isPending ? "Launching…" : "Review and Launch"}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Input value={name} onChange={(event) => { setName(event.target.value); setTestPassed(false); }} className="h-8 w-72 border-0 bg-transparent px-0 text-[15px] font-bold shadow-none focus:ring-0" />
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">Draft{saveDraftMutation.isPending ? " • Saving…" : " • Auto-saved"}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Configure your email campaign</p>

        <div className="mt-4 flex items-center gap-1 overflow-x-auto">
          {stepLabels.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveStep(index)}
              className={`relative whitespace-nowrap px-4 py-2 text-xs font-semibold transition ${activeStep === index ? "text-violet-600" : "text-slate-500 hover:text-slate-800"}`}
            >
              {label}{label === "Sequence" && steps.length > 0 ? ` (${steps.length})` : ""}
              {activeStep === index && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-violet-600" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] p-5 lg:p-7">
        {activeStep === 0 && (
          <LeadListStep
            recipients={recipients}
            selectedRecipients={selectedRecipients}
            selectedLists={selectedLists}
            lists={lists}
            listPickerOpen={listPickerOpen}
            setListPickerOpen={setListPickerOpen}
            onToggle={(id) => toggle(setSelectedRecipients, id)}
            onRemoveList={removeRecipientList}
            onUploadFile={(file) => uploadMutation.mutate(file)}
            onUseList={(id) => useListMutation.mutate(id)}
            useListPending={useListMutation.isPending || uploadMutation.isPending}
          />
        )}

        {activeStep === 1 && (
          <SequenceStep
            steps={steps}
            recipients={recipients}
            previewRecipient={previewRecipient}
            setPreviewRecipient={setPreviewRecipient}
            selectedPreview={selectedPreview}
            onUpdate={updateStep}
            onAdd={addFollowUp}
            onRemove={removeStep}
            onVariable={insertVariable}
          />
        )}

        {activeStep === 2 && (
          <EmailAccountsStep
            inboxes={inboxes}
            selectedInboxes={selectedInboxes}
            onToggle={(id) => toggle(setSelectedInboxes, id)}
            onRefresh={() => inboxesQuery.refetch()}
          />
        )}

        {activeStep === 3 && (
          <SubSequencesStep />
        )}

        {activeStep === 4 && (
          <SettingsStep
            timezone={timezone}
            setTimezone={setTimezone}
            minGapMinutes={minGapMinutes}
            setMinGapMinutes={setMinGapMinutes}
            maxGapMinutes={maxGapMinutes}
            setMaxGapMinutes={setMaxGapMinutes}
            sendingWindowStart={sendingWindowStart}
            setSendingWindowStart={setSendingWindowStart}
            sendingWindowEnd={sendingWindowEnd}
            setSendingWindowEnd={setSendingWindowEnd}
            sendingDays={sendingDays}
            setSendingDays={setSendingDays}
            stopOnReply={stopOnReply}
            setStopOnReply={setStopOnReply}
            distributionMode={distributionMode}
            setDistributionMode={setDistributionMode}
            followUpPriority={followUpPriority}
            setFollowUpPriority={setFollowUpPriority}
            testEmail={testEmail}
            setTestEmail={(value) => { setTestEmail(value); setTestPassed(false); }}
            testPassed={testPassed}
            testPending={testMutation.isPending}
            onTest={() => testMutation.mutate()}
            selectedInboxes={selectedInboxes}
            selectedPreview={selectedPreview}
            firstStep={steps[0]}
          />
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={activeStep === 0}
            onClick={() => setActiveStep((value) => Math.max(0, value - 1))}
            className="gap-2"
          >
            <ArrowLeft size={14} /> Previous
          </Button>
          {activeStep < stepLabels.length - 1 ? (
            <Button
              type="button"
              disabled={!canNext()}
              onClick={() => setActiveStep((value) => Math.min(stepLabels.length - 1, value + 1))}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              Next: {stepLabels[activeStep + 1]} <ArrowRight size={14} />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={reviewAndLaunch}
              disabled={createMutation.isPending}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              <Rocket size={14} /> {createMutation.isPending ? "Launching…" : "Review and Launch"}
            </Button>
          )}
        </div>
      </div>

      {listPickerOpen && (
        <ListPicker
          lists={lists}
          selectedLists={selectedLists}
          pending={useListMutation.isPending}
          onRefresh={() => listsQuery.refetch()}
          onUploadFile={(file) => { setListPickerOpen(false); uploadMutation.mutate(file); }}
          onClose={() => setListPickerOpen(false)}
          onUse={(id) => useListMutation.mutate(id)}
        />
      )}
    </div>
  );
}

function LeadListStep(props: {
  recipients: Recipient[];
  selectedRecipients: string[];
  selectedLists: string[];
  lists: RecipientList[];
  listPickerOpen: boolean;
  setListPickerOpen: (value: boolean) => void;
  onToggle: (id: string) => void;
  onRemoveList: (id: string) => void;
  onUploadFile: (file: File) => void;
  onUseList: (id: string) => void;
  useListPending: boolean;
}) {
  const [tab, setTab] = useState<"all" | "active" | "replied" | "failed" | "scheduled" | "manual">("all");
  const [query, setQuery] = useState("");

  const leads = useMemo(() => {
    const selected = props.recipients.filter((r) => props.selectedRecipients.includes(r.id));
    const q = query.trim().toLowerCase();
    return selected.filter((r) => {
      const matchesQuery = !q || [r.name, r.email, r.company].some((v) => (v || "").toLowerCase().includes(q));
      if (!matchesQuery) return false;
      if (tab === "manual") return !props.selectedLists.length;
      // Pre-launch leads are new/active. Runtime status is displayed once campaign activity exists.
      if (tab === "all" || tab === "active") return true;
      return false;
    });
  }, [props.recipients, props.selectedRecipients, props.selectedLists, query, tab]);

  const counts = {
    all: props.selectedRecipients.length,
    active: props.selectedRecipients.length,
    replied: 0,
    failed: 0,
    scheduled: 0,
    manual: props.selectedLists.length ? 0 : props.selectedRecipients.length,
  };

  const tabItems = [
    ["all", "All Leads", counts.all],
    ["active", "Active", counts.active],
    ["replied", "Replied", counts.replied],
    ["failed", "Failed", counts.failed],
    ["scheduled", "Scheduled", counts.scheduled],
    ["manual", "Manual Followups", counts.manual],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Lead List</h1>
          <p className="mt-1 text-xs text-slate-500">Manage campaign leads, status, activity and sequence progress.</p>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700">
            <Upload size={14} /> Upload New CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onUploadFile(file); event.currentTarget.value = ""; }} />
          </label>
          <Button variant="outline" size="sm" onClick={() => props.setListPickerOpen(true)} className="gap-1"><Plus size={13} /> Saved List</Button>
        </div>
      </div>

      {props.selectedRecipients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-16 text-center">
          <Users className="mx-auto size-12 rounded-xl bg-violet-50 p-3 text-violet-600" />
          <h2 className="mt-5 text-sm font-semibold text-slate-800">No leads added yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">Add leads to your campaign to start sending emails. You can upload a CSV or select from your existing saved lists.</p>
          <div className="mt-5 flex justify-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm">
              <Upload size={14} /> Upload CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onUploadFile(file); event.currentTarget.value = ""; }} />
            </label>
            <Button variant="outline" onClick={() => props.setListPickerOpen(true)} className="gap-2"><FileSpreadsheet size={14} /> Import from Saved Lists</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-red-100 text-red-600"><Users size={15} /></div>
                <div>
                  <p className="text-xs font-bold text-red-700">Delivery issues</p>
                  <p className="text-[11px] text-red-600">Failed and paused leads will appear here after the campaign starts.</p>
                </div>
              </div>
              <span className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-red-600">0 failed</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 pt-3">
              {tabItems.map(([key, label, count]) => (
                <button key={key} type="button" onClick={() => setTab(key)}
                  className={`rounded-t-md border-b-2 px-3 py-2 text-[11px] font-semibold ${tab === key ? "border-violet-600 text-violet-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                  {label} ({count})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div className="relative w-full max-w-md">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads by name, email, or company..." className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-3 pr-3 text-xs outline-none focus:border-violet-400 focus:bg-white" />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span>{leads.length} shown</span>
                {props.selectedLists.length > 0 && <span className="rounded-full bg-violet-50 px-2 py-1 font-semibold text-violet-700">{props.selectedLists.length} list{props.selectedLists.length > 1 ? "s" : ""}</span>}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="bg-slate-50 text-[10px] font-semibold text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3"><input type="checkbox" checked={leads.length > 0 && leads.every((r) => props.selectedRecipients.includes(r.id))} readOnly className="size-3.5 accent-violet-600" /></th>
                    <th className="px-3 py-3">Lead Info</th>
                    <th className="px-3 py-3">Last Message</th>
                    <th className="px-3 py-3">Reply Details</th>
                    <th className="px-3 py-3">Activity</th>
                    <th className="px-3 py-3">Sequence Progress</th>
                    <th className="px-3 py-3">Next Step</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((recipient) => (
                    <tr key={recipient.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 align-top"><input type="checkbox" checked onChange={() => props.onToggle(recipient.id)} className="size-3.5 accent-violet-600" /></td>
                      <td className="px-3 py-4 align-top">
                        <div className="flex items-start gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{(recipient.name || recipient.email).slice(0, 2).toUpperCase()}</span>
                          <div className="min-w-0"><p className="max-w-[145px] truncate text-xs font-semibold text-slate-800">{recipient.name || "Unnamed lead"}</p><p className="max-w-[170px] truncate text-[10px] text-slate-500">{recipient.email}</p></div>
                        </div>
                      </td>
                      <td className="max-w-[170px] px-3 py-4 text-[10px] text-slate-500">No message yet</td>
                      <td className="px-3 py-4 text-[10px] text-slate-400">—</td>
                      <td className="px-3 py-4 text-[10px] text-slate-500">Not started</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-0 rounded-full bg-violet-600" /></div><span className="text-[10px] font-semibold text-slate-500">0%</span></div>
                      </td>
                      <td className="px-3 py-4"><p className="text-[10px] font-medium text-slate-700">Step 1</p><p className="text-[9px] text-slate-400">Waiting for launch</p></td>
                      <td className="px-3 py-4"><span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-700"><span className="size-1.5 rounded-full bg-blue-500" /> Active</span></td>
                      <td className="px-3 py-4 text-[10px] text-slate-500">{props.selectedLists.length ? "CSV" : "Manual"}</td>
                      <td className="px-4 py-4"><div className="flex items-center gap-2"><button type="button" title="Remove lead" onClick={() => props.onToggle(recipient.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button><button type="button" title="Lead details" className="text-slate-400 hover:text-violet-600"><ArrowRight size={14} /></button></div></td>
                    </tr>
                  ))}
                  {!leads.length && <tr><td colSpan={10} className="px-6 py-12 text-center text-xs text-slate-500">No leads match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function SequenceStep(props: {
  steps: Step[];
  recipients: Recipient[];
  previewRecipient: string;
  setPreviewRecipient: (value: string) => void;
  selectedPreview?: Recipient;
  onUpdate: (index: number, patch: Partial<Step>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onVariable: (index: number, variable: string, field: "subject" | "body") => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeIndex = Math.min(selectedIndex, Math.max(props.steps.length - 1, 0));
  const selectedStep = props.steps[safeIndex];

  useEffect(() => {
    if (selectedIndex >= props.steps.length) setSelectedIndex(Math.max(props.steps.length - 1, 0));
  }, [props.steps.length, selectedIndex]);

  if (!selectedStep) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div><h1 className="text-lg font-bold">Sequence</h1><p className="mt-1 text-xs text-slate-500">Create and manage email sequences for this campaign.</p></div>
          <Button onClick={props.onAdd} className="gap-2"><Plus size={14} /> Add Step</Button>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-16 text-center text-xs text-slate-500">No sequence steps yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold">Sequence</h1><p className="mt-1 text-xs text-slate-500">Click a step to edit that email separately.</p></div>
        <Button variant="outline" onClick={props.onAdd} className="gap-2"><Plus size={14} /> Add Step</Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[250px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Steps</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold">{props.steps.length} {props.steps.length === 1 ? "step" : "steps"}</span>
          </div>
          <div className="mt-2 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {props.steps.map((step, index) => (
              <div key={index}>
                <button
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full rounded-lg border p-3 text-left transition ${safeIndex === index ? "border-violet-400 bg-violet-50 shadow-sm" : "border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded bg-violet-100 text-[10px] font-bold text-violet-700`}>{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{step.label || `Email ${index + 1}`}</p>
                      <p className="truncate text-[10px] text-slate-500">{step.subject || "No subject yet"}</p>
                    </div>
                  </div>
                </button>
                {index < props.steps.length - 1 && (
                  <div className="flex items-center justify-center py-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium text-slate-500">
                      <Clock3 size={10} className="mr-1 inline" /> Wait {props.steps[index + 1].delay_days} days
                    </span>
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={props.onAdd} className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-xs font-semibold text-slate-500 hover:border-violet-300 hover:text-violet-600">
              + Add Step
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <span className="text-[10px] text-slate-400">Inbox Preview</span>
              <span className="mx-2 text-[10px] text-slate-300">|</span>
              <span className="text-[11px] font-semibold text-slate-700">Rohly</span>
              <span className="ml-2 text-[10px] text-slate-400">Editing {selectedStep.label || `Email ${safeIndex + 1}`}</span>
            </div>
            <select value={props.previewRecipient} onChange={(e) => props.setPreviewRecipient(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
              <option value="">Preview sample lead</option>
              {props.recipients.map((r) => <option key={r.id} value={r.id}>{r.name || r.email}</option>)}
            </select>
          </div>

          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{safeIndex + 1}</span>
                <div>
                  <p className="text-sm font-semibold">{safeIndex === 0 ? "Initial email" : `Follow-up ${safeIndex}`}</p>
                  <p className="text-[10px] text-slate-400">{safeIndex === 0 ? "First email in the sequence" : "Delay after previous email"}</p>
                </div>
              </div>
              {safeIndex > 0 && (
                <Button variant="ghost" size="icon" onClick={() => { props.onRemove(safeIndex); setSelectedIndex(Math.max(0, safeIndex - 1)); }} title="Delete step">
                  <Trash2 size={15} />
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <label className="text-xs font-semibold">Step name
                <Input value={selectedStep.template_name} onChange={(e) => props.onUpdate(safeIndex, { template_name: e.target.value, label: e.target.value })} placeholder="Email name" className="mt-1" />
              </label>
              {safeIndex > 0 && (
                <label className="text-xs font-semibold">Delay after previous email (days)
                  <Input type="number" min={1} value={selectedStep.delay_days} onChange={(e) => props.onUpdate(safeIndex, { delay_days: Number(e.target.value) })} className="mt-1" />
                </label>
              )}
              {safeIndex > 0 && (
                <label className="text-xs font-semibold">Send this follow-up when
                  <select value={selectedStep.condition || "always"} onChange={(e)=>props.onUpdate(safeIndex,{condition:e.target.value as Step["condition"]})} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs"><option value="always">Always</option><option value="opened">Previous email was opened</option><option value="clicked">Previous email was clicked</option><option value="not_opened">Previous email was not opened</option><option value="not_clicked">Previous email was not clicked</option></select>
                </label>
              )}
            </div>

            <label className="mt-4 block text-xs font-semibold">Subject
              <Input value={selectedStep.subject} onChange={(e) => props.onUpdate(safeIndex, { subject: e.target.value })} placeholder="Enter a subject..." className="mt-1" />
            </label>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES.map((variable) => (
                <button type="button" key={variable} onClick={() => props.onVariable(safeIndex, variable, "body")} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:border-violet-300 hover:text-violet-600">{variable}</button>
              ))}
            </div>

            <textarea
              value={selectedStep.body}
              onChange={(e) => props.onUpdate(safeIndex, { body: e.target.value })}
              placeholder="Start writing your email..."
              rows={18}
              className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><Braces size={12} /> Variables are replaced automatically before sending. Signature is added automatically.</p>
            <div className="mt-5 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-4">
              <div><p className="text-xs font-semibold text-slate-800">A/B variant B <span className="font-normal text-slate-400">(optional)</span></p><p className="mt-1 text-[10px] text-slate-500">When provided, leads are deterministically split between the original and variant for this step.</p></div>
              <label className="mt-3 block text-xs font-semibold">Variant subject<Input value={selectedStep.variant_subject || ""} onChange={(e)=>props.onUpdate(safeIndex,{variant_subject:e.target.value})} placeholder="Leave blank to use original subject" className="mt-1 bg-white"/></label>
              <label className="mt-3 block text-xs font-semibold">Variant body<textarea value={selectedStep.variant_body || ""} onChange={(e)=>props.onUpdate(safeIndex,{variant_body:e.target.value})} placeholder="Leave blank to use original body" rows={8} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-blue-400"/></label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailAccountsStep(props: {
  inboxes: Inbox[];
  selectedInboxes: string[];
  onToggle: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      <div><h1 className="text-lg font-bold">Email Accounts</h1><p className="mt-1 text-xs text-slate-500">Select the Gmail accounts that will send this campaign.</p></div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Mail className="mx-auto size-12 rounded-xl bg-violet-50 p-3 text-violet-600" />
        <h2 className="mt-4 text-base font-semibold">Select Email Accounts for Your Campaign</h2>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">Emails are distributed across your selected inboxes according to their available sending capacity.</p>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {[
            ["Smart Filtering", "Filter by connection and account status."],
            ["Real-time Capacity", "See each account's daily sending limit."],
            ["Health Insights", "Review account status before launch."],
          ].map(([title, text]) => <div key={title} className="rounded-lg border border-slate-200 p-4 text-left"><Check size={16} className="text-emerald-600" /><p className="mt-3 text-xs font-semibold">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{text}</p></div>)}
        </div>
        <Button variant="outline" onClick={props.onRefresh} className="mt-6 gap-2"><RefreshCw size={13} /> Refresh accounts</Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold">{props.selectedInboxes.length} accounts selected</h2></div>
        {props.inboxes.map((inbox) => (
          <label key={inbox.id} className="flex cursor-pointer items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50">
            <input type="checkbox" checked={props.selectedInboxes.includes(inbox.id)} onChange={() => props.onToggle(inbox.id)} className="size-4 accent-violet-600" />
            <div className="flex-1"><p className="text-xs font-semibold">{inbox.display_name}</p><p className="mt-0.5 text-[11px] text-slate-500">{inbox.email}</p></div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{inbox.daily_sending_limit}/day</span>
          </label>
        ))}
        {!props.inboxes.length && <div className="p-8 text-center text-xs text-slate-500">No connected Gmail accounts. Connect an inbox first.</div>}
      </div>
    </div>
  );
}

function SubSequencesStep() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-lg font-bold">SubSequences</h1><p className="mt-1 text-xs text-slate-500">Create optional reply-based branches for contacts who respond to your campaign.</p></div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-16 text-center">
        <Braces className="mx-auto size-12 rounded-xl bg-violet-50 p-3 text-violet-600" />
        <h2 className="mt-5 text-sm font-semibold">No subsequences configured</h2>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">This section is optional. You can add reply-based paths such as Interested, Busy / Reach out later, Pricing, Not interested, or Wrong contact in a later campaign update.</p>
        <Button variant="outline" className="mt-5 gap-2" disabled><Plus size={14} /> Add SubSequence</Button>
      </div>
    </div>
  );
}

function SettingsStep(props: {
  timezone: string;
  setTimezone: (v: string) => void;
  minGapMinutes: number;
  setMinGapMinutes: (v: number) => void;
  maxGapMinutes: number;
  setMaxGapMinutes: (v: number) => void;
  sendingWindowStart: string;
  setSendingWindowStart: (v: string) => void;
  sendingWindowEnd: string;
  setSendingWindowEnd: (v: string) => void;
  sendingDays: number[];
  setSendingDays: Dispatch<SetStateAction<number[]>>;
  stopOnReply: boolean;
  setStopOnReply: (v: boolean) => void;
  distributionMode: "pattern" | "random";
  setDistributionMode: (v: "pattern" | "random") => void;
  followUpPriority: number;
  setFollowUpPriority: (v: number) => void;
  testEmail: string;
  setTestEmail: (v: string) => void;
  testPassed: boolean;
  testPending: boolean;
  onTest: () => void;
  selectedInboxes: string[];
  selectedPreview?: Recipient;
  firstStep?: Step;
}) {
  return (
    <div className="space-y-5">
      <div><h1 className="text-lg font-bold">Settings</h1><p className="mt-1 text-xs text-slate-500">Configure schedule, campaign behavior, and the required test run.</p></div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {([
            [Settings2, "Schedule Configuration"],
            [Mail, "Campaign Behavior"],
            [Braces, "Delivery Optimization"],
            [Rocket, "AI & Automation"],
            [Check, "Protection & Limits"],
          ] as const).map(([Icon, label], index) => (
            <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-3 text-xs font-semibold ${index === 0 ? "bg-violet-50 text-violet-600" : "text-slate-500"}`}>
              <Icon size={14} />{label}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2"><CalendarClock size={16} className="text-violet-600" /><h2 className="text-sm font-semibold">Send Schedule</h2></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold">Timezone<select value={props.timezone} onChange={(e) => props.setTimezone(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs"><option>Asia/Kolkata</option><option>America/Toronto</option><option>America/New_York</option><option>Europe/London</option><option>UTC</option></select></label>
              <div><p className="text-xs font-semibold">Active Days</p><div className="mt-2 flex flex-wrap gap-1.5">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, index) => <button type="button" key={day} onClick={() => props.setSendingDays((current) => current.includes(index) ? current.filter((v) => v !== index) : [...current, index])} className={`rounded-md border px-2.5 py-2 text-[10px] font-semibold ${props.sendingDays.includes(index) ? "border-violet-500 bg-violet-50 text-violet-600" : "border-slate-200 text-slate-500"}`}>{day}</button>)}</div></div>
            </div>
            <div className="mt-5 rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-semibold">Sending Window</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-[11px] font-semibold">From<Input type="time" value={props.sendingWindowStart} onChange={(e) => props.setSendingWindowStart(e.target.value)} className="mt-1" /></label>
                <label className="text-[11px] font-semibold">To<Input type="time" value={props.sendingWindowEnd} onChange={(e) => props.setSendingWindowEnd(e.target.value)} className="mt-1" /></label>
                <label className="text-[11px] font-semibold">Random gap (minutes)<div className="mt-1 grid grid-cols-2 gap-2"><Input type="number" min={1} value={props.minGapMinutes} onChange={(e) => props.setMinGapMinutes(Number(e.target.value))} /><Input type="number" min={1} value={props.maxGapMinutes} onChange={(e) => props.setMaxGapMinutes(Number(e.target.value))} /></div></label>
              </div>
              <p className="mt-3 text-[10px] italic text-slate-400">Rohly applies a random delay between the minimum and maximum gap.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Campaign Behavior</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <button type="button" onClick={() => props.setStopOnReply(true)} className={`rounded-lg border p-4 text-left ${props.stopOnReply ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}><p className="text-xs font-semibold">Stop on replies</p><p className="mt-1 text-[10px] text-slate-500">Recommended for engagement.</p></button>
              <button type="button" onClick={() => props.setStopOnReply(false)} className={`rounded-lg border p-4 text-left ${!props.stopOnReply ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}><p className="text-xs font-semibold">Continue follow-ups</p><p className="mt-1 text-[10px] text-slate-500">Keep the sequence running.</p></button>
              <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs font-semibold">Follow-up Priority</p><input type="range" min={0} max={100} value={props.followUpPriority} onChange={(e) => props.setFollowUpPriority(Number(e.target.value))} className="mt-4 w-full accent-violet-600" /><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>New Leads</span><span>{props.followUpPriority}% Follow-ups</span></div></div>
            </div>
            <div className="mt-4"><p className="text-xs font-semibold">Email Distribution</p><div className="mt-2 grid gap-3 md:grid-cols-2"><button type="button" onClick={() => props.setDistributionMode("pattern")} className={`rounded-lg border p-4 text-left ${props.distributionMode === "pattern" ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}><p className="text-xs font-semibold">Pattern-based</p><p className="mt-1 text-[10px] text-slate-500">Even distribution across selected inboxes.</p></button><button type="button" onClick={() => props.setDistributionMode("random")} className={`rounded-lg border p-4 text-left ${props.distributionMode === "random" ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}><p className="text-xs font-semibold">Randomized</p><p className="mt-1 text-[10px] text-slate-500">Random inbox selection for each send.</p></button></div></div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2"><FlaskConical size={16} className="text-violet-600" /><h2 className="text-sm font-semibold">Test email (optional)</h2>{props.testPassed && <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><Check size={11} className="mr-1 inline" /> Test passed</span>}</div>
            <p className="mt-1 text-[11px] text-slate-500">Send a test email to yourself if you want to verify the message before launching. This is optional.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input value={props.testEmail} onChange={(e) => props.setTestEmail(e.target.value)} placeholder="your@email.com" type="email" /><Button onClick={props.onTest} disabled={props.testPending || !props.selectedInboxes.length} className="gap-2 bg-violet-600 hover:bg-violet-700"><Mail size={14} />{props.testPending ? "Sending…" : "Send test email"}</Button></div>
            {!props.selectedInboxes.length && <p className="mt-2 text-[10px] text-amber-600">Select an email account before running the test.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListPicker(props: {
  lists: RecipientList[];
  selectedLists: string[];
  pending: boolean;
  onRefresh: () => void;
  onUploadFile: (file: File) => void;
  onClose: () => void;
  onUse: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-semibold">Import from Saved Lists</h2><p className="mt-1 text-xs text-slate-500">Only new contacts are added; duplicates are skipped automatically.</p></div><Button variant="ghost" size="icon" onClick={props.onClose}><X size={17} /></Button></div>
        <div className="flex gap-2 border-b border-slate-100 px-5 py-3"><Button variant="outline" size="sm" onClick={props.onRefresh} className="gap-1"><RefreshCw size={13} /> Refresh</Button><label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white">
            <Upload size={13} /> Upload CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onUploadFile(file); event.currentTarget.value = ""; }} />
          </label></div>
        <div className="max-h-[60vh] overflow-auto p-5">{props.lists.length ? props.lists.map((list) => { const active = props.selectedLists.includes(list.id); return <div key={list.id} className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 p-4"><FileSpreadsheet size={17} className="text-violet-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{list.filename}</p><p className="mt-1 text-[10px] text-slate-500">{list.row_count} contacts</p></div><Button size="sm" variant={active ? "outline" : "default"} disabled={active || props.pending} onClick={() => props.onUse(list.id)}>{active ? "Added" : props.pending ? "Adding…" : "Add list"}</Button></div>; }) : <div className="py-10 text-center text-xs text-slate-500">No saved lists found. Upload a CSV first.</div>}</div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-3"><Button variant="outline" onClick={props.onClose}>Done</Button></div>
      </div>
    </div>
  );
}
