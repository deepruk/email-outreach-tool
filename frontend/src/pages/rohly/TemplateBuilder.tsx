import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Braces, Save } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import type { Template } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/rohly/Primitives";

const variables = ["{{first_name}}", "{{email}}", "{{company}}", "{{job_title}}", "{{industry}}", "{{city}}", "{{country}}"];

export default function TemplateBuilder() {
  const [name, setName] = useState("New Rohly template");
  const [subject, setSubject] = useState("Quick idea for {{company}}");
  const [body, setBody] = useState("Hi {{first_name}},\n\n");
  const navigate = useNavigate();
  const save = useMutation({ mutationFn: () => apiPost<Template>("/workspace/templates", { name, subject, body }), onSuccess: () => { toast.success("Rohly template saved"); setTimeout(() => navigate("/campaigns"), 500); } });
  const preview = (value: string) => value.replaceAll("{{first_name}}", "John").replaceAll("{{company}}", "ABC Corp").replaceAll("{{email}}", "john@abc.com").replaceAll("{{job_title}}", "Security Lead").replaceAll("{{industry}}", "Cybersecurity").replaceAll("{{city}}", "New York").replaceAll("{{country}}", "United States");
  return <div data-testid="template-builder-page"><Link to="/campaigns/new" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><ArrowLeft size={13} /> Campaign source</Link><PageHeader eyebrow="Rohly Template" title="Build reusable sequence copy" description="Create a clean message with personalization variables and preview it against a sample lead." actions={<Button onClick={() => save.mutate()} disabled={!name || !subject || !body || save.isPending} className="gap-2 bg-blue-700 hover:bg-blue-800"><Save size={14} /> Save template</Button>} /><div className="grid gap-4 xl:grid-cols-2"><Surface className="p-5" testId="template-editor"><label className="block text-xs font-semibold">Template name<Input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10" /></label><label className="mt-5 block text-xs font-semibold">Subject<Input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 h-10" /></label><label className="mt-5 block text-xs font-semibold">Body<textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-2 min-h-72 w-full rounded-md border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label><div className="mt-3"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><Braces size={12} /> Personalize</p><div className="mt-2 flex flex-wrap gap-2">{variables.map((variable) => <button key={variable} onClick={() => setBody((value) => `${value}${variable}`)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700">{variable}</button>)}</div></div></Surface><Surface className="p-5" testId="template-preview"><div className="border-b border-slate-200 pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Preview as lead</p><select className="mt-2 h-9 rounded-md border border-slate-200 bg-white px-3 text-xs"><option>John · ABC Corp</option></select></div><div className="pt-5"><p className="text-[10px] uppercase tracking-wide text-slate-400">Subject</p><p className="mt-2 text-sm font-semibold">{preview(subject)}</p><div className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{preview(body)}</div></div></Surface></div></div>;
}