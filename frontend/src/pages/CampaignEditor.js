import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Play, Sparkles, Loader2, Upload, CheckCircle2, X, CalendarClock, ShieldCheck, Users, Workflow, Inbox as InboxIcon, SlidersHorizontal, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import StatusPill from '../components/StatusPill';

const TABS = [
  { id: 'leads', label: 'Lead List', icon: Users },
  { id: 'sequence', label: 'Sequence', icon: Workflow },
  { id: 'accounts', label: 'Email Accounts', icon: InboxIcon },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MERGE_TAGS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{title}}'];

const blank = () => ({
  name: '',
  steps: [{ subject: '', body: 'Hi {{first_name}},\n\n', wait_days: 0 }],
  settings: {
    timezone: 'Asia/Kolkata',
    active_days: [1, 2, 3, 4, 5],
    window_start: '09:00',
    window_end: '18:00',
    gap_min: 10,
    gap_max: 20,
    stop_on_reply: true,
    distribution: 'pattern',
    followup_priority: 60,
  },
  inbox_ids: [],
  daily_limit: 40,
});

export default function CampaignEditor() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(blank());
  const [savedId, setSavedId] = useState(campaignId || '');
  const [status, setStatus] = useState('draft');
  const [saveState, setSaveState] = useState('saved');
  const [tab, setTab] = useState('leads');
  const [inboxes, setInboxes] = useState([]);
  const [campaignLeads, setCampaignLeads] = useState([]);
  const [poolQuery, setPoolQuery] = useState('');
  const [poolLeads, setPoolLeads] = useState([]);
  const [aiForm, setAiForm] = useState({ product: '', audience: '', tone: 'friendly', steps: 3 });
  const [aiBusy, setAiBusy] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [importRef, setImportRef] = useState(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    api.get('/inboxes').then((r) => setInboxes(r.data)).catch(() => {});
    if (campaignId) {
      api.get(`/campaigns/${campaignId}`).then((r) => {
        const c = r.data.campaign;
        setDraft({ name: c.name, steps: c.steps, settings: c.settings, inbox_ids: c.inbox_ids, daily_limit: c.daily_limit, subject: c.subject, body: c.body });
        setStatus(c.status);
        setCampaignLeads(r.data.leads);
      }).catch((e) => toast.error(apiError(e)));
    }
  }, [campaignId]);

  // auto-save (debounced)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return undefined;
    }
    if (!draft.name.trim()) return undefined;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        if (savedId) {
          await api.patch(`/campaigns/${savedId}`, draft);
        } else {
          const r = await api.post('/campaigns', draft);
          setSavedId(r.data.id);
          window.history.replaceState(null, '', `/app/campaigns/${r.data.id}/edit`);
        }
        setSaveState('saved');
      } catch (e) {
        setSaveState('dirty');
        toast.error(apiError(e));
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, savedId]);

  const loadPool = () => {
    api.get(`/leads?page=1&page_size=50&q=${encodeURIComponent(poolQuery)}`).then((r) => setPoolLeads(r.data.items)).catch(() => {});
  };
  useEffect(() => {
    const t = setTimeout(loadPool, poolQuery ? 300 : 0);
    return () => clearTimeout(t);
  }, [poolQuery]);

  const assignedIds = new Set(campaignLeads.map((l) => l.id));
  const pool = poolLeads.filter((l) => !assignedIds.has(l.id) && l.campaign_id !== savedId);

  const assign = async (lead) => {
    if (!savedId) {
      toast.error('Save the campaign first — give it a name');
      return;
    }
    try {
      await api.post('/leads/bulk', { ids: [lead.id], action: 'assign_campaign', campaign_id: savedId });
      setCampaignLeads([...campaignLeads, { ...lead, status: 'new' }]);
      setPoolLeads(poolLeads.filter((p) => p.id !== lead.id));
      toast.success(`${lead.email} added`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const importCsv = async (file) => {
    if (!savedId) {
      toast.error('Name and save the campaign first, then import');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('campaign_id', savedId);
      const r = await api.post('/imports', fd);
      toast.success(`${r.data.imported} leads imported`);
      const res = await api.get(`/campaigns/${savedId}`);
      setCampaignLeads(res.data.leads);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const aiWrite = async () => {
    setAiBusy(true);
    try {
      const r = await api.post('/ai/sequence', aiForm);
      setDraft({ ...draft, steps: r.data.steps });
      toast.success('AI wrote your sequence — tweak anything you like');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setAiBusy(false);
    }
  };

  const setStep = (i, k, v) => {
    const steps = draft.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s));
    setDraft({ ...draft, steps });
  };

  const launch = async () => {
    try {
      if (!savedId) {
        toast.error('Give the campaign a name first');
        return;
      }
      await api.patch(`/campaigns/${savedId}`, draft);
      await api.post(`/campaigns/${savedId}/launch`);
      toast.success('Campaign live — the sequence engine is running');
      navigate(`/app/campaigns/${savedId}`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const inputCls = 'w-full rounded-lg bg-panel border border-line px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal';
  const chip = (on) => `rounded-lg px-3 py-1.5 text-xs font-semibold border transition-signal ${on ? 'border-signal/60 bg-signal/15 text-signal' : 'border-line text-slate-400 hover:border-slate-600'}`;
  const saveChip = saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : 'Draft · Auto-saved';

  const draftLeads = campaignLeads;

  return (
    <div className="max-w-5xl mx-auto" data-testid="campaign-editor-page">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <Link to="/app/campaigns" data-testid="editor-back-link" className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500 hover:text-signal transition-signal mb-2">
            <ArrowLeft size={14} /> Campaigns
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <input
              data-testid="editor-name-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Rohly outreach campaign"
              className="font-display text-2xl font-bold tracking-tight bg-transparent border-b border-transparent hover:border-line focus:border-signal outline-none transition-signal w-[420px] max-w-full"
            />
            <span data-testid="editor-save-chip" className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ${saveState === 'saved' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-line text-slate-400'}`}>{saveChip}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1.5">Configure your email campaign</p>
        </div>
        <button data-testid="editor-review-launch-btn" onClick={() => setLaunchOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">
          <Play size={15} /> Review and Launch
        </button>
      </div>

      <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} data-testid={`editor-tab-${t.id}`} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-signal whitespace-nowrap ${tab === t.id ? 'border-signal text-signal' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <t.icon size={14} /> {t.label}
            {t.id === 'sequence' && <span className="font-mono text-[10px] text-slate-500">({draft.steps.length})</span>}
          </button>
        ))}
      </div>

      {tab === 'leads' && (
        <div className="space-y-4" data-testid="editor-tab-leads">
          <div className="rounded-xl border border-line bg-obsidian p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-display text-base font-semibold">Leads in this campaign <span className="font-mono text-xs text-slate-500">({draftLeads.length})</span></h2>
              <button data-testid="editor-import-csv-btn" onClick={() => importRef?.click()} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-semibold text-slate-300 hover:border-signal/50 hover:text-signal transition-signal">
                <Upload size={13} /> Import CSV to campaign
              </button>
              <input ref={(el) => setImportRef(el)} type="file" accept=".csv" className="hidden" data-testid="editor-csv-input" onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
            </div>
            {draftLeads.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">No leads yet — import a CSV or add from the pool below.</p>}
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {draftLeads.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-line/40 last:border-0" data-testid={`editor-lead-row-${l.id}`}>
                  <div className="min-w-0">
                    <span className="text-[13px] text-slate-200">{l.first_name} {l.last_name}</span>
                    <span className="font-mono text-[11px] text-slate-500 ml-2">{l.email}</span>
                  </div>
                  <StatusPill status={l.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-obsidian p-6">
            <h2 className="font-display text-base font-semibold mb-4">Add from your lead pool</h2>
            <input data-testid="editor-pool-search" value={poolQuery} onChange={(e) => setPoolQuery(e.target.value)} placeholder="Search leads…" className={`${inputCls} mb-3`} />
            <div className="space-y-1 max-h-64 overflow-y-auto" data-testid="editor-pool-list">
              {pool.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-line/40 last:border-0">
                  <div className="min-w-0">
                    <span className="text-[13px] text-slate-200">{l.first_name} {l.last_name}</span>
                    <span className="font-mono text-[11px] text-slate-500 ml-2">{l.email}</span>
                  </div>
                  <button data-testid={`editor-lead-add-${l.id}`} onClick={() => assign(l)} className="rounded-full border border-signal/40 text-signal px-3 py-1 text-xs font-semibold hover:bg-signal/10 transition-signal">Add</button>
                </div>
              ))}
              {pool.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">Nothing more in the pool — import a CSV.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'sequence' && (
        <div className="space-y-4" data-testid="editor-tab-sequence">
          <div className="rounded-xl border border-telemetry/30 bg-telemetry/5 p-5" data-testid="ai-panel">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-telemetry" />
              <span className="text-sm font-semibold text-slate-100">Write the sequence with AI</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input data-testid="ai-product-input" value={aiForm.product} onChange={(e) => setAiForm({ ...aiForm, product: e.target.value })} placeholder="What you sell — e.g. Rohly, an outbound command center" className={inputCls} />
              <input data-testid="ai-audience-input" value={aiForm.audience} onChange={(e) => setAiForm({ ...aiForm, audience: e.target.value })} placeholder="Audience — e.g. B2B founders doing outbound" className={inputCls} />
              <select data-testid="ai-tone-select" value={aiForm.tone} onChange={(e) => setAiForm({ ...aiForm, tone: e.target.value })} className={inputCls}>
                {['friendly', 'direct', 'consultative', 'playful'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button data-testid="ai-generate-btn" onClick={aiWrite} disabled={aiBusy || aiForm.product.length < 3 || aiForm.audience.length < 3} className="inline-flex items-center justify-center gap-2 rounded-lg bg-telemetry px-4 py-2.5 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-40 transition-signal">
                {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {aiBusy ? 'Writing…' : 'Generate sequence'}
              </button>
            </div>
          </div>

          {draft.steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-line bg-obsidian p-6" data-testid={`editor-step-${i}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="size-7 rounded-full bg-signal/15 border border-signal/40 flex items-center justify-center font-mono text-[11px] text-signal font-bold">{i + 1}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Email {i + 1}</div>
                    <div className="font-mono text-[10px] text-slate-500">{i === 0 ? 'sent immediately' : `wait ${s.wait_days} day${s.wait_days === 1 ? '' : 's'} after previous`}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {i > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Wait days</label>
                      <input data-testid={`editor-step-wait-${i}`} type="number" min={0} max={30} value={s.wait_days} onChange={(e) => setStep(i, 'wait_days', Number(e.target.value))} className="w-20 rounded-lg bg-panel border border-line px-3 py-1.5 text-sm text-slate-100 focus:border-signal transition-signal" />
                    </div>
                  )}
                  {draft.steps.length > 1 && (
                    <button data-testid={`editor-step-delete-${i}`} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} className="p-1.5 text-slate-600 hover:text-red-400 transition-signal"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
              <input data-testid={`editor-step-subject-${i}`} value={s.subject} onChange={(e) => setStep(i, 'subject', e.target.value)} placeholder="Subject line — {{first_name}}, quick idea for {{company}}" className={`${inputCls} mb-3`} />
              <textarea data-testid={`editor-step-body-${i}`} value={s.body} onChange={(e) => setStep(i, 'body', e.target.value)} rows={7} className={`${inputCls} leading-relaxed`} />
              <div className="flex flex-wrap gap-2 mt-3">
                {MERGE_TAGS.map((t) => (
                  <button key={t} onClick={() => setStep(i, 'body', s.body + ' ' + t)} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-slate-400 hover:border-signal/50 hover:text-signal transition-signal">{t}</button>
                ))}
              </div>
            </div>
          ))}

          {draft.steps.length < 5 && (
            <button data-testid="editor-add-step-btn" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { subject: '', body: `Hi {{{{first_name}}}},\n\nJust floating this back up your inbox.\n\n`, wait_days: 3 }] })} className="w-full rounded-xl border border-dashed border-line py-4 text-sm font-semibold text-slate-400 hover:border-signal/50 hover:text-signal transition-signal">
              + Add follow-up step
            </button>
          )}
        </div>
      )}

      {tab === 'accounts' && (
        <div className="rounded-xl border border-line bg-obsidian p-6" data-testid="editor-tab-accounts">
          <h2 className="font-display text-base font-semibold mb-4">Sending accounts</h2>
          {inboxes.length === 0 && <p className="text-sm text-slate-500">No mailboxes — <Link to="/app/inboxes" className="text-signal hover:underline">connect one first</Link>.</p>}
          <div className="grid sm:grid-cols-2 gap-2">
            {inboxes.map((ib) => {
              const on = draft.inbox_ids.includes(ib.id);
              const live = ib.smtp_host && ib.has_password;
              return (
                <button
                  key={ib.id}
                  data-testid={`editor-account-${ib.id}`}
                  onClick={() => setDraft({ ...draft, inbox_ids: on ? draft.inbox_ids.filter((i) => i !== ib.id) : [...draft.inbox_ids, ib.id] })}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-signal ${on ? 'border-signal/60 bg-signal/10' : 'border-line hover:border-slate-600'}`}
                >
                  <div className="text-left min-w-0">
                    <div className="text-[13px] text-slate-100 truncate">{ib.email}</div>
                    <div className={`font-mono text-[10px] ${live ? 'text-health' : 'text-amber-400'}`}>{live ? `live · ${ib.smtp_host}` : 'SMTP setup needed'}</div>
                  </div>
                  <span className={`size-2 rounded-full shrink-0 ml-3 ${on ? 'bg-signal' : 'bg-slate-700'}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4" data-testid="editor-tab-settings">
          <div className="rounded-xl border border-line bg-obsidian p-6" data-testid="settings-schedule">
            <div className="flex items-center gap-2 mb-5"><CalendarClock size={15} className="text-signal" /><h2 className="font-display text-base font-semibold">Send schedule</h2></div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Timezone</label>
                <select data-testid="settings-timezone" value={draft.settings.timezone} onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, timezone: e.target.value } })} className={inputCls}>
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Active days</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((d, i) => {
                    const day = i + 1;
                    const on = draft.settings.active_days.includes(day);
                    return (
                      <button key={d} data-testid={`settings-day-${d.toLowerCase()}`} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, active_days: on ? draft.settings.active_days.filter((x) => x !== day) : [...draft.settings.active_days, day] } })} className={chip(on)}>{d}</button>
                    );
                  })}
                </div>
              </div>
              <div className="sm:col-span-2 rounded-lg border border-line bg-panel/30 p-4">
                <div className="text-sm font-semibold text-slate-200 mb-3">Sending window</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-1.5">From</label>
                    <input data-testid="settings-window-start" type="time" value={draft.settings.window_start} onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, window_start: e.target.value } })} className={inputCls} />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-1.5">To</label>
                    <input data-testid="settings-window-end" type="time" value={draft.settings.window_end} onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, window_end: e.target.value } })} className={inputCls} />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-1.5">Gap min (min)</label>
                    <input data-testid="settings-gap-min" type="number" min={0} max={120} value={draft.settings.gap_min} onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, gap_min: Number(e.target.value) } })} className={inputCls} />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-1.5">Gap max (min)</label>
                    <input data-testid="settings-gap-max" type="number" min={0} max={120} value={draft.settings.gap_max} onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, gap_max: Number(e.target.value) } })} className={inputCls} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">Rohly applies a random delay between the minimum and maximum gap.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-obsidian p-6" data-testid="settings-behavior">
            <h2 className="font-display text-base font-semibold mb-5">Campaign behavior</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { v: true, t: 'Stop on replies', d: 'Recommended — follow-ups pause the moment a lead replies.' },
                { v: false, t: 'Continue follow-ups', d: 'Keep the sequence running regardless of replies.' },
              ].map((o) => (
                <button key={o.t} data-testid={`settings-behavior-${o.v}`} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, stop_on_reply: o.v } })} className={`rounded-xl border p-4 text-left transition-signal ${draft.settings.stop_on_reply === o.v ? 'border-signal/60 bg-signal/10' : 'border-line hover:border-slate-600'}`}>
                  <div className="text-sm font-semibold text-slate-100">{o.t}</div>
                  <div className="text-xs text-slate-500 mt-1">{o.d}</div>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Follow-up priority — new leads vs follow-ups: {draft.settings.followup_priority}% follow-ups</label>
              <input data-testid="settings-priority-slider" type="range" min={0} max={100} step={10} value={draft.settings.followup_priority} onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, followup_priority: Number(e.target.value) } })} className="w-full accent-[#FF5A1F]" />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-obsidian p-6" data-testid="settings-distribution">
            <h2 className="font-display text-base font-semibold mb-5">Email distribution</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { v: 'pattern', t: 'Pattern-based', d: 'Even distribution across selected inboxes.' },
                { v: 'random', t: 'Randomized', d: 'Random inbox selection for each send.' },
              ].map((o) => (
                <button key={o.v} data-testid={`settings-distribution-${o.v}`} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, distribution: o.v } })} className={`rounded-xl border p-4 text-left transition-signal ${draft.settings.distribution === o.v ? 'border-signal/60 bg-signal/10' : 'border-line hover:border-slate-600'}`}>
                  <div className="text-sm font-semibold text-slate-100">{o.t}</div>
                  <div className="text-xs text-slate-500 mt-1">{o.d}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-obsidian p-6" data-testid="settings-protection">
            <div className="flex items-center gap-2 mb-5"><ShieldCheck size={15} className="text-health" /><h2 className="font-display text-base font-semibold">Protection & limits</h2></div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Campaign daily cap</label>
                <input data-testid="settings-daily-cap" type="number" min={1} max={500} value={draft.daily_limit} onChange={(e) => setDraft({ ...draft, daily_limit: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Effective per-inbox cap</label>
                <p className="text-sm text-slate-300 pt-2.5" data-testid="settings-effective-cap">{inboxes.filter((i) => draft.inbox_ids.includes(i.id) && i.smtp_host).length} live account(s) · cap applies per inbox</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {launchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" data-testid="launch-modal">
          <div className="w-full max-w-md rounded-2xl border border-line bg-obsidian p-7">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-semibold">Review & launch</h2>
              <button data-testid="launch-modal-close" onClick={() => setLaunchOpen(false)} className="text-slate-500 hover:text-slate-200 transition-signal"><X size={18} /></button>
            </div>
            <div className="space-y-2.5 mb-6 text-sm" data-testid="launch-summary">
              {[
                ['Sequence', `${draft.steps.length} email${draft.steps.length > 1 ? 's' : ''}`],
                ['Leads', `${draftLeads.length} assigned`],
                ['Accounts', `${draft.inbox_ids.length} selected`],
                ['Schedule', `${draft.settings.window_start}–${draft.settings.window_end} · ${draft.settings.timezone}`],
                ['Gap', `${draft.settings.gap_min}–${draft.settings.gap_max} min between sends`],
                ['Behavior', draft.settings.stop_on_reply ? 'Stop on replies' : 'Continue follow-ups'],
              ].map(([k2, v]) => (
                <div key={k2} className="flex justify-between border-b border-line/40 pb-2 last:border-0">
                  <span className="text-slate-400">{k2}</span>
                  <span className="font-mono text-xs text-slate-200 text-right">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button data-testid="launch-confirm-btn" onClick={launch} className="flex-1 rounded-full bg-signal py-3 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">Launch now</button>
              <button data-testid="launch-cancel-btn" onClick={() => setLaunchOpen(false)} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-slate-300 hover:border-slate-500 transition-signal">Keep as draft</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
