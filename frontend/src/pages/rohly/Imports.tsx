import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet } from "@/lib/api";
import type { CsvSourceSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SkeletonRows, Surface } from "@/components/rohly/Primitives";
import { toast } from "sonner";

export default function Imports() {
  const query = useQuery({ queryKey: ["csv-sources"], queryFn: () => apiGet<CsvSourceSummary[]>("/csv/sources") });

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
  return <div data-testid="imports-page"><PageHeader eyebrow="Data sources" title="CSV Imports" description="Immutable source snapshots for exact, lead-specific campaign messaging." actions={<Button onClick={() => { window.location.href = "/campaigns/new"; }} className="gap-2 bg-blue-700 hover:bg-blue-800"><Plus size={14} /> Import CSV</Button>} /><Surface testId="imports-table">{query.isLoading ? <SkeletonRows rows={6} /> : query.data?.length ? <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Columns</th><th className="px-4 py-3">Uploaded</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{query.data.map((source) => <tr key={source.id} className="text-xs hover:bg-slate-50"><td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><FileSpreadsheet size={14} /></span><span className="font-semibold text-slate-900">{source.filename}</span></div></td><td className="px-4 py-3.5">{source.row_count}</td><td className="px-4 py-3.5"><p className="max-w-xl truncate text-slate-500">{source.columns.join(" · ")}</p></td><td className="px-4 py-3.5 text-slate-500">{new Date(source.uploaded_at).toLocaleString()}</td><td className="px-4 py-3.5 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => deleteSource(source)} className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={13} /> Delete</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No CSV imports" description="Import a personalized lead file while creating your first campaign." />}</Surface></div>;
}