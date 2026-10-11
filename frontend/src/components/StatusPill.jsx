const MAP = {
  active: 'bg-health/10 text-health border-health/30',
  draft: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  scheduled: 'bg-telemetry/10 text-telemetry border-telemetry/30',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  completed: 'bg-slate-500/10 text-slate-500 border-slate-500/30',
  new: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  contacted: 'bg-signal/10 text-signal border-signal/30',
  replied: 'bg-telemetry/10 text-telemetry border-telemetry/30',
  positive: 'bg-health/10 text-health border-health/30',
  bounced: 'bg-red-500/10 text-red-400 border-red-500/30',
  unsubscribed: 'bg-slate-700/30 text-slate-500 border-slate-600/40',
  connected: 'bg-health/10 text-health border-health/30',
};

export default function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] ${MAP[status] || MAP.draft}`}>
      <span className="size-1 rounded-full bg-current" /> {status}
    </span>
  );
}
