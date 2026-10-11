import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Play, Pause, Send, RefreshCw, Pencil, Eye } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { Reveal } from '../components/motion';
import StatusPill from '../components/StatusPill';

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const [data, setData] = useState(null);

  const load = () => api.get(`/campaigns/${campaignId}`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, [campaignId]);

  const act = async (action) => {
    try {
      if (action === 'test-send') {
        const r = await api.post(`/campaigns/${campaignId}/test-send`);
        toast.success(`Test email sent to ${r.data.to} via ${r.data.via}`);
        return;
      }
      if (action === 'launch') {
        const r = await api.post(`/campaigns/${campaignId}/launch`);
        toast.success(`${r.data.sent} emails dispatched`);
      } else {
        await api.post(`/campaigns/${campaignId}/${action}`);
        toast.success(`Campaign ${action === 'pause' ? 'paused' : 'resumed'}`);
      }
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!data) return <div className="h-96 rounded-2xl border border-line bg-obsidian/60 animate-pulse" data-testid="campaign-detail-loading" />;
  const c = data.campaign;

  return (
    <div data-testid="campaign-detail-page">
      <Link to="/app/campaigns" data-testid="campaign-back-link" className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500 hover:text-signal transition-signal mb-6">
        <ArrowLeft size={14} /> All campaigns
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">{c.name}</h1>
            <StatusPill status={c.status} />
          </div>
          <p className="text-sm text-slate-500">Created {new Date(c.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · limit {c.daily_limit}/day</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/app/campaigns/${campaignId}/edit`} data-testid="campaign-edit-btn" className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-slate-300 hover:border-signal/50 hover:text-signal transition-signal">
            <Pencil size={14} /> Edit campaign
          </Link>
          {c.status === 'draft' && (
            <button data-testid="campaign-detail-launch-btn" onClick={() => act('launch')} className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">
              <Play size={14} /> Launch
            </button>
          )}
          {c.status === 'active' && (
            <button data-testid="campaign-detail-pause-btn" onClick={() => act('pause')} className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 text-amber-400 px-5 py-2.5 text-sm font-semibold hover:bg-amber-500/10 transition-signal">
              <Pause size={14} /> Pause
            </button>
          )}
          {c.status === 'paused' && (
            <button data-testid="campaign-detail-resume-btn" onClick={() => act('resume')} className="inline-flex items-center gap-2 rounded-full border border-health/40 text-health px-5 py-2.5 text-sm font-semibold hover:bg-health/10 transition-signal">
              <Play size={14} /> Resume
            </button>
          )}
          <button data-testid="campaign-detail-sync-btn" onClick={async () => { try { const r = await api.post('/inboxes/sync-all'); toast.success(`Reply sync: ${r.data.new_replies} new replies, ${r.data.bounces} bounces`); load(); } catch (e) { toast.error(apiError(e)); } }} className="inline-flex items-center gap-2 rounded-full border border-telemetry/40 text-telemetry px-5 py-2.5 text-sm font-semibold hover:bg-telemetry/10 transition-signal">
            <RefreshCw size={14} /> Sync replies
          </button>
          <button data-testid="campaign-detail-test-send-btn" onClick={() => act('test-send')} className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-slate-300 hover:border-signal/50 hover:text-signal transition-signal">
            <Send size={14} /> Test send
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5 mb-4">
        {[
          { l: 'Sent', v: c.sent_count, c: 'text-slate-50' },
          { l: 'Opens', v: data.opens, c: 'text-slate-50' },
          { l: 'Replies', v: c.reply_count, c: 'text-telemetry' },
          { l: 'Leads', v: c.lead_count, c: 'text-slate-50' },
          { l: 'Reply rate', v: c.sent_count ? `${Math.round((c.reply_count / c.sent_count) * 1000) / 10}%` : '—', c: 'text-health' },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-line bg-obsidian p-5" data-testid={`campaign-stat-${s.l.toLowerCase().replace(' ', '-')}`}>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">{s.l}</div>
            <div className={`font-display text-2xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {data.step_stats && data.step_stats.length > 1 && (
        <div className="rounded-2xl border border-line bg-obsidian p-6 mb-4" data-testid="campaign-step-stats">
          <h2 className="font-display text-lg font-semibold mb-4">Sequence progress</h2>
          <div className="grid gap-2">
            {data.step_stats.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-panel/40 px-4 py-3" data-testid={`campaign-step-${i}`}>
                <span className="size-6 rounded-full bg-signal/15 border border-signal/40 flex items-center justify-center font-mono text-[10px] text-signal font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-slate-200 truncate">{s.subject || `Email ${i + 1}`}</div>
                  <div className="font-mono text-[10px] text-slate-500">{i === 0 ? 'sent immediately' : `wait ${s.wait_days}d · ${s.sent} sent`}</div>
                </div>
                <span className="font-mono text-xs text-slate-400 shrink-0">{s.sent} sent</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Reveal y={12}>
          <div className="rounded-2xl border border-line bg-obsidian p-6" data-testid="campaign-email-card">
            <h2 className="font-display text-lg font-semibold mb-4">The email</h2>
            <div className="rounded-xl border border-line bg-panel/60 px-4 py-3 mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Subject</div>
              <div className="text-sm text-slate-200">{c.subject || '—'}</div>
            </div>
            <div className="rounded-xl border border-line bg-panel/60 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Body</div>
              <pre className="whitespace-pre-wrap text-sm text-slate-300 font-body leading-relaxed max-h-64 overflow-y-auto">{c.body || '—'}</pre>
            </div>
          </div>
        </Reveal>

        <Reveal y={12} delay={0.08}>
          <div className="rounded-2xl border border-line bg-obsidian p-6" data-testid="campaign-activity-card">
            <h2 className="font-display text-lg font-semibold mb-4">Activity timeline</h2>
            <div className="space-y-1 max-h-[26rem] overflow-y-auto" data-testid="campaign-activity-feed">
              {data.activity.length === 0 && <p className="text-sm text-slate-500">No events yet — launch to start the clock.</p>}
              {data.activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-line/40 last:border-0">
                  <span className={`size-1.5 rounded-full shrink-0 ${a.type === 'positive_replied' ? 'bg-health' : a.type === 'replied' ? 'bg-telemetry' : a.type === 'bounced' ? 'bg-red-400' : 'bg-signal'}`} />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-slate-200 capitalize">{a.type.replace('_', ' ')}</span>
                    <span className="text-xs text-slate-500"> — {a.lead_email}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-600 shrink-0">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal y={12} delay={0.12}>
        <div className="mt-4 rounded-2xl border border-line bg-obsidian p-6" data-testid="campaign-leads-card">
          <h2 className="font-display text-lg font-semibold mb-4">Audience ({data.leads.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="campaign-leads-table">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-line">
                  <th className="pb-3 pr-4 font-medium">Lead</th>
                  <th className="pb-3 pr-4 font-medium">Company</th>
                  <th className="pb-3 pr-4 font-medium">Title</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.slice(0, 12).map((l) => (
                  <tr key={l.id} className="border-b border-line/40 last:border-0 hover:bg-panel/50 transition-signal">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-200">{l.first_name} {l.last_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{l.email}</div>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{l.company}</td>
                    <td className="py-3 pr-4 text-slate-400">{l.title}</td>
                    <td className="py-3"><StatusPill status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
