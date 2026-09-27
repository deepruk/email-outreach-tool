import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet } from "@/lib/api";
import type { CsvSourceSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { toast } from "sonner";

export default function Imports() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const query = useQuery({ queryKey: ["csv-sources"], queryFn: () => apiGet<CsvSourceSummary[]>("/csv/sources") });
  const sources = query.data ?? [];
  const allSelected = sources.length > 0 && selectedIds.length === sources.length;
  const selectedSources = useMemo(() => sources.filter((source) => selectedIds.includes(source.id)), [sources, selectedIds]);

  const toggleSource = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : sources.map((source) => source.id));
  };

  const deleteSelected = async () => {
    if (!selectedSources.length) return;
    const label = selectedSources.length === sources.length ? "all CSV imports" : selectedSources.length + " selected CSV imports";
    if (!window.confirm("Delete " + label + "? This removes the uploaded CSV snapshots only; contacts already added to Rohly are not deleted.")) return;
    const results = await Promise.allSettled(selectedSources.map((source) => apiDelete("/csv/sources/" + source.id)));
    const deleted = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - deleted;
    setSelectedIds([]);
    await query.refetch();
    if (failed) {
      toast.error(deleted + " CSV import" + (deleted === 1 ? "" : "s") + " deleted; " + failed + " could not be deleted because they may be used by a campaign");
    } else {
      toast.success(deleted + " CSV import" + (deleted === 1 ? "" : "s") + " deleted");
    }
  };

  const deleteSource = async (source: CsvSourceSummary) => {
    if (!window.confirm(`Delete "${source.filename}" from CSV imports? This removes the uploaded CSV snapshot only; contacts already added to Rohly are not deleted.`)) return;
    try {
      await apiDelete(`/csv/sources/${source.id}`);
      await query.refetch();
      toast.success(`${source.filename} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this CSV");
    }
  };
  return <div data-testid="imports-page"><PageHeader eyebrow="Data sources" title="CSV Imports" description="Immutable source snapshots for exact, lead-specific campaign messaging." actions={<div className="flex items-center gap-2">{selectedSources.length > 0 && <Button type="button" variant="outline" onClick={deleteSelected} className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /> Delete selected ({selectedSources.length})</Button>}<Button onClick={() => { window.location.href = "/campaigns/new"; }} className="gap-2 bg-blue-700 hover:bg-blue-800"><Plus size={14} /> Import CSV</Button></div>} /><Surface testId="imports-table">{query.isLoading ? <SkeletonRows rows={6} /> : query.data?.length ? <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select all CSV imports" checked={allSelected} onChange={toggleAll} /></th><th className="px-4 py-3">File</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Columns</th><th className="px-4 py-3">Uploaded</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{sources.map((source) => <tr key={source.id} className="text-xs hover:bg-slate-50"><td className="px-4 py-3.5"><input type="checkbox" aria-label={"Select " + source.filename} checked={selectedIds.includes(source.id)} onChange={() => toggleSource(source.id)} /></td><td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><FileSpreadsheet size={14} /></span><span className="font-semibold text-slate-900">{source.filename}</span></div></td><td className="px-4 py-3.5">{source.row_count}</td><td className="px-4 py-3.5"><p className="max-w-xl truncate text-slate-500">{source.columns.join(" · ")}</p></td><td className="px-4 py-3.5 text-slate-500">{new Date(source.uploaded_at).toLocaleString()}</td><td className="px-4 py-3.5 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => deleteSource(source)} className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={13} /> Delete</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No CSV imports" description="Import a personalized lead file while creating your first campaign." />}</Surface></div>;
}