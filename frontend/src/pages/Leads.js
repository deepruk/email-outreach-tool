import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, Download, Trash2, FolderInput, X, ArrowUpDown } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { Reveal } from '../components/motion';
import StatusPill from '../components/StatusPill';

export default function Leads() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [sort, setSort] = useState({ field: 'created_at', dir: -1 });
  const pageSize = 25;

  const load = () => {
    api
      .get(`/leads?page=${page}&page_size=${pageSize}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`)
      .then((r) => { setData(r.data); setSelected([]); })
      .catch((e) => toast.error(apiError(e)));
  };

  useEffect(() => { api.get('/campaigns').then((r) => setCampaigns(r.data.items)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [page, q, status]);

  const items = data?.items ? [...data.items].sort((a, b) => {
    const va = (a[sort.field] || '').toString().toLowerCase();
    const vb = (b[sort.field] || '').toString().toLowerCase();
    return va < vb ? sort.dir : va > vb ? -sort.dir : 0;
  }) : [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = items.length > 0 && selected.length === items.length;

  const toggleAll = () => setSelected(allSelected ? [] : items.map((l) => l.id));
  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const bulk = async (action, extra = {}) => {
    try {
      const r = await api.post('/leads/bulk', { ids: selected, action, ...extra });
      toast.success(`${r.data.affected} lead${r.data.affected === 1 ? '' : 's'} updated`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const removeOne = async (l) => {
    if (!window.confirm(`Remove ${l.email}?`)) return;
    await api.post('/leads/bulk', { ids: [l.id], action: 'delete' });
    toast.success('Lead removed');
    load();
  };

  const exportCsv = async () => {
    try {
      const r = await api.get('/leads/export', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rohly-leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const SortTh = ({ label, field }) => (
    <th className="pb-3 pr-4 font-medium">
      <button data-testid={`leads-sort-${field}`} onClick={() => setSort({ field, dir: sort.field === field ? -sort.dir : 1 })} className={`inline-flex items-center gap-1 hover:text-slate-300 transition-signal ${sort.field === field ? 'text-signal' : ''}`}>
        {label} <ArrowUpDown size={10} />
      </button>
    </th>
  );

  return (
    <div data-testid="leads-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              data-testid="lead-search-input"
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
              placeholder="Search name, company, email…"
              className="w-64 rounded-full bg-panel border border-line pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal"
            />
          </div>
          <select data-testid="lead-status-filter" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-full bg-panel border border-line px-4 py-2.5 text-sm text-slate-300 focus:border-signal transition-signal">
            <option value="">All status</option>
            {['new', 'contacted', 'replied', 'positive', 'bounced', 'unsubscribed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button data-testid="leads-export-btn" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[13px] font-semibold text-slate-300 hover:border-signal/50 hover:text-signal transition-signal">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-signal/40 bg-signal/10 px-4 py-3" data-testid="leads-bulk-bar">
          <span className="text-sm font-semibold text-slate-100" data-testid="leads-bulk-count">{selected.length} selected</span>
          <select data-testid="leads-bulk-assign-select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="rounded-full bg-panel border border-line px-3.5 py-2 text-xs text-slate-300">
            <option value="">Assign to campaign…</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button data-testid="leads-bulk-assign-btn" disabled={!assignTo} onClick={() => bulk('assign_campaign', { campaign_id: assignTo })} className="inline-flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 text-xs font-bold text-ink disabled:opacity-40 hover:brightness-110 transition-signal">
            <FolderInput size={13} /> Assign
          </button>
          <button data-testid="leads-bulk-delete-btn" onClick={() => { if (window.confirm(`Delete ${selected.length} leads?`)) bulk('delete'); }} className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 text-red-300 px-4 py-2 text-xs font-semibold hover:bg-red-500/10 transition-signal">
            <Trash2 size={13} /> Delete
          </button>
          <button onClick={() => setSelected([])} className="ml-auto text-slate-400 hover:text-slate-200 transition-signal"><X size={16} /></button>
        </div>
      )}

      <Reveal y={12}>
        <div className="rounded-xl border border-line bg-obsidian overflow-hidden" data-testid="leads-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="leads-table">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-line bg-panel/40">
                  <th className="pl-5 pr-2 py-3.5">
                    <input type="checkbox" data-testid="leads-select-all" checked={allSelected} onChange={toggleAll} className="size-3.5 accent-[#FF5A1F]" />
                  </th>
                  <SortTh label="Lead" field="first_name" />
                  <th className="px-5 py-3.5 font-medium"><SortTh label="Company" field="company" /></th>
                  <th className="px-5 py-3.5 font-medium"><SortTh label="Title" field="title" /></th>
                  <th className="px-5 py-3.5 font-medium"><SortTh label="Status" field="status" /></th>
                  <th className="px-5 py-3.5 font-medium"><SortTh label="Added" field="created_at" /></th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {!data && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="h-6 rounded bg-panel/60 animate-pulse" /></td></tr>
                ))}
                {data?.items.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-500" data-testid="leads-empty-state">No leads match — clear the search or import a CSV.</td></tr>
                )}
                {items.map((l) => (
                  <tr key={l.id} data-testid={`lead-row-${l.id}`} className={`border-b border-line/40 last:border-0 hover:bg-panel/50 transition-signal ${selected.includes(l.id) ? 'bg-signal/5' : ''}`}>
                    <td className="pl-5 pr-2 py-3.5">
                      <input type="checkbox" data-testid={`lead-select-${l.id}`} checked={selected.includes(l.id)} onChange={() => toggle(l.id)} className="size-3.5 accent-[#FF5A1F]" />
                    </td>
                    <td className="py-3.5 pr-4">
                      <div className="font-medium text-slate-200">{l.first_name} {l.last_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{l.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{l.company}</td>
                    <td className="px-5 py-3.5 text-slate-400">{l.title}</td>
                    <td className="px-5 py-3.5"><StatusPill status={l.status} /></td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">{new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button data-testid={`lead-delete-${l.id}`} onClick={() => removeOne(l)} className="text-slate-600 hover:text-red-400 transition-signal"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-4 border-t border-line" data-testid="leads-pagination">
            <span className="font-mono text-[11px] text-slate-500" data-testid="leads-total-label">{total.toLocaleString()} contacts · page {page} / {pages}</span>
            <div className="flex gap-2">
              <button data-testid="leads-prev-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full border border-line px-4 py-1.5 text-xs text-slate-300 disabled:opacity-30 hover:border-slate-500 transition-signal">Prev</button>
              <button data-testid="leads-next-page-btn" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-full border border-line px-4 py-1.5 text-xs text-slate-300 disabled:opacity-30 hover:border-slate-500 transition-signal">Next</button>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
