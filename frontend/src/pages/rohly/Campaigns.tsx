import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Mail, MessageSquare, Pencil, Plus, Search, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { StatusBadge } from "@/components/rohly/StatusBadge";

type CampaignRow = {
  id: string; name: string; status: string; source: string; totalLeads: number;
  sent: number; failed: number; bounces: number; replies: number; positive: number;
  steps: unknown[]; createdAt: string; isRohly: boolean;
};

function normalize(row: any, isRohly: boolean): CampaignRow | null {
  if (!row || !row.id) return null;
  const rawStatus = String(row.status ?? "draft").toLowerCase();
  return {
    id: String(row.id), name: String(row.name ?? "Untitled campaign"),
    status: rawStatus === "active" ? "running" : rawStatus === "queued" ? "draft" : rawStatus,
    source: isRohly ? "Rohly Template" : String(row.source_filename ?? row.source ?? "CSV Campaign"),
    totalLeads: Number(row.total_leads ?? row.total_count ?? 0),
    sent: Number(row.emails_sent ?? row.sent_count ?? 0), failed: Number(row.failed_emails ?? row.failed_count ?? 0),
    bounces: Number(row.bounces ?? 0), replies: Number(row.replies ?? 0),
    positive: Number(row.positive_replies ?? 0), steps: Array.isArray(row.steps) ? row.steps : [],
    createdAt: String(row.created_at ?? new Date(0).toISOString()), isRohly,
  };
}

function MetricCard({ label, value, detail, icon: Icon, accent = "slate" }: {
  label: string; value: string | number; detail: string; icon: typeof Users; accent?: "slate" | "orange" | "green" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600", orange: "bg-orange-50 text-orange-600",
    green: "bg-emerald-50 text-emerald-600", blue: "bg-sky-50 text-sky-700",
  };
  return <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.025)] sm:p-5">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`flex size-8 items-center justify-center rounded-lg ${tones[accent]}`}><Icon size={15}/></span></div>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p>
  </div>;
}

