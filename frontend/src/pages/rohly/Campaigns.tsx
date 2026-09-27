import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MoreHorizontal, Pause, Play, Plus, Search, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import type { CsvCampaign } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { StatusBadge } from "@/components/rohly/StatusBadge";

export default function Campaigns() {
  const client = useQueryClient();
  const [tab, setTab] = useState<"all" | "running" | "paused" | "stopped">("all");
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const query = useQuery({ queryKey: ["csv-campaigns"], queryFn: () => apiGet<CsvCampaign[]>("/csv/campaigns") });
  const rohlyQuery = useQuery({ queryKey: ["rohly-campaigns"], queryFn: () => apiGet<any[]>("/workspace/rohly-campaigns/campaigns") });

  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "running" | "paused" | "stopped" }) =>
      apiPatch<CsvCampaign>(`/csv/campaigns/${id}/status`, { status: value }),
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      client.invalidateQueries({ queryKey: ["rohly-campaigns"] });
      setOpenMenu(null);
      toast.success(`Campaign ${variables.value}`);
    },
    onError: () => toast.error("Unable to update campaign status"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/csv/campaigns/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      setOpenMenu(null);
      toast.success("Campaign deleted");
    },
    onError: () => toast.error("Unable to delete campaign"),
  });

  const handleDelete = (campaign: CsvCampaign) => {
    if (campaign.status === "running") {
      toast.error("Pause or stop the campaign before deleting it");
      return;
    }
    if (window.confirm(`Delete campaign "${campaign.name}"? This will remove its scheduled emails and cannot be undone.`)) {
      remove.mutate(campaign.id);
    }
  };

  const rohlyCampaigns = (rohlyQuery.data ?? []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    source_filename: "Rohly Template",
    total_leads: campaign.total_count ?? 0,
    emails_sent: campaign.sent_count ?? 0,
    replies: 0,
    positive_replies: 0,
    failed_emails: campaign.failed_count ?? 0,
    steps: campaign.steps ?? [],
    status: campaign.status === "active" ? "running" : campaign.status === "queued" ? "draft" : campaign.status,
    created_at: campaign.created_at,
    launched_at: campaign.launched_at,
    is_rohly: true,
  } as unknown as CsvCampaign));


  const toggleCampaignSelection = (id: string) => {
    setSelectedCampaigns((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllCampaigns = () => {
    const ids = campaigns.map((campaign) => campaign.id);
    setSelectedCampaigns((current) => current.length === ids.length ? [] : ids);
  };

  const handleBulkDelete = async () => {
    if (!selectedCampaigns.length) return;
    const selected = campaigns.filter((campaign) => selectedCampaigns.includes(campaign.id));
    const blocked = selected.filter((campaign) => campaign.status === "running");
    if (blocked.length) {
      toast.error("Pause or stop active campaigns before deleting them");
      return;
    }
    if (!window.confirm(`Delete ${selected.length} selected campaign${selected.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    try {
      await Promise.all(selected.map((campaign) => apiDelete<void>(`/workspace/rohly-campaigns/${campaign.id}`)));
      setSelectedCampaigns([]);
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      client.invalidateQueries({ queryKey: ["rohly-campaigns"] });
      toast.success(`${selected.length} campaign${selected.length === 1 ? "" : "s"} deleted`);
    } catch {
      toast.error("Some campaigns could not be deleted");
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      client.invalidateQueries({ queryKey: ["rohly-campaigns"] });
    }
  };

  const campaigns = ([...(query.data ?? []), ...rohlyCampaigns])
    .filter((campaign) => tab === "all" || (tab === "running" ? campaign.status === "running" : tab === "paused" ? campaign.status === "paused" : ["stopped", "completed"].includes(campaign.status)))
    .filter((campaign) => campaign.name.toLowerCase().includes(search.toLowerCase()) || campaign.source_filename.toLowerCase().includes(search.toLowerCase()));

  const counts = {
    all: campaigns.length,
    running: campaigns.filter((c) => c.status === "running").length,
    paused: campaigns.filter((c) => c.status === "paused").length,
    stopped: campaigns.filter((c) => ["stopped", "completed"].includes(c.status)).length,
  };

  return (
    <div data-testid="campaigns-page" className="-mx-4 -mt-4 min-h-[calc(100vh-5rem)] bg-white sm:-mx-6 lg:-mx-7">
      <div className="border-b border-slate-200 bg-white px-5 pt-5 lg:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[15px] font-bold tracking-[-0.01em] text-slate-900">Email Campaigns</h1>
            <p className="mt-0.5 text-xs text-slate-500">Manage and track all your outreach campaigns</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 sm:flex">
              <button className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-500">◷ Old Version</button>
              <button className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-violet-600 shadow-sm">✦ New Version</button>
            </div>
            <Button onClick={() => { window.location.href = "/campaigns/new"; }} className="h-9 gap-2 rounded-lg bg-violet-600 px-4 text-xs font-semibold hover:bg-violet-700" data-testid="new-campaign-button"><Plus size={14} /> Create Campaign</Button>
          </div>
        </div>
        <div className="mt-8 flex items-end gap-7 overflow-x-auto">
          {([
            ["all", `All Campaigns (${counts.all})`],
            ["running", `Active (${counts.running})`],
            ["paused", `Paused (${counts.paused})`],
            ["stopped", `Stopped (${counts.stopped})`],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`relative whitespace-nowrap pb-3 text-xs font-semibold ${tab === key ? "text-violet-600" : "text-slate-400 hover:text-slate-700"}`}>
              {label}{tab === key ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-600" /> : null}
            </button>
          ))}
          <span className="whitespace-nowrap pb-3 text-xs font-semibold text-slate-400">Folders (0)</span>
        </div>
      </div>

      <div className="px-5 py-5 lg:px-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Campaign filters">⌄</button>
            {selectedCampaigns.length > 0 ? <button onClick={handleBulkDelete} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100"><Trash2 size={13} className="mr-1 inline" /> Delete {selectedCampaigns.length}</button> : null}
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for campaign..." className="h-9 rounded-lg border-slate-200 pl-9 text-xs" data-testid="campaign-search-input" />
            </div>
          </div>
          <button className="hidden size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 sm:flex" aria-label="Columns">▥</button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-[0_1px_5px_rgba(15,23,42,0.04)]">
          {query.isLoading ? <SkeletonRows rows={6} /> : campaigns.length ? (
            <table className="w-full min-w-[1260px] text-left">
              <thead className="bg-slate-50/90 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-4"><input type="checkbox" aria-label="Select all campaigns" checked={campaigns.length > 0 && selectedCampaigns.length === campaigns.length} onChange={toggleAllCampaigns} /></th>
                  <th className="min-w-[360px] px-4 py-4">Campaign name</th>
                  <th className="px-4 py-4 text-violet-600">♧ Leads ⓘ</th>
                  <th className="px-4 py-4 text-violet-600">✉ Sent ⓘ</th>
                  <th className="px-4 py-4 text-fuchsia-500">▣ Opened ⓘ</th>
                  <th className="px-4 py-4 text-orange-500">✦ Clicked ⓘ</th>
                  <th className="px-4 py-4 text-cyan-600">↩ Replied ⓘ</th>
                  <th className="px-4 py-4 text-green-600">ⓢ Positive ⓘ</th>
                  <th className="px-4 py-4 text-red-500">⌁ Failed ⓘ</th>
                  <th className="px-4 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((campaign) => {
                  const totalSends = Math.max(1, campaign.total_leads * Math.max(1, campaign.steps.length));
                  const progress = Math.min(100, Math.round((campaign.emails_sent / totalSends) * 100));
                  const replyRate = campaign.emails_sent ? (campaign.replies / campaign.emails_sent) * 100 : 0;
                  return (
                    <tr key={campaign.id} className="text-xs hover:bg-slate-50/70">
                      <td className="px-4 py-5 align-middle"><input type="checkbox" aria-label={`Select ${campaign.name}`} checked={selectedCampaigns.includes(campaign.id)} onChange={() => toggleCampaignSelection(campaign.id)} /></td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#8b7cf6 ${progress * 3.6}deg, #edf0f7 0deg)` }}>
                            <div className="flex size-9 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-700">{progress}%</div>
                          </div>
                          <div className="min-w-0">
                            <Link to={`/campaigns/${campaign.id}`} className="block truncate text-[13px] font-semibold text-slate-900 hover:text-violet-600">{campaign.name}</Link>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{campaign.steps.length} sequences</span><span>•</span><span>Created {new Date(campaign.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span>•</span><StatusBadge status={campaign.status} /></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[15px] font-medium text-violet-600">{campaign.total_leads}</td>
                      <td className="px-4 py-4 text-[15px] font-medium text-violet-600">{campaign.emails_sent}</td>
                      <td className="px-4 py-4 text-slate-400">—</td>
                      <td className="px-4 py-4 text-slate-400">—</td>
                      <td className="px-4 py-4"><span className="text-[15px] font-medium text-cyan-600">{campaign.replies}</span><span className="ml-1 text-[10px] text-slate-400">{replyRate.toFixed(2)}%</span></td>
                      <td className="px-4 py-4 text-[15px] font-medium text-green-600">{campaign.positive_replies}</td>
                      <td className="px-4 py-4"><span className="text-[15px] font-medium text-red-500">{campaign.failed_emails}</span></td>
                      <td className="relative px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <Link to={`/campaigns/${campaign.id}`} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Open campaign">↗</Link>
                          <button onClick={() => setOpenMenu(openMenu === campaign.id ? null : campaign.id)} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Campaign actions"><MoreHorizontal size={15} /></button>
                        </div>
                        {openMenu === campaign.id ? <div className="absolute right-4 top-14 z-30 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Campaign status</div>
                          {campaign.status === "running" ? <button onClick={() => status.mutate({ id: campaign.id, value: "paused" })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"><Pause size={14} className="text-amber-500" /> Pause campaign</button> : campaign.status === "paused" ? <button onClick={() => status.mutate({ id: campaign.id, value: "running" })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"><Play size={14} className="text-emerald-500" /> Resume campaign</button> : null}
                          {!["stopped", "completed"].includes(campaign.status) ? <button onClick={() => status.mutate({ id: campaign.id, value: "stopped" })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"><Square size={13} className="text-red-500" /> Stop campaign</button> : null}
                          <div className="my-1 border-t border-slate-100" />
                          <button onClick={() => handleDelete(campaign)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"><Trash2 size={14} /> Delete campaign</button>
                        </div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <EmptyState title="No campaigns found" description="Create a campaign or change your search/filter." action={<Button onClick={() => { window.location.href = "/campaigns/new"; }} className="mt-4 bg-violet-600 hover:bg-violet-700">Create Campaign</Button>} />}
        </div>
        <p className="mt-3 text-[10px] text-slate-400">Opened and Clicked tracking will appear here once those events are available. The dashboard never invents engagement data.</p>
      </div>
    </div>
  );
}
