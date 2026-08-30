export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = ["running", "active", "connected", "sent", "healthy", "positive"].includes(normalized)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : ["failed", "stopped", "error", "disconnected", "negative"].includes(normalized)
      ? "border-red-200 bg-red-50 text-red-700"
      : ["paused", "attention", "reconnect_required", "scheduled"].includes(normalized)
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold capitalize ${tone}`} data-testid={`status-${normalized.replaceAll("_", "-")}`}><span className="size-1.5 rounded-full bg-current" />{status.replaceAll("_", " ")}</span>;
}