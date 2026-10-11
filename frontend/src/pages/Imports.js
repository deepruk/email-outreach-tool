import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { Reveal } from '../components/motion';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const split = (line) => line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  const rows = lines.slice(1, 26).map(split);
  return { headers, rows };
}

export default function Imports() {
  const [history, setHistory] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const loadHistory = () => api.get('/imports').then((r) => setHistory(r.data)).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const accept = (f) => {
    if (!f || !f.name.toLowerCase().endsWith('.csv')) {
      toast.error('Drop a .csv file');
      return;
    }
    setFile(f);
    f.text().then((t) => setPreview({ ...parseCsv(t), name: f.name }));
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/imports', fd);
      toast.success(`${r.data.imported} leads imported from ${r.data.filename}`);
      setFile(null);
      setPreview(null);
      loadHistory();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="imports-page">
      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold tracking-tight">Imports</h1>
        <p className="text-sm text-slate-500 mt-1">Drop a CSV, map it once, arm the list.</p>
      </div>

      <Reveal y={12}>
        <div
          data-testid="csv-upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed py-16 text-center transition-signal ${drag ? 'border-signal bg-signal/10' : 'border-line bg-obsidian/60 hover:border-slate-600'}`}
        >
          <UploadCloud size={36} className="mx-auto text-signal mb-4" />
          <p className="font-display text-lg font-semibold text-slate-200">{drag ? 'Release to load' : 'Drag your CSV here'}</p>
          <p className="text-sm text-slate-500 mt-2">or <span className="text-signal underline">browse files</span> — expects an <span className="font-mono text-xs">email</span> column</p>
          <input ref={inputRef} type="file" accept=".csv" className="hidden" data-testid="csv-file-input" onChange={(e) => accept(e.target.files[0])} />
        </div>
      </Reveal>

      {preview && (
        <Reveal y={10}>
          <div className="mt-4 rounded-2xl border border-signal/40 bg-obsidian p-6" data-testid="csv-preview-card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={18} className="text-signal" />
                <div>
                  <div className="font-semibold text-slate-100 text-sm">{preview.name}</div>
                  <div className="font-mono text-[10px] text-slate-500">columns: {preview.headers.join(' · ')}</div>
                </div>
              </div>
              <button data-testid="csv-import-confirm-btn" onClick={upload} disabled={busy} className="rounded-full bg-signal px-6 py-2.5 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-50 transition-signal signal-glow">
                {busy ? 'Importing…' : 'Confirm import'}
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs" data-testid="csv-preview-table">
                <thead>
                  <tr className="bg-panel/60 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                    {preview.headers.slice(0, 5).map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-line/50">
                      {r.slice(0, 5).map((cell, j) => <td key={j} className="px-4 py-2 text-slate-400 truncate max-w-40">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-mono text-[10px] text-slate-600 mt-3">showing first 5 rows of preview</p>
          </div>
        </Reveal>
      )}

      <Reveal y={12} delay={0.08}>
        <div className="mt-6 rounded-2xl border border-line bg-obsidian p-6" data-testid="import-history-card">
          <h2 className="font-display text-lg font-semibold mb-5">Import history</h2>
          {history.length === 0 && <p className="text-sm text-slate-500" data-testid="import-history-empty">No imports yet.</p>}
          <div className="space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2.5 border-b border-line/40 last:border-0" data-testid={`import-history-row-${h.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 size={15} className="text-health shrink-0" />
                  <span className="text-sm text-slate-200 truncate">{h.filename}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-500 shrink-0">{h.row_count} leads · {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-5">Need a home for these leads? <Link to="/app/campaigns/new" className="text-signal hover:underline">Start a campaign</Link>.</p>
        </div>
      </Reveal>
    </div>
  );
}
