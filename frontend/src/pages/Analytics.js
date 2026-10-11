import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Send, Eye, Reply, Sparkles } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { toast } from 'sonner';
import { Reveal, CountUp } from '../components/motion';

export default function Analytics() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/analytics?days=${days}`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  }, [days]);

  const funnel = data?.funnel;
  const maxSent = funnel?.sent || 1;

  return (
    <div data-testid="analytics-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">The whole funnel, one instrument panel.</p>
        </div>
        <div className="flex gap-2" data-testid="analytics-window-tabs">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} data-testid={`analytics-window-${d}`} onClick={() => setDays(d)} className={`rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] border transition-signal ${days === d ? 'border-signal/50 bg-signal/10 text-signal' : 'border-line text-slate-400 hover:text-slate-200'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        {[
          { l: 'Emails sent', v: data?.kpis.emails_sent, icon: Send, c: 'text-slate-50', t: 'kpi-analytics-sent' },
          { l: 'Replies', v: data?.kpis.replies, icon: Reply, c: 'text-telemetry', t: 'kpi-analytics-replies' },
          { l: 'Positive replies', v: data?.kpis.positive_replies, icon: Sparkles, c: 'text-health', t: 'kpi-analytics-positive' },
          { l: 'Bounce rate', v: data?.kpis.bounce_rate, suffix: '%', d: 1, icon: Eye, c: 'text-red-400', t: 'kpi-analytics-bounce' },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-line bg-obsidian p-6" data-testid={s.t}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{s.l}</span>
              <s.icon size={15} className="text-slate-600" />
            </div>
            <div className={`font-display text-3xl font-bold ${s.c}`}>
              {s.v == null ? '—' : <CountUp value={s.v} decimals={s.d || 0} suffix={s.suffix || ''} />}
            </div>
          </div>
        ))}
      </div>

      <Reveal y={12}>
        <div className="rounded-2xl border border-line bg-obsidian p-6 mb-4" data-testid="analytics-chart-card">
          <h2 className="font-display text-lg font-semibold mb-1">Sends & replies</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-6">last {days} days</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(data?.chart || []).map((c) => ({ ...c, label: c.date.slice(5) }))} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="aSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF5A1F" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#FF5A1F" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="aReply" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} interval={Math.floor(days / 8)} />
                <YAxis tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0D111A', border: '1px solid #1E293B', borderRadius: 12, fontFamily: 'JetBrains Mono', fontSize: 12 }} labelStyle={{ color: '#94A3B8' }} cursor={{ stroke: '#FF5A1F', strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="sends" stroke="#FF5A1F" strokeWidth={2} fill="url(#aSent)" />
                <Area type="monotone" dataKey="positive_replies" stroke="#10B981" strokeWidth={2} fill="url(#aReply)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-2 gap-4">
        <Reveal y={12} delay={0.06}>
          <div className="rounded-2xl border border-line bg-obsidian p-6 h-full" data-testid="analytics-funnel-card">
            <h2 className="font-display text-lg font-semibold mb-6">Conversion funnel</h2>
            {[
              { l: 'Sent', v: funnel?.sent, c: 'bg-signal' },
              { l: 'Replied', v: funnel?.replied, c: 'bg-telemetry' },
              { l: 'Positive', v: funnel?.positive, c: 'bg-health' },
            ].map((f) => (
              <div key={f.l} className="mb-5 last:mb-0" data-testid={`funnel-step-${f.l.toLowerCase()}`}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">{f.l}</span>
                  <span className="font-mono text-slate-400">{f.v?.toLocaleString() || 0}</span>
                </div>
                <div className="h-2.5 rounded-full bg-panel overflow-hidden">
                  <div className={`h-full rounded-full ${f.c} transition-all duration-1000`} style={{ width: `${Math.max(2, ((f.v || 0) / maxSent) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal y={12} delay={0.12}>
          <div className="rounded-2xl border border-line bg-obsidian p-6 h-full" data-testid="analytics-sentiment-card">
            <h2 className="font-display text-lg font-semibold mb-6">Reply sentiment</h2>
            {data && (
              <div className="flex h-3 rounded-full overflow-hidden mb-6" data-testid="sentiment-strip">
                {['positive', 'neutral', 'negative'].map((k) => {
                  const total = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative || 1;
                  const w = (data.sentiment[k] / total) * 100;
                  return <div key={k} className={k === 'positive' ? 'bg-health' : k === 'neutral' ? 'bg-telemetry' : 'bg-red-400'} style={{ width: `${w}%` }} />;
                })}
              </div>
            )}
            <div className="space-y-4">
              {[
                { l: 'Positive', k: 'positive', c: 'text-health' },
                { l: 'Neutral', k: 'neutral', c: 'text-telemetry' },
                { l: 'Negative', k: 'negative', c: 'text-red-400' },
              ].map((s) => (
                <div key={s.k} className="flex items-center justify-between border-b border-line/40 pb-4 last:border-0 last:pb-0">
                  <span className="flex items-center gap-2.5 text-sm text-slate-300">
                    <span className={`size-1.5 rounded-full ${s.c.replace('text', 'bg')}`} /> {s.l} replies
                  </span>
                  <span className={`font-mono text-sm ${s.c}`} data-testid={`sentiment-count-${s.k}`}>{data?.sentiment[s.k] ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
