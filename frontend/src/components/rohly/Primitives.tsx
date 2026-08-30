import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4" data-testid="page-header"><div>{eyebrow ? <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{eyebrow}</p> : null}<h1 className="text-[26px] font-semibold tracking-[-0.03em] text-slate-950" data-testid="page-title">{title}</h1><p className="mt-1.5 max-w-2xl text-sm text-slate-500" data-testid="page-description">{description}</p></div>{actions}</div>;
}

export function Surface({ children, className = "", testId }: { children: ReactNode; className?: string; testId: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${className}`} data-testid={testId}>{children}</section>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center" data-testid="empty-state"><div className="mb-4 size-10 rounded-lg border border-slate-200 bg-slate-50" /><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>{action}</div>;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return <div className="divide-y divide-slate-100" data-testid="skeleton-rows">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex animate-pulse gap-4 px-4 py-4"><div className="h-4 w-1/4 rounded bg-slate-100" /><div className="h-4 w-1/3 rounded bg-slate-100" /><div className="h-4 w-20 rounded bg-slate-100" /></div>)}</div>;
}