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
  const query = useQuery({ queryKey: ["csv-campaigns"], queryFn: () => apiGet<CsvCampaign[]>("/csv/campaigns") });

  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "running" | "paused" | "stopped" }) =>
      apiPatch<CsvCampaign>(`/csv/campaigns/${id}/status`, { status: value }),
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      toast.success(`Campaign ${variables.value}`);
    },
    onError: () => toast.error("Unable to update campaign status"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/csv/campaigns/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["csv-campaigns"] });
      toast.success("Campaign deleted");
    },
    onError: () => toast.error("Unable to delete campaign"),
  });

  const handleDelete = (campaign: CsvCampaign) => {
    if (campaign.status === "running") {
      toast.error("Pause or stop the campaign before deleting it");
      return;
    }
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"? This will remove its scheduled emails and cannot be undone.`);
    if (confirmed) remove.mutate(campaign.id);
  };

  return <div data-testid="campaigns-page"><PageHeader eyebrow="Outbound" title="Campaigns" description="Operate personalized sequences, monitor performance, and control delivery from one table." actions={<Button onClick={() => { window.location.href = "/campaigns/new"; }} className="gap-2 bg-blue-700 hover:bg-blue-800" data-testid="new-campaign-button"><Plus size={14} /> Create campaign</Button>} /><Surface testId="campaign-list"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div className="relative w-full max-w-xs"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><Input placeholder="Search campaigns" className="h-9 pl-9" data-testid="campaign-search-input" /></div><div className="text-xs text-slate-500">{query.data?.length ?? 0} campaigns</div></div>{query.isLoading ? <SkeletonRows rows={6} /> : query.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Replies</th><th className="px-4 py-3">Positive</th><th className="px-4 py-3">Reply rate</th><th className="px-4 py-3">Created</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{query.data.map((campaign) => <tr key={campaign.id} className="text-xs hover:bg-slate-50/70" data-testid={`campaign-row-${campaign.id}`}><td className="px-4 py-3.5"><Link to={`/campaigns/${campaign.id}`} className="font-semibold text-slate-900 hover:text-blue-700">{campaign.name}</Link></td><td className="max-w-44 truncate px-4 py-3.5 text-slate-500">{campaign.source_filename}</td><td className="px-4 py-3.5"><StatusBadge status={campaign.status} /></td><td className="px-4 py-3.5">{campaign.total_leads}</td><td className="px-4 py-3.5">{campaign.emails_sent}</td><td className="px-4 py-3.5">{campaign.replies}</td><td className="px-4 py-3.5">{campaign.positive_replies}</td><td className="px-4 py-3.5">{campaign.emails_sent ? ((campaign.replies / campaign.emails_sent) * 100).toFixed(1) : "0.0"}%</td><td className="px-4 py-3.5 text-slate-500">{new Date(campaign.created_at).toLocaleDateString()}</td><td className="px-4 py-3.5"><div className="flex justify-end gap-1">{campaign.status === "running" ? <button onClick={() => status.mutate({ id: campaign.id, value: "paused" })} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Pause campaign"><Pause size={14} /></button> : campaign.status === "paused" ? <button onClick={() => status.mutate({ id: campaign.id, value: "running" })} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Resume campaign"><Play size={14} /></button> : null}{!["stopped", "completed"].includes(campaign.status) ? <button onClick={() => status.mutate({ id: campaign.id, value: "stopped" })} className="rounded-md p-2 text-red-500 hover:bg-red-50" aria-label="Stop campaign"><Square size={13} /></button> : null}{campaign.status !== "running" ? <button onClick={() => handleDelete(campaign)} disabled={remove.isPending} className="rounded-md p-2 text-red-500 hover:bg-red-50 disabled:opacity-50" aria-label="Delete campaign" title="Delete campaign"><Trash2 size={14} /></button> : null}<Link to={`/campaigns/${campaign.id}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Open campaign"><MoreHorizontal size={15} /></Link></div></td></tr>)}</tbody></table></div> : <EmptyState title="No campaigns yet" description="Create your first outbound campaign using a personalized CSV or Rohly Template." action={<Button onClick={() => { window.location.href = "/campaigns/new"; }} className="mt-4 bg-blue-700">Create campaign</Button>} />}</Surface></div>;
}
