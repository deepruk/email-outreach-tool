import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Send, Reply, TrendingUp, AlertOctagon, ArrowUpRight, RefreshCw, CheckCircle2, Circle, Rocket, Users, Inbox as InboxIcon, Eye, MousePointerClick } from 'lucide-react';
import api from '../lib/api';
import { CountUp, Reveal } from '../components/motion';
import { AttentionBar } from './AppShell';
import StatusPill from '../components/StatusPill';

const EVENT_META = {
  sent: { label: 'Sent', color: 'bg-signal' },
  opened: { label: 'Opened', color: 'bg-slate-400' },
  replied: { label: 'Replied', color: 'bg-telemetry' },
  positive_replied: { label: 'Positive reply', color: 'bg-health' },
  bounced: { label: 'Bounced', color: 'bg-red-400' },
};

function Kpi({ label, value, suffix, decimals = 0, sub, icon: Icon, tone = 'text-slate-50', testid }) {
  return (
    <div className="rounded-xl border border-line bg-obsidian p-5 hover:border-slate-600 transition-signal" data-testid={testid}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <Icon size={14} className="text-slate-600" />
      </div>
      <div className={`font-display text-[28px] font-bold leading-none ${tone}`}>
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-2">{sub}</div>}
    </div>
  );
}

function Checklist({ data }) {
  const steps = [
    { label: 'Import a lead list', done: data.kpis.leads_total > 0, href: '/app/imports', testid: 'checklist-import' },
    { label: 'Connect a mailbox with SMTP', done: data.inboxes.some((i) => i.smtp_host && i.has_password), href: '/app/inboxes', testid: 'checklist-smtp' },
    { label: 'Launch your first campaign', done: data.kpis.emails_sent > 0, href: '/app/campaigns', testid: 'checklist-launch' },
  ];
  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;
  return (
    <div className="rounded-xl border border-signal/25 bg-signal/5 px-5 py-4 mb-5" data-testid="onboarding-checklist">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-100">Finish setup — you're {Math.round(((steps.length - remaining.length) / steps.length) * 100)}% live</p>
        <Link to={remaining[0].href} data-testid="checklist-next-action" className="text-xs font-bold text-signal hover:underline">Do it now</Link>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {steps.map((s) => (
          <span key={s.label} className={`inline-flex items-center gap-2 text-xs ${s.done ? 'text-slate-500' : 'text-amber-300 font-semibold'}`}>
            {s.done ? <CheckCircle2 size={13} className="text-health" /> : <Circle size={13} className="text-amber-300" />}
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-obsidian animate-pulse" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl border border-line bg-obsidian/60 animate-pulse" />)}
        </div>
        <div className="h-72 rounded-xl border border-line bg-obsidian/60 animate-pulse" />
      </div>
    );
  }

  const k = data.kpis;
  const chart = data.chart.map((c) => ({ ...c, label: c.date.slice(5) }));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div data-testid="dashboard-page">
      <AttentionBar attention={data.attention} />
      <Checklist data={data} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <Kpi label="Emails sent" value={k.emails_sent} sub="last 14 days" icon={Send} testid="kpi-emails-sent" />
        <Kpi label="Replies" value={k.replies} sub={`${k.positive_replies} positive`} icon={Reply} tone="text-telemetry" testid="kpi-replies" />
        <Kpi label="Reply rate" value={k.reply_rate} suffix="%" decimals={1} sub={`${k.positive_reply_rate}% positive rate`} icon={TrendingUp} tone="text-health" testid="kpi-reply-rate" />
        <Kpi label="Bounce rate" value={k.bounce_rate} suffix="%" decimals={1} sub={`${k.failed} failed sends`} icon={AlertOctagon} tone="text-red-400" testid="kpi-bounce-rate" />
      </div>

      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4 mb-4">
        <Reveal y={12}>
          <div className="rounded-xl border border-line bg-obsidian p-6 h-full" data-testid="dashboard-chart-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display text-base font-semibold">Send & reply curve</h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">last 14 days</p>
              </div>
              <Link to="/app/analytics" className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal hover:underline" data-testid="dashboard-view-analytics-link">Full telemetry</Link>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF5A1F" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#FF5A1F" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gReply" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0D111A', border: '1px solid #1E293B', borderRadius: 12, fontFamily: 'JetBrains Mono', fontSize: 12 }} labelStyle={{ color: '#94A3B8' }} cursor={{ stroke: '#FF5A1F', strokeOpacity: 0.3 }} />
                  <Area type="monotone" dataKey="sends" stroke="#FF5A1F" strokeWidth={2} fill="url(#gSent)" />
                  <Area type="monotone" dataKey="replies" stroke="#06B6D4" strokeWidth={2} fill="url(#gReply)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Reveal>

        <Reveal y={12} delay={0.06}>
          <div className="rounded-xl border border-line bg-obsidian p-6 h-full" data-testid="dashboard-inbox-health-card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-base font-semibold">Mailbox health</h2>
              <Link to="/app/inboxes" className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal hover:underline" data-testid="dashboard-manage-inboxes-link">Manage</Link>
            </div>
            <div className="space-y-2.5" data-testid="dashboard-inbox-health-list">
              {data.inboxes.slice(0, 5).map((ib) => {
                const live = ib.smtp_host && ib.has_password;
                const pct = Math.min(100, Math.round((ib.sent_today / Math.max(1, ib.daily_sending_limit)) * 100));
                return (
                  <div key={ib.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel/40 px-3.5 py-2.5" data-testid={`dashboard-inbox-row-${ib.id}`}>
                    <span className={`size-1.5 rounded-full shrink-0 ${live ? 'bg-health animate-pulse-dot' : 'bg-amber-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-200 truncate">{ib.email}</div>
                      <div className="h-1 rounded-full bg-line mt-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 80 ? 'bg-amber-400' : 'bg-health'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">{ib.sent_today}/{ib.daily_sending_limit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>

      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4">
        <Reveal y={12} delay={0.1}>
          <div className="rounded-xl border border-line bg-obsidian p-6 h-full" data-testid="dashboard-campaigns-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Campaign performance</h2>
              <Link to="/app/campaigns" className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal hover:underline" data-testid="dashboard-all-campaigns-link">All campaigns</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="dashboard-campaigns-table">
                <thead>
                  <tr className="text-left font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500 border-b border-line">
                    <th className="pb-2.5 pr-4 font-medium">Campaign</th>
                    <th className="pb-2.5 pr-4 font-medium">Status</th>
                    <th className="pb-2.5 pr-4 font-medium">Audience</th>
                    <th className="pb-2.5 pr-4 font-medium">Sent</th>
                    <th className="pb-2.5 font-medium">Replies</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => {
                    const share = c.lead_count ? Math.min(100, Math.round((c.sent_count / c.lead_count) * 100)) : 0;
                    return (
                      <tr key={c.id} className="border-b border-line/40 last:border-0">
                        <td className="py-3 pr-4">
                          <Link to={`/app/campaigns/${c.id}`} data-testid={`dashboard-campaign-row-${c.id}`} className="group">
                            <div className="text-[13px] font-semibold text-slate-100 group-hover:text-signal transition-signal">{c.name}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 max-w-56 truncate">{c.subject}</div>
                            <div className="h-1 rounded-full bg-line mt-2 w-40 overflow-hidden">
                              <div className="h-full rounded-full bg-signal" style={{ width: `${share}%` }} />
                            </div>
                          </Link>
                        </td>
                        <td className="py-3 pr-4"><StatusPill status={c.status} /></td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-400">{c.lead_count}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-200">{c.sent_count}</td>
                        <td className="py-3 font-mono text-xs text-telemetry">{c.reply_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        <Reveal y={12} delay={0.14}>
          <div className="rounded-xl border border-line bg-obsidian p-6 h-full" data-testid="dashboard-activity-card">
            <h2 className="font-display text-base font-semibold mb-4">Live activity</h2>
            <div className="space-y-1 max-h-80 overflow-y-auto" data-testid="dashboard-activity-feed">
              {data.activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-line/40 last:border-0">
                  <span className={`size-1.5 rounded-full shrink-0 ${EVENT_META[a.type]?.color || 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] text-slate-200">{EVENT_META[a.type]?.label || a.type}</span>
                    <span className="text-xs text-slate-500"> — {a.lead_email}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-600 shrink-0">{new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
