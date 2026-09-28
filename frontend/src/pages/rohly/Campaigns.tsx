import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { StatusBadge } from "@/components/rohly/StatusBadge";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  source: string;
  totalLeads: number;
  sent: number;
  failed: number;
  replies: number;
  positive: number;
  steps: unknown[];
  createdAt: string;
  isRohly: boolean;
};

function normalize(row: any, isRohly: boolean): CampaignRow | null {
  if (!row || !row.id) return null;
  const rawStatus = String(row.status ?? "draft").toLowerCase();
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled campaign"),
    status: rawStatus === "active" ? "running" : rawStatus === "queued" ? "draft" : rawStatus,
    source: isRohly ? "Rohly Template" : String(row.source_filename ?? row.source ?? "CSV Campaign"),
    totalLeads: Number(row.total_leads ?? row.total_count ?? 0),
    sent: Number(row.emails_sent ?? row.sent_count ?? 0),
    failed: Number(row.failed_emails ?? row.failed_count ?? 0),
    replies: Number(row.replies ?? 0),
    positive: Number(row.positive_replies ?? 0),
    steps: Array.isArray(row.steps) ? row.steps : [],
    createdAt: String(row.created_at ?? new Date(0).toISOString()),
    isRohly,
  };
}

export default function Campaigns() {
  const client = useQueryClient();
  const [tab, setTab] = useState<"all" | "running" | "paused" | "stopped">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const csv = useQuery({
    queryKey: ["csv-campaigns"],
    queryFn: () => apiGet<any[]>("/csv/campaigns"),
  });
  const rohly = useQuery({
    queryKey: ["rohly-campaigns"],
    queryFn: () => apiGet<any[]>("/workspace/rohly-campaigns/campaigns"),
  });

  const campaigns = [
    ...(csv.data ?? []).map((r) => normalize(r, false)),
    ...(rohly.data ?? []).map((r) => normalize(r, true)),
  ].filter((r): r is CampaignRow => Boolean(r));

  const filtered = campaigns
    .filter((c) =>
      tab === "all" ? true :
      tab === "running" ? c.status === "running" :
      tab === "paused" ? c.status === "paused" :
      ["stopped", "completed"].includes(c.status)
    )
    .filter((c) => {
      const q = search.trim().toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || c.source.toLowerCase().includes(q);
    });

  const counts = {
    all: campaigns.length,
    running: campaigns.filter((c) => c.status === "running").length,
    paused: campaigns.filter((c) => c.status === "paused").length,
    stopped: campaigns.filter((c) => ["stopped", "completed"].includes(c.status)).length,
  };

  const loading = csv.isLoading || rohly.isLoading;
  const failed = csv.isError && rohly.isError;

  const toggle = (id: string) =>
    setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);

  const deleteSelected = async () => {
    const rows = campaigns.filter((c) => selected.includes(c.id));
    if (!rows.length) return;
    if (rows.some((c) => c.status === "running")) {
      toast.error("Pause or stop active campaigns before deleting them");
      return;
    }
    if (!window.confirm(`Delete ${rows.length} selected campaign(s)?`)) return;
    try {
      await Promise.all(rows.map((c) =>
        c.isRohly
          ? apiDelete<void>(`/workspace/rohly-campaigns/${c.id}`)
          : apiDelete<void>(`/csv/campaigns/${c.id}`)
      ));
      setSelected([]);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["csv-campaigns"] }),
        client.invalidateQueries({ queryKey: ["rohly-campaigns"] }),
        client.invalidateQueries({ queryKey: ["command-center"] }),
      ]);
      toast.success("Selected campaigns deleted");
    } catch {
      toast.error("Unable to delete one or more campaigns");
    }
  };

  return (
    <div data-testid="campaigns-page" className="min-h-[calc(100vh-8rem)]">
      <PageHeader
        eyebrow="Campaigns"
        title="Campaigns"
        description="Create, monitor, and optimize every outbound campaign from one place."
        actions={
          <Button onClick={() => { window.location.href = "/campaigns/new"; }} className="h-10 gap-2 rounded-lg bg-blue-700 px-4 shadow-sm hover:bg-blue-800">
            <Plus size={14} /> New campaign
          </Button>
        }
      />

      <div className="mb-4 border-b border-slate-200">
        <div className="flex items-end gap-6 overflow-x-auto">
          {([
            ["all", `All Campaigns (${counts.all})`],
            ["running", `Active (${counts.running})`],
            ["paused", `Paused (${counts.paused})`],
            ["stopped", `Stopped (${counts.stopped})`],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`relative whitespace-nowrap pb-3 text-xs font-semibold ${tab === key ? "text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>
              {label}
              {tab === key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-700" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <button onClick={deleteSelected} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600">
                Delete {selected.length}
              </button>
            )}
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns" className="h-9 rounded-lg border-slate-200 pl-9 text-xs" />
            </div>
          </div>
        </div>

        <Surface className="overflow-hidden" testId="campaigns-table">
          {loading ? <SkeletonRows rows={6} /> : failed ? (
            <div className="p-10 text-center text-sm text-red-600">
              Unable to load campaigns. Please refresh the page.
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No campaigns found" description="Create a campaign or change your search/filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all" checked={selected.length === filtered.length && filtered.length > 0} onChange={() => setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id))} /></th>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Leads</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Replies</th>
                    <th className="px-4 py-3">Failed</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const planned = Math.max(1, c.totalLeads * Math.max(1, c.steps.length));
                    const progress = Math.min(100, Math.round((c.sent / planned) * 100));
                    return (
                      <tr key={`${c.isRohly ? "rohly" : "csv"}-${c.id}`} className="group text-xs transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12"><div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500"><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div></div>
                            <div>
                              <Link to={`/campaigns/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-700">{c.name}</Link>
                              <div className="mt-1 text-[10px] text-slate-400">{c.source} · {c.steps.length} {c.steps.length === 1 ? "step" : "steps"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium>{c.totalLeads}</td>
                        <td className="px-4 py-3 font-medium>{c.sent}</td>
                        <td className="px-4 py-3">{c.replies}</td>
                        <td className="px-4 py-3 text-red-500>{c.failed}</td>
                        <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/campaigns/${c.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700">View <ArrowUpRight size={12} /></Link>
                          {c.status !== "running" && (
                            <button onClick={() => { if (window.confirm(`Delete campaign "${c.name}"?`)) { (c.isRohly ? apiDelete<void>(`/workspace/rohly-campaigns/${c.id}`) : apiDelete<void>(`/csv/campaigns/${c.id}`)).then(() => { client.invalidateQueries({ queryKey: c.isRohly ? ["rohly-campaigns"] : ["csv-campaigns"] }); client.invalidateQueries({ queryKey: ["command-center"] }); }).catch(() => toast.error("Unable to delete campaign")); } }} className="ml-4 text-xs font-semibold text-red-600">
                              <Trash2 size={13} className="inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
