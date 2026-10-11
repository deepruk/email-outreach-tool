import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Play, Pause, Trash2, ArrowUpRight, MoreHorizontal } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { Reveal } from '../components/motion';
import StatusPill from '../components/StatusPill';

const TABS = ['all', 'active', 'draft', 'scheduled', 'paused'];

export default function Campaigns() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const [menuOpen, setMenuOpen] = useState(null);
  const navigate = useNavigate();

  const load = () => api.get('/campaigns').then((r) => setItems(r.data.items)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, []);

  const act = async (c, action) => {
    try {
      if (action === 'launch') {
        const r = await api.post(`/campaigns/${c.id}/launch`);
        toast.success(`${c.name}: ${r.data.queued_leads} leads queued — sending live`);
      } else {
        await api.post(`/campaigns/${c.id}/${action}`);
        toast.success(`${c.name} ${action === 'pause' ? 'paused' : 'resumed'}`);
      }
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete campaign "${c.name}"?`)) return;
    await api.delete(`/campaigns/${c.id}`);
    toast.success('Campaign deleted');
    load();
  };

  const filtered = items ? items.filter((c) => tab === 'all' || c.status === tab) : [];
  const shown = filtered.filter((c) => tab !== 'all' || c.status !== 'completed');

  return (
    <div data-testid="campaigns-page">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="campaign-status-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              data-testid={`campaign-tab-${t}`}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] border transition-signal whitespace-nowrap ${tab === t ? 'border-signal/50 bg-signal/10 text-signal' : 'border-line text-slate-400 hover:text-slate-200'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Link to="/app/campaigns/new" data-testid="campaign-create-btn" className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">
          <Plus size={16} /> New campaign
        </Link>
      </div>

      {!items && <div className="h-64 rounded-xl border border-line bg-obsidian/60 animate-pulse" />}

      {items && shown.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-obsidian/50 py-20 text-center" data-testid="campaigns-empty-state">
          <p className="font-display text-xl font-semibold text-slate-300 mb-2">No {tab === 'all' ? '' : tab + ' '}campaigns yet</p>
          <p className="text-sm text-slate-500 mb-6">Upload a CSV, write one great email, launch.</p>
          <Link to="/app/campaigns/new" className="inline-flex items-center gap-2 rounded-full border border-signal/40 text-signal px-5 py-2.5 text-sm font-semibold hover:bg-signal/10 transition-signal">
            <Plus size={15} /> Create your first
          </Link>
        </div>
      )}

      <Reveal y={12}>
        {items && shown.length > 0 && (
          <div className="rounded-xl border border-line bg-obsidian overflow-hidden" data-testid="campaigns-table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-line bg-panel/40">
                    <th className="px-5 py-3.5 font-medium">Campaign</th>
                    <th className="px-5 py-3.5 font-medium">Status</th>
                    <th className="px-5 py-3.5 font-medium">Audience</th>
                    <th className="px-5 py-3.5 font-medium">Sent</th>
                    <th className="px-5 py-3.5 font-medium">Replies</th>
                    <th className="px-5 py-3.5 font-medium">Rate</th>
                    <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const rate = c.sent_count ? (Math.round((c.reply_count / c.sent_count) * 1000) / 10).toFixed(1) : null;
                    return (
                      <tr key={c.id} data-testid={`campaign-card-${c.id}`} className="border-b border-line/40 last:border-0 hover:bg-panel/40 transition-signal group">
                        <td className="px-5 py-4">
                          <button onClick={() => navigate(`/app/campaigns/${c.id}`)} data-testid={`campaign-open-${c.id}`} className="text-left">
                            <div className="text-[13px] font-semibold text-slate-100 group-hover:text-signal transition-signal flex items-center gap-1.5">
                              {c.name} <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-signal" />
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 max-w-72 truncate">{c.subject || 'No subject yet'}</div>
                          </button>
                        </td>
                        <td className="px-5 py-4"><StatusPill status={c.status} /></td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-400">{c.lead_count}</td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-200" data-testid={`campaign-sent-${c.id}`}>{c.sent_count}</td>
                        <td className="px-5 py-4 font-mono text-xs text-telemetry" data-testid={`campaign-replies-${c.id}`}>{c.reply_count}</td>
                        <td className="px-5 py-4 font-mono text-xs text-health">{rate ? `${rate}%` : '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {c.status === 'draft' && (
                              <button data-testid={`campaign-launch-${c.id}`} onClick={() => act(c, 'launch')} className="inline-flex items-center gap-1.5 rounded-full bg-signal px-3.5 py-1.5 text-xs font-bold text-ink hover:brightness-110 transition-signal">
                                <Play size={12} /> Launch
                              </button>
                            )}
                            {c.status === 'active' && (
                              <button data-testid={`campaign-pause-${c.id}`} onClick={() => act(c, 'pause')} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 text-amber-400 px-3.5 py-1.5 text-xs font-semibold hover:bg-amber-500/10 transition-signal">
                                <Pause size={12} /> Pause
                              </button>
                            )}
                            {c.status === 'paused' && (
                              <button data-testid={`campaign-resume-${c.id}`} onClick={() => act(c, 'resume')} className="inline-flex items-center gap-1.5 rounded-full border border-health/40 text-health px-3.5 py-1.5 text-xs font-semibold hover:bg-health/10 transition-signal">
                                <Play size={12} /> Resume
                              </button>
                            )}
                            <div className="relative">
                              <button data-testid={`campaign-menu-${c.id}`} onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)} className="p-1.5 text-slate-500 hover:text-slate-200 transition-signal">
                                <MoreHorizontal size={16} />
                              </button>
                              {menuOpen === c.id && (
                                <>
                                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(null)} />
                                  <div className="absolute right-0 top-8 z-40 w-40 rounded-xl border border-line bg-obsidian shadow-2xl shadow-black/50 overflow-hidden">
                                    <button data-testid={`campaign-view-${c.id}`} onClick={() => navigate(`/app/campaigns/${c.id}`)} className="block w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-panel transition-signal">View mission</button>
                                    <button data-testid={`campaign-delete-${c.id}`} onClick={() => remove(c)} className="block w-full text-left px-4 py-2.5 text-xs text-red-300 hover:bg-red-500/10 transition-signal">Delete</button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Reveal>
    </div>
  );
}
