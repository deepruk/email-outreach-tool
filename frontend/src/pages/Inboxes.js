import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, CheckCircle2, RefreshCw, XCircle, Loader2, Mail } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { Reveal } from '../components/motion';
import StatusPill from '../components/StatusPill';

const PRESETS = {
  Gmail: { smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_security: 'starttls', imap_host: 'imap.gmail.com', imap_port: 993, imap_security: 'ssl' },
  'Outlook / M365': { smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_security: 'starttls', imap_host: 'outlook.office365.com', imap_port: 993, imap_security: 'ssl' },
  Zoho: { smtp_host: 'smtp.zoho.com', smtp_port: 587, smtp_security: 'starttls', imap_host: 'imap.zoho.com', imap_port: 993, imap_security: 'ssl' },
  Yahoo: { smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465, smtp_security: 'ssl', imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_security: 'ssl' },
  Custom: { smtp_host: '', smtp_port: 587, smtp_security: 'starttls', imap_host: '', imap_port: 993, imap_security: 'ssl' },
};

const EMPTY_FORM = {
  email: '', display_name: '', from_name: '', signature: '', daily_sending_limit: 50,
  smtp_host: '', smtp_port: 587, smtp_security: 'starttls', smtp_username: '', smtp_password: '',
  imap_host: '', imap_port: 993, imap_security: 'ssl',
};

function HealthRing({ used, limit }) {
  const pct = Math.min(1, used / Math.max(1, limit));
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0" data-testid="inbox-health-ring">
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1E293B" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={pct > 0.8 ? '#F59E0B' : '#10B981'} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-slate-300">{Math.round(pct * 100)}%</div>
    </div>
  );
}

function ConnBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ${ok ? 'border-health/40 text-health' : 'border-red-500/40 text-red-400'}`}>
      {ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {label}
    </span>
  );
}

function InboxCard({ inbox, onEdit, onDelete }) {
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post(`/inboxes/${inbox.id}/sync-replies`);
      toast.success(`${inbox.email}: ${r.data.new_replies} new replies, ${r.data.bounces} bounces`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Reveal y={12}>
      <div className="rounded-2xl border border-line bg-obsidian p-6 hover:border-signal/40 transition-signal" data-testid={`inbox-card-${inbox.id}`}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <HealthRing used={inbox.sent_today} limit={inbox.daily_sending_limit} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${inbox.enabled && inbox.has_password ? 'bg-health animate-pulse-dot' : 'bg-amber-400'}`} />
                <span className="text-sm font-semibold text-slate-100 truncate" data-testid={`inbox-email-${inbox.id}`}>{inbox.email}</span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1.5">
                {inbox.smtp_host ? `${inbox.smtp_host}:${inbox.smtp_port} · ${inbox.smtp_security}` : 'SMTP not configured'} · joined {new Date(inbox.connected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
          <StatusPill status={inbox.enabled && inbox.has_password ? 'connected' : 'draft'} />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { l: 'Sent today', v: `${inbox.sent_today}/${inbox.daily_sending_limit}` },
            { l: 'IMAP replies', v: inbox.imap_host ? 'Auto-sync' : 'Off' },
            { l: 'Status', v: inbox.enabled ? 'Sending on' : 'Paused' },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-line bg-panel/50 px-3 py-2.5">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{s.l}</div>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">{s.v}</div>
            </div>
          ))}
        </div>

        {inbox.signature && (
          <pre className="rounded-xl border border-line bg-panel/40 px-4 py-3 text-xs text-slate-400 whitespace-pre-wrap mb-5 max-h-20 overflow-hidden" data-testid={`inbox-signature-${inbox.id}`}>{inbox.signature}</pre>
        )}

        <div className="flex flex-wrap gap-2">
          <button data-testid={`inbox-edit-${inbox.id}`} onClick={() => onEdit(inbox)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs font-semibold text-slate-300 hover:border-signal/50 hover:text-signal transition-signal">
            <Pencil size={12} /> Edit
          </button>
          <button data-testid={`inbox-sync-${inbox.id}`} onClick={sync} disabled={syncing || !inbox.imap_host} className="inline-flex items-center gap-1.5 rounded-full border border-telemetry/40 text-telemetry px-4 py-2 text-xs font-semibold hover:bg-telemetry/10 disabled:opacity-40 transition-signal">
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync replies
          </button>
          <button data-testid={`inbox-delete-${inbox.id}`} onClick={() => onDelete(inbox)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-signal">
            <Trash2 size={12} /> Remove
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export default function Inboxes() {
  const [inboxes, setInboxes] = useState(null);
  const [editing, setEditing] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/inboxes').then((r) => setInboxes(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const applyPreset = (name) => {
    setForm({ ...form, ...PRESETS[name], smtp_username: form.email || form.smtp_username, provider: name.toLowerCase().includes('gmail') ? 'gmail' : 'custom' });
  };

  const openEdit = (ib) => {
    setEditing(ib);
    setTestResult(null);
    setForm({
      email: ib.email, display_name: ib.display_name, from_name: ib.from_name, signature: ib.signature,
      daily_sending_limit: ib.daily_sending_limit, smtp_host: ib.smtp_host, smtp_port: ib.smtp_port,
      smtp_security: ib.smtp_security, smtp_username: ib.smtp_username, smtp_password: '',
      imap_host: ib.imap_host, imap_port: ib.imap_port, imap_security: ib.imap_security,
    });
    setConnecting(true);
  };

  const testConn = async () => {
    if (!form.smtp_host) {
      toast.error('Enter an SMTP host first');
      return;
    }
    if (editing && !form.smtp_password) {
      toast.error('Enter the app password to test (it is never stored in plain text)');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/inboxes/test', {
        smtp_host: form.smtp_host, smtp_port: Number(form.smtp_port), smtp_security: form.smtp_security,
        smtp_username: form.smtp_username || form.email, smtp_password: form.smtp_password,
        imap_host: form.imap_host, imap_port: Number(form.imap_port), imap_security: form.imap_security,
      });
      setTestResult(r.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!form.email) {
      toast.error('Email is required');
      return;
    }
    if (!editing && form.smtp_host && !form.smtp_password) {
      toast.error('SMTP password (app password) is required for live sending');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        const payload = {
          display_name: form.display_name, from_name: form.from_name, signature: form.signature,
          daily_sending_limit: Number(form.daily_sending_limit), enabled: true,
          smtp_host: form.smtp_host, smtp_port: Number(form.smtp_port), smtp_security: form.smtp_security,
          smtp_username: form.smtp_username || form.email,
          imap_host: form.imap_host, imap_port: Number(form.imap_port), imap_security: form.imap_security,
        };
        if (form.smtp_password) payload.smtp_password = form.smtp_password;
        await api.patch(`/inboxes/${editing.id}`, payload);
        toast.success('Inbox updated');
      } else {
        await api.post('/inboxes', { ...form, daily_sending_limit: Number(form.daily_sending_limit), smtp_port: Number(form.smtp_port), imap_port: Number(form.imap_port) });
        toast.success('Inbox connected — live sending armed');
      }
      setEditing(null);
      setConnecting(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ib) => {
    if (!window.confirm(`Remove ${ib.email}?`)) return;
    await api.delete(`/inboxes/${ib.id}`);
    toast.success('Inbox removed');
    load();
  };

  const inputCls = 'w-full rounded-xl bg-panel border border-line px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal';
  const labelCls = 'font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2';

  return (
    <div data-testid="inboxes-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Inboxes</h1>
          <p className="text-sm text-slate-500 mt-1" data-testid="inboxes-count-label">{inboxes ? `${inboxes.length} mailboxes · live SMTP sending` : 'Loading…'}</p>
        </div>
        <button data-testid="inbox-connect-gmail-btn" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setTestResult(null); setConnecting(true); }} className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">
          <Plus size={16} /> Connect mailbox
        </button>
      </div>

      {(connecting || editing) && (
        <Reveal y={10}>
          <div className="mb-6 rounded-2xl border border-signal/40 bg-obsidian p-6 sm:p-8" data-testid="inbox-form">
            <div className="flex items-center gap-3 mb-6">
              <Mail size={18} className="text-signal" />
              <h2 className="font-display text-xl font-semibold">{editing ? 'Edit mailbox' : 'Connect a sending mailbox'}</h2>
            </div>

            {!editing && (
              <div className="mb-6">
                <label className={labelCls}>Provider preset</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(PRESETS).map((p) => (
                    <button key={p} data-testid={`inbox-preset-${p.toLowerCase().replace(/[^a-z]+/g, '-')}`} onClick={() => applyPreset(p)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-slate-300 hover:border-signal/50 hover:text-signal transition-signal">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>Email address</label>
                <input data-testid="inbox-email-input" type="email" disabled={!!editing} value={form.email} onChange={set('email')} placeholder="you@yourdomain.com" className={`${inputCls} disabled:opacity-50`} />
              </div>
              <div>
                <label className={labelCls}>From name</label>
                <input data-testid="inbox-from-name-input" value={form.from_name} onChange={set('from_name')} placeholder="Deepanshu Singh" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Daily sending limit</label>
                <input data-testid="inbox-limit-input" type="number" min={1} max={1000} value={form.daily_sending_limit} onChange={set('daily_sending_limit')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>SMTP username</label>
                <input data-testid="inbox-smtp-username-input" value={form.smtp_username} onChange={set('smtp_username')} placeholder="usually the email address" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Signature</label>
                <textarea data-testid="inbox-signature-input" rows={3} value={form.signature} onChange={set('signature')} placeholder={'Kind Regards,\nDeepanshu Singh'} className={inputCls} />
              </div>
            </div>

            <div className="mt-7 rounded-xl border border-line bg-panel/30 p-5" data-testid="smtp-section">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal mb-4">SMTP — sending</p>
              <div className="grid sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Host</label>
                  <input data-testid="inbox-smtp-host-input" value={form.smtp_host} onChange={set('smtp_host')} placeholder="smtp.gmail.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input data-testid="inbox-smtp-port-input" type="number" value={form.smtp_port} onChange={set('smtp_port')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Security</label>
                  <select data-testid="inbox-smtp-security-select" value={form.smtp_security} onChange={set('smtp_security')} className={inputCls}>
                    <option value="starttls">STARTTLS (587)</option>
                    <option value="ssl">SSL (465)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{editing ? 'App password (leave blank to keep saved)' : 'App password'}</label>
                  <input data-testid="inbox-smtp-password-input" type="password" value={form.smtp_password} onChange={set('smtp_password')} placeholder={editing ? '••••••••••••' : '16-character app password'} className={inputCls} />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-panel/30 p-5" data-testid="imap-section">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-telemetry mb-4">IMAP — reply tracking</p>
              <div className="grid sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Host</label>
                  <input data-testid="inbox-imap-host-input" value={form.imap_host} onChange={set('imap_host')} placeholder="imap.gmail.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input data-testid="inbox-imap-port-input" type="number" value={form.imap_port} onChange={set('imap_port')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Security</label>
                  <select data-testid="inbox-imap-security-select" value={form.imap_security} onChange={set('imap_security')} className={inputCls}>
                    <option value="ssl">SSL (993)</option>
                    <option value="starttls">STARTTLS</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-4">Gmail: enable 2-Step Verification, then create an App Password at myaccount.google.com/apppasswords — never your normal password.</p>
            </div>

            {testResult && (
              <div className="mt-5 flex flex-wrap gap-3" data-testid="inbox-test-result">
                <ConnBadge ok={testResult.smtp.ok} label={`SMTP ${testResult.smtp.ok ? 'connected' : 'failed'}`} />
                {form.imap_host && <ConnBadge ok={testResult.imap.ok} label={`IMAP ${testResult.imap.ok ? 'connected' : 'failed'}`} />}
                {(!testResult.smtp.ok && testResult.smtp.error) && <span className="text-xs text-red-300 self-center">{testResult.smtp.error}</span>}
                {form.imap_host && !testResult.imap.ok && testResult.imap.error && <span className="text-xs text-red-300 self-center">{testResult.imap.error}</span>}
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              <button data-testid="inbox-test-btn" onClick={testConn} disabled={testing} className="inline-flex items-center gap-2 rounded-full border border-telemetry/40 text-telemetry px-5 py-2.5 text-sm font-semibold hover:bg-telemetry/10 disabled:opacity-50 transition-signal">
                <Loader2 size={15} className={testing ? 'animate-spin' : 'hidden'} /> Test connection
              </button>
              <button data-testid="inbox-save-btn" onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-2.5 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-50 transition-signal signal-glow">
                <CheckCircle2 size={15} /> {busy ? 'Saving…' : editing ? 'Save changes' : 'Connect mailbox'}
              </button>
              <button data-testid="inbox-cancel-btn" onClick={() => { setConnecting(false); setEditing(null); }} className="rounded-full border border-line px-6 py-2.5 text-sm font-semibold text-slate-300 hover:border-slate-500 transition-signal">Cancel</button>
            </div>
          </div>
        </Reveal>
      )}

      {!inboxes && <div className="h-64 rounded-2xl border border-line bg-obsidian/60 animate-pulse" />}
      {inboxes && inboxes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-obsidian/50 py-20 text-center" data-testid="inboxes-empty-state">
          <p className="font-display text-xl font-semibold text-slate-300 mb-2">No mailboxes connected</p>
          <p className="text-sm text-slate-500">Connect one with SMTP + IMAP to start sending for real.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {inboxes?.map((ib) => <InboxCard key={ib.id} inbox={ib} onEdit={openEdit} onDelete={remove} />)}
      </div>
    </div>
  );
}
