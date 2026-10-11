import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, Layers3, Pause, Play, Square, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, SkeletonRows, Surface } from "@/components/rohly/Primitives";
import "@/components/rohly/campaigns.css";
import "@/components/rohly/campaign-reference.css";
import { StatusBadge } from "@/components/rohly/StatusBadge";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  source: string;
  totalLeads: number;
  sent: number;
  failed: number;
  bounces: number;
  replies: number;
  opens: number | null;
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
    bounces: Number(row.bounces ?? 0),
    replies: Number(row.replies ?? 0),
    opens: row.unique_opens == null ? null : Number(row.unique_opens),
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
    refetchInterval: 30000,
    queryFn: () => apiGet<any[]>("/csv/campaigns"),
  });
  const rohly = useQuery({
    queryKey: ["rohly-campaigns"],
    refetchInterval: 30000,
    queryFn: () => apiGet<any[]>("/workspace/rohly-campaigns/campaigns"),
  });
  const livePerformance = useQuery({
    queryKey: ["campaign-performance"],
    refetchInterval: 30000,
    queryFn: () => apiGet<any[]>("/product/campaigns"),
  });

  const refreshing = csv.isFetching || rohly.isFetching || livePerformance.isFetching;
  const refresh = () => { void Promise.all([csv.refetch(), rohly.refetch(), livePerformance.refetch()]); };
  const performanceById = new Map((livePerformance.data ?? []).map((row) => [String(row.id), row]));
  const campaigns = [
    ...(csv.data ?? []).map((r) => normalize(r, false)),
    ...(rohly.data ?? []).map((r) => normalize(r, true)),
  ].filter((r): r is CampaignRow => Boolean(r)).map((row) => {
    const live = performanceById.get(row.id);
    return live ? { ...row, sent: Number(live.sent ?? row.sent), replies: Number(live.replies ?? row.replies), positive: Number(live.positive_replies ?? row.positive) } : row;
  });

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

  const loading = csv.isLoading || rohly.isLoading || livePerformance.isLoading;
  const failed = csv.isError && rohly.isError;

  const toggle = (id: string) =>
    setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);

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
    } catch (error: any) {
      toast.error(error?.message || "Unable to rename campaign");
    }
  };

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
    <div data-testid="campaigns-page" className="rohly-campaigns campaign-reference-list min-h-[calc(100vh-8rem)]">
      <PageHeader
        eyebrow=""
        title="Email campaigns"
        description="Create, organize, and manage your outreach campaigns."
        actions={
          <div className="cp-head-actions"><button onClick={refresh} className="cp-refresh" disabled={refreshing} aria-label="Refresh campaign data"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh</button><Button onClick={() => { window.location.href = "/campaigns/new"; }} className="cp-create h-10 gap-2 rounded-lg bg-blue-700 px-4 shadow-sm hover:bg-blue-800">
            <Plus size={14} /> New campaign
          </Button></div>
        }
      />

      {!failed && (csv.isError || rohly.isError || livePerformance.isError) ? <div className="cp-data-notice" role="status">Some campaign data could not refresh. <button onClick={refresh}>Try again</button></div> : null}
      <section className="cp-library"><div className="cp-library-heading"><div><span className="cp-eyebrow">CAMPAIGN LIBRARY</span><h2>Your campaigns</h2></div><span className="cp-count"><Layers3 size={13} />{loading ? "Loading…" : `${counts.all} campaigns`}</span></div>
      <div className="cp-tabs">
        <div className="flex items-center gap-2 overflow-x-auto">
          {([
            ["all", `All Campaigns (${counts.all})`],
            ["running", `Active (${counts.running})`],
            ["paused", `Paused (${counts.paused})`],
            ["stopped", `Stopped (${counts.stopped})`],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`cp-tab ${tab === key ? "cp-tab-active" : ""}`} aria-pressed={tab === key}>
              {label}

            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="cp-table-toolbar">
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <button onClick={deleteSelected} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600">
                Delete {selected.length}
              </button>
            )}
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" className="cp-search h-9 rounded-lg border-slate-200 pl-9 text-xs" />
            </div>
          </div>
          <span className="cp-table-caption"><Clock3 size={12} /> Refreshes every 30 seconds</span>
        </div>

        <Surface className="cp-table-surface overflow-hidden" testId="campaigns-table">
          {loading ? <SkeletonRows rows={6} /> : failed ? (
            <div className="p-10 text-center text-sm text-red-600">
              Unable to load campaigns. Please refresh the page.
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No campaigns found" description="Create a campaign or change your search/filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all" checked={selected.length === filtered.length && filtered.length > 0} onChange={() => setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id))} /></th>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Leads</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Opened</th><th className="px-4 py-3">Replied</th><th className="px-4 py-3">Positive</th>
                    <th className="px-4 py-3">Failed</th>

                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const planned = Math.max(1, c.totalLeads * Math.max(1, c.steps.length));
                    const progress = Math.min(100, Math.round((c.sent / planned) * 100));
                    return (
                      <tr key={`${c.isRohly ? "rohly" : "csv"}-${c.id}`} className={`group text-xs transition-colors hover:bg-slate-50/80 ${selected.includes(c.id) ? "cp-row-selected" : ""}`}>
                        <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`ref-campaign-ring ${c.status}`} style={{ background: `conic-gradient(var(--ring-color) ${progress}%, var(--ref-line) 0)` }} title={`${progress}% sent`}><span>{c.status === "running" ? <Play size={13} /> : c.status === "paused" ? <Pause size={13} /> : <Square size={11} />}</span></div>
                            <div>
                              <div className="flex items-center gap-2"><Link to={`/campaigns/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-700">{c.name}</Link><StatusBadge status={c.status} /></div>
                              <div className="mt-1 text-[10px] text-slate-400">{c.steps.length} sequences · Created {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">{c.totalLeads}</td>
                        <td className="px-4 py-3 font-medium ref-sent">{c.sent}</td>
                        <td className="px-4 py-3 ref-opened">{c.opens ?? "—"}</td><td className="px-4 py-3"><span className="cp-replies">{c.replies}</span></td><td className="px-4 py-3 ref-positive">{c.positive}</td>
                        <td className="px-4 py-3 text-red-500">{c.failed}</td>

                        <td className="px-4 py-3 text-right">
                          <button onClick={() => renameCampaign(c)} title="Rename campaign" aria-label={`Rename ${c.name}`} className="mr-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700"><Pencil size={12} /> Rename</button>
                          <Link to={`/campaigns/${c.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700">View <ArrowUpRight size={12} /></Link>
                          {c.status !== "running" && (
                            <button onClick={() => { if (window.confirm(`Delete campaign "${c.name}"?`)) { (c.isRohly ? apiDelete<void>(`/workspace/rohly-campaigns/${c.id}`) : apiDelete<void>(`/csv/campaigns/${c.id}`)).then(() => { client.invalidateQueries({ queryKey: c.isRohly ? ["rohly-campaigns"] : ["csv-campaigns"] }); client.invalidateQueries({ queryKey: ["command-center"] }); }).catch(() => toast.error("Unable to delete campaign")); } }} aria-label={`Delete ${c.name}`} className="ml-4 text-xs font-semibold text-red-600">
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
      </section>
    </div>
  );
}