export default function Campaigns() {
  const client = useQueryClient();
  const [tab, setTab] = useState<"all" | "running" | "paused" | "stopped">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const csv = useQuery({ queryKey: ["csv-campaigns"], queryFn: () => apiGet<any[]>("/csv/campaigns") });
  const rohly = useQuery({ queryKey: ["rohly-campaigns"], queryFn: () => apiGet<any[]>("/workspace/rohly-campaigns/campaigns") });
  const livePerformance = useQuery({ queryKey: ["campaign-performance"], queryFn: () => apiGet<any[]>("/product/campaigns") });
  const performanceById = new Map((livePerformance.data ?? []).map((row) => [String(row.id), row]));
  const campaigns = [
    ...(csv.data ?? []).map((r) => normalize(r, false)),
    ...(rohly.data ?? []).map((r) => normalize(r, true)),
  ].filter((r): r is CampaignRow => Boolean(r)).map((row) => {
    const live = performanceById.get(row.id);
    return live ? { ...row, sent: Number(live.sent ?? row.sent), replies: Number(live.replies ?? row.replies), positive: Number(live.positive_replies ?? row.positive) } : row;
  });
  const filtered = campaigns.filter((c) =>
    tab === "all" ? true : tab === "running" ? c.status === "running" : tab === "paused" ? c.status === "paused" : ["stopped", "completed"].includes(c.status)
  ).filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.source.toLowerCase().includes(q);
  });
  const counts = {
    all: campaigns.length, running: campaigns.filter((c) => c.status === "running").length,
    paused: campaigns.filter((c) => c.status === "paused").length,
    stopped: campaigns.filter((c) => ["stopped", "completed"].includes(c.status)).length,
  };
  const totalLeads = campaigns.reduce((sum, c) => sum + c.totalLeads, 0);
  const totalSent = campaigns.reduce((sum, c) => sum + c.sent, 0);
  const totalReplies = campaigns.reduce((sum, c) => sum + c.replies, 0);
  const replyRate = totalSent > 0 ? `${((totalReplies / totalSent) * 100).toFixed(1)}%` : "—";
  const loading = csv.isLoading || rohly.isLoading || livePerformance.isLoading;
  const failed = csv.isError && rohly.isError;
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);

  const renameCampaign = async (campaign: CampaignRow) => {
    const entered = window.prompt("Enter a new campaign name", campaign.name);
    if (entered === null) return;
    const name = entered.trim();
    if (!name) { toast.error("Campaign name cannot be empty"); return; }
    if (name === campaign.name) return;
    try {
      const endpoint = campaign.isRohly ? `/workspace/rohly-campaigns/${campaign.id}/name` : `/csv/campaigns/${campaign.id}/name`;
      await apiPatch(endpoint, { name });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["csv-campaigns"] }),
        client.invalidateQueries({ queryKey: ["rohly-campaigns"] }),
        client.invalidateQueries({ queryKey: ["campaign-performance"] }),
      ]);
      toast.success("Campaign renamed");
    } catch (error: any) { toast.error(error?.message || "Unable to rename campaign"); }
  };

  const deleteSelected = async () => {
    const rows = campaigns.filter((c) => selected.includes(c.id));
    if (!rows.length) return;
    if (rows.some((c) => c.status === "running")) { toast.error("Pause or stop active campaigns before deleting them"); return; }
    if (!window.confirm(`Delete ${rows.length} selected campaign(s)?`)) return;
    try {
      await Promise.all(rows.map((c) => c.isRohly ? apiDelete<void>(`/workspace/rohly-campaigns/${c.id}`) : apiDelete<void>(`/csv/campaigns/${c.id}`)));
      setSelected([]);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["csv-campaigns"] }),
        client.invalidateQueries({ queryKey: ["rohly-campaigns"] }),
        client.invalidateQueries({ queryKey: ["command-center"] }),
      ]);
      toast.success("Selected campaigns deleted");
    } catch { toast.error("Unable to delete one or more campaigns"); }
  };

  return <div data-testid="campaigns-page" className="space-y-6 pb-8">
    <PageHeader eyebrow="OUTBOUND WORKSPACE" title="Campaigns" description="A clear view of what’s running, what’s working, and what needs attention."
      actions={<Button onClick={() => { window.location.href = "/campaigns/new"; }} className="h-10 gap-2 rounded-lg bg-orange-500 px-4 font-semibold shadow-sm shadow-orange-200 hover:bg-orange-600"><Plus size={15}/> New campaign</Button>} />

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Total campaigns" value={counts.all} detail={`${counts.running} currently active`} icon={Mail} accent="orange"/>
      <MetricCard label="Leads in campaigns" value={totalLeads.toLocaleString()} detail="Across all campaigns" icon={Users}/>
      <MetricCard label="Emails sent" value={totalSent.toLocaleString()} detail="Recorded sends" icon={Send} accent="blue"/>
      <MetricCard label="Reply rate" value={replyRate} detail={`${totalReplies.toLocaleString()} replies received`} icon={MessageSquare} accent="green"/>
    </div>

    <Surface className="overflow-hidden" testId="campaigns-table">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-sm font-semibold text-slate-900">All campaigns</h2><p className="mt-1 text-xs text-slate-500">Manage and track your outbound activity.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." aria-label="Search campaigns" className="h-9 rounded-lg border-slate-200 bg-slate-50 pl-9 text-xs focus-visible:ring-orange-200"/></div>
            {selected.length > 0 && <button onClick={deleteSelected} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100"><Trash2 size={13}/> Delete {selected.length} selected</button>}
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100/80 p-1">
          {([
            ["all", "All campaigns", counts.all],
            ["running", "Active", counts.running],
            ["paused", "Paused", counts.paused],
            ["stopped", "Stopped", counts.stopped],
          ] as const).map(([key, label, count]) => <button key={key} onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${tab === key ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}>{label}<span className={`rounded px-1.5 py-0.5 text-[10px] ${tab === key ? "bg-orange-50 text-orange-700" : "bg-slate-200/70 text-slate-500"}`}>{count}</span></button>)}
        </div>
      </div>
      {loading ? <div className="p-4"><SkeletonRows rows={6}/></div> : failed ? <div className="p-10 text-center text-sm text-red-600">Unable to load campaigns. Please refresh the page.</div> : filtered.length === 0 ? <EmptyState title="No campaigns found" description="Create a campaign or change your search/filter."/> : <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all visible campaigns" checked={filtered.length > 0 && filtered.every((c) => selected.includes(c.id))} onChange={() => setSelected(filtered.every((c) => selected.includes(c.id)) ? selected.filter((id) => !filtered.some((c) => c.id === id)) : [...new Set([...selected, ...filtered.map((c) => c.id)])]} className="rounded border-slate-300 accent-orange-500"/></th>
              <th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Replies</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Bounce rate</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const planned = Math.max(1, c.totalLeads * Math.max(1, c.steps.length));
              const progress = Math.min(100, Math.round((c.sent / planned) * 100));
              const attempts = c.sent + c.failed;
              const bounceRate = attempts > 0 ? `${((c.bounces / attempts) * 100).toFixed(1)}%` : "—";
              return <tr key={`${c.isRohly ? "rohly" : "csv"}-${c.id}`} className="group transition-colors hover:bg-orange-50/30">
                <td className="px-4 py-4"><input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="rounded border-slate-300 accent-orange-500"/></td>
                <td className="px-4 py-4">
                  <div className="flex min-w-[240px] items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-orange-600"><Mail size={15}/></div>
                    <div className="min-w-0 flex-1"><Link to={`/campaigns/${c.id}`} className="block max-w-[280px] truncate text-xs font-semibold text-slate-900 hover:text-orange-700">{c.name}</Link><div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500"><span className="max-w-[160px] truncate">{c.source}</span><span className="text-slate-300">·</span><span>{c.steps.length} {c.steps.length === 1 ? "step" : "steps"}</span></div><div className="mt-2 flex items-center gap-2"><div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500" style={{width:`${progress}%`}}/></div><span className="text-[10px] tabular-nums text-slate-400">{progress}%</span></div></div>
                  </div>
                </td>
                <td className="px-4 py-4 text-xs font-medium tabular-nums text-slate-700">{c.totalLeads.toLocaleString()}</td>
                <td className="px-4 py-4 text-xs font-medium tabular-nums text-slate-700">{c.sent.toLocaleString()}</td>
                <td className="px-4 py-4"><span className="text-xs font-medium tabular-nums text-slate-700">{c.replies.toLocaleString()}</span>{c.positive > 0 && <span className="mt-1 block text-[10px] text-emerald-600">{c.positive} positive</span>}</td>
                <td className="px-4 py-4 text-xs tabular-nums ${c.failed > 0 ? "text-red-600" : "text-slate-500"}">{c.failed.toLocaleString()}</td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium tabular-nums ${c.bounces > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`} title={`${c.bounces} bounced email(s)`}>{bounceRate}</span></td>
                <td className="px-4 py-4"><StatusBadge status={c.status}/></td>
                <td className="px-4 py-4"><div className="flex items-center justify-end gap-3 whitespace-nowrap"><button onClick={() => renameCampaign(c)} title="Rename campaign" aria-label={`Rename ${c.name}`} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-orange-700"><Pencil size={12}/> Rename</button><Link to={`/campaigns/${c.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:text-orange-800">View <ArrowUpRight size={12}/></Link>{c.status !== "running" && <button onClick={() => { if (window.confirm(`Delete campaign "${c.name}"?`)) { (c.isRohly ? apiDelete<void>(`/workspace/rohly-campaigns/${c.id}`) : apiDelete<void>(`/csv/campaigns/${c.id}`)).then(() => { client.invalidateQueries({queryKey:c.isRohly ? ["rohly-campaigns"] : ["csv-campaigns"]}); client.invalidateQueries({queryKey:["command-center"]}); }).catch(() => toast.error("Unable to delete campaign")); } }} title="Delete campaign" aria-label={`Delete ${c.name}`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13}/></button>}</div></td>
              </tr>;
            })}
          </tbody>
        </table>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Showing <strong className="font-semibold text-slate-700">{filtered.length}</strong> of <strong className="font-semibold text-slate-700">{campaigns.length}</strong> campaigns</span><span className="inline-flex items-center gap-1.5"><Check size={12} className="text-emerald-600"/> Campaign data updates from your connected workspace</span></div>
      </div>}
    </Surface>
  </div>;
}
