import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-4" data-testid="page-header"><div className="min-w-0">{eyebrow ? <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">{eyebrow}</p> : null}<h1 className="text-[25px] font-bold leading-tight tracking-[-0.035em] text-slate-950" data-testid="page-title">{title}</h1><p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-500" data-testid="page-description">{description}</p></div>{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}</div>;
}

export function Surface({ children, className = "", testId }: { children: ReactNode; className?: string; testId: string }) {
  return <section className={`rounded-xl border border-[#e8eaf2] bg-white shadow-[0_3px_12px_rgba(32,42,76,0.045)] ${className}`} data-testid={testId}>{children}</section>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 py-9 text-center" data-testid="empty-state"><div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50"><span className="size-2 rounded-full bg-violet-500" /></div><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>{action}</div>;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return <div className="divide-y divide-slate-100" data-testid="skeleton-rows">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex animate-pulse gap-4 px-4 py-3.5"><div className="h-3.5 w-1/4 rounded bg-slate-100" /><div className="h-3.5 w-1/3 rounded bg-slate-100" /><div className="h-3.5 w-20 rounded bg-slate-100" /></div>)}</div>;
}
