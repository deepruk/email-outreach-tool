import { useEffect, useState } from 'react';
import { Check, Zap } from 'lucide-react';
import api from '../lib/api';
import { Reveal, CountUp } from '../components/motion';

export default function Billing() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/billing').then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="h-96 rounded-2xl border border-line bg-obsidian/60 animate-pulse" data-testid="billing-loading" />;
  const u = data.usage;

  return (
    <div className="max-w-5xl" data-testid="billing-page">
      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-slate-500 mt-1">Your flight plan and usage telemetry.</p>
      </div>

      <Reveal y={12}>
        <div className="rounded-2xl border border-signal/50 bg-obsidian p-6 sm:p-8 signal-glow mb-4" data-testid="billing-current-plan">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Zap size={16} className="text-signal" />
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal">Current plan</span>
              </div>
              <div className="font-display text-3xl font-bold capitalize">{data.plan}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl font-bold">${data.price_monthly}<span className="text-sm text-slate-500 font-body"> /mo</span></div>
              <div className="font-mono text-[10px] text-slate-500 mt-1">renews monthly</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { l: 'Leads used', v: u.leads, q: u.leads_quota },
              { l: 'Inboxes connected', v: u.inboxes, q: u.inboxes_quota },
            ].map((m) => (
              <div key={m.l} data-testid={`billing-usage-${m.l.split(' ')[0].toLowerCase()}`}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">{m.l}</span>
                  <span className="font-mono text-slate-200">{m.v.toLocaleString()} / {m.q.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-panel overflow-hidden">
                  <div className="h-full rounded-full bg-signal transition-all duration-1000" style={{ width: `${Math.min(100, (m.v / m.q) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal y={12} delay={0.06}>
        <div className="rounded-2xl border border-line bg-obsidian p-6 sm:p-8 mb-4" data-testid="billing-tiers">
          <h2 className="font-display text-lg font-semibold mb-6">Change altitude</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { n: 'Cadet', p: 29 },
              { n: 'Growth', p: 79, hot: true },
              { n: 'Fleet', p: 199 },
            ].map((t) => (
              <div key={t.n} className={`rounded-xl border p-5 transition-signal ${t.hot ? 'border-signal/50 bg-signal/5' : 'border-line hover:border-slate-600'}`}>
                <div className="font-display font-semibold mb-1">{t.n}</div>
                <div className="font-display text-2xl font-bold mb-4">${t.p}<span className="text-xs text-slate-500 font-body"> /mo</span></div>
                <button data-testid={`billing-tier-${t.n.toLowerCase()}-btn`} className={`w-full rounded-full py-2 text-xs font-bold transition-signal ${t.hot ? 'bg-signal text-ink hover:brightness-110' : 'border border-line text-slate-300 hover:border-signal/50 hover:text-signal'}`}>
                  {t.hot ? 'Current plan' : `Switch to ${t.n}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal y={12} delay={0.1}>
        <div className="rounded-2xl border border-line bg-obsidian p-6 sm:p-8" data-testid="billing-invoices">
          <h2 className="font-display text-lg font-semibold mb-5">Invoices</h2>
          <div className="space-y-1">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3 border-b border-line/40 last:border-0" data-testid={`invoice-row-${inv.id}`}>
                <span className="font-mono text-xs text-slate-400">{inv.id}</span>
                <span className="font-mono text-xs text-slate-500">{new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className="font-mono text-xs text-slate-200">${inv.amount}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-health/30 bg-health/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-health">
                  <Check size={10} /> {inv.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
