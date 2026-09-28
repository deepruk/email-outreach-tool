import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, Clock3, Filter, Inbox, MailOpen, RefreshCw, Search, Send, SendHorizontal, Star, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Reply } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/rohly/Primitives";
import { StatusBadge } from "@/components/rohly/StatusBadge";

type View = "inbox" | "unread" | "positive" | "neutral" | "negative";

export default function UnifiedInbox() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["replies"], queryFn: () => apiGet<Reply[]>("/product/replies") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("inbox");
  const rows = useMemo(() => (query.data ?? []).filter((reply) => {
    const q=search.trim().toLowerCase();
    const matchesSearch=!q || [reply.sender_name,reply.recipient_email,reply.subject,reply.snippet,reply.campaign_name].some(v=>(v||"").toLowerCase().includes(q));
    const matchesView=view==="inbox" || (view==="unread" ? !reply.read : reply.sentiment===view);
    return matchesSearch && matchesView;
  }), [query.data, search, view]);
  const selected = useMemo(() => rows.find((reply) => reply.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);
  const sync = useMutation({ mutationFn: () => apiPost<{ status: string }>("/product/replies/sync"), onSuccess: () => { client.invalidateQueries({ queryKey: ["replies"] }); toast.success("Master Inbox synchronized"); } });
  const classify = useMutation({ mutationFn: ({ id, sentiment }: { id: string; sentiment: Reply["sentiment"] }) => apiPatch<Reply>(`/product/replies/${id}`, { sentiment, read: true }), onSuccess: () => client.invalidateQueries({ queryKey: ["replies"] }) });
  const markRead = useMutation({ mutationFn: ({id,read}:{id:string;read:boolean})=>apiPatch<Reply>(`/product/replies/${id}`,{read}),onSuccess:()=>client.invalidateQueries({queryKey:["replies"]})});
  const send = useMutation({ mutationFn: () => apiPost<{ status: string }>(`/product/replies/${selected?.id}/send`, { body }), onSuccess: () => { setBody(""); client.invalidateQueries({ queryKey: ["replies"] }); toast.success("Reply sent through Gmail"); }, onError: () => toast.error("Gmail could not send this reply") });

  const navItems=[
    {id:"inbox" as const,label:"Inbox",icon:Inbox,count:query.data?.length??0},
    {id:"unread" as const,label:"Unread Replies",icon:MailOpen,count:(query.data??[]).filter(x=>!x.read).length},
    {id:"positive" as const,label:"Positive",icon:Star,count:(query.data??[]).filter(x=>x.sentiment==="positive").length},
    {id:"neutral" as const,label:"Neutral",icon:Clock3,count:(query.data??[]).filter(x=>x.sentiment==="neutral").length},
    {id:"negative" as const,label:"Negative",icon:Archive,count:(query.data??[]).filter(x=>x.sentiment==="negative").length},
  ];

  return <div className="-m-4 min-h-[calc(100vh-3.5rem)] bg-white sm:-m-5 lg:-m-6 lg:ml-[-24px]" data-testid="master-inbox-page">
    <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-[220px_360px_minmax(0,1fr)]">
      <aside className="hidden border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-100 px-5 py-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">For me</p></div>
        <nav className="p-2">{navItems.map(item=><button key={item.id} onClick={()=>setView(item.id)} className={`rohly-interactive flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${view===item.id?"bg-indigo-50 font-semibold text-indigo-800":"text-slate-600 hover:bg-slate-50"}`}><item.icon size={16}/><span className="flex-1">{item.label}</span>{item.count?<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{item.count}</span>:null}</button>)}</nav>
        <div className="mx-3 mt-3 border-t border-slate-100 pt-4"><p className="px-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Actions</p><button onClick={()=>sync.mutate()} className="rohly-interactive mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw size={16} className={sync.isPending?"animate-spin":""}/>Sync replies</button><a href="/inboxes" className="rohly-interactive flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><SendHorizontal size={16}/>Email accounts</a></div>
      </aside>

      <section className="border-r border-slate-200 bg-white">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-300 focus-within:bg-white"><Search size={15} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search lead" className="w-full bg-transparent text-sm outline-none"/></div><button className="rohly-interactive rounded-lg border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" title="Filter current view"><Filter size={16}/></button></div><div className="mt-4 flex items-center justify-between"><div><h1 className="text-lg font-bold tracking-[-.02em]">Master Inbox</h1><p className="mt-1 text-[10px] text-slate-400">Campaign replies across connected inboxes</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700">Auto-sync enabled</span></div></div>
        <div className="max-h-[calc(100vh-9.5rem)] overflow-y-auto">{rows.length?rows.map(reply=><button key={reply.id} onClick={()=>{setSelectedId(reply.id); if(!reply.read) markRead.mutate({id:reply.id,read:true});}} className={`w-full border-b border-slate-100 px-5 py-4 text-left transition-all hover:bg-slate-50 ${selected?.id===reply.id?"bg-indigo-50/70 shadow-[inset_3px_0_0_#6366f1]":""}`}><div className="flex items-start gap-3"><span className={`mt-1 size-2 shrink-0 rounded-full ${reply.read?"bg-slate-200":"bg-indigo-500"}`}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-slate-800">{reply.sender_name||reply.recipient_email}</p><span className="shrink-0 text-[10px] text-slate-400">{formatInboxTime(reply.received_at)}</span></div><p className="mt-0.5 truncate text-xs text-slate-500">{reply.recipient_email}</p><p className="mt-3 line-clamp-1 text-xs text-slate-500">{reply.snippet||reply.subject}</p><div className="mt-3 flex items-center gap-2"><span className="max-w-full truncate rounded-md border border-indigo-100 bg-indigo-50/50 px-2 py-1 text-[10px] font-medium text-indigo-600">{reply.campaign_name}</span>{reply.sentiment!=="unclassified"?<StatusBadge status={reply.sentiment}/>:null}</div></div></div></button>):<div className="p-10 text-center text-sm text-slate-400">No replies match this view.</div>}</div>
      </section>

      <main className="min-w-0 bg-slate-50/60">{selected?<div className="flex min-h-[calc(100vh-3.5rem)] flex-col"><header className="border-b border-slate-200 bg-white px-6 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">{selected.sender_name||selected.recipient_email}</p><p className="mt-1 text-xs text-slate-500">{selected.recipient_email} · {selected.campaign_name}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={()=>markRead.mutate({id:selected.id,read:!selected.read})}><MailOpen size={13}/>{selected.read?"Mark unread":"Mark read"}</Button><Button variant="outline" size="sm" onClick={()=>sync.mutate()}><RefreshCw size={13}/>Sync</Button></div></div></header><div className="flex-1 overflow-y-auto p-6"><div className="mx-auto max-w-3xl"><div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><p className="text-xs text-slate-400">Subject</p><p className="mt-1 text-sm font-semibold">{selected.subject}</p></div><div className="p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.snippet}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Classify</span>{(["positive","neutral","negative"] as const).map(value=><button key={value} onClick={()=>classify.mutate({id:selected.id,sentiment:value})} className={`rohly-interactive rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${selected.sentiment===value?"border-indigo-300 bg-indigo-50 text-indigo-700":"border-slate-200 bg-white text-slate-500 hover:border-indigo-200"}`}><CheckCircle2 size={12} className="mr-1 inline"/>{value}</button>)}</div></div></div><div className="border-t border-slate-200 bg-white p-4"><div className="mx-auto max-w-3xl"><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={`Reply to ${selected.sender_name||selected.recipient_email}…`} className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"/><div className="mt-2 flex items-center justify-between"><p className="text-[10px] text-slate-400">Reply will be sent from {selected.inbox_email}</p><Button onClick={()=>send.mutate()} disabled={!body.trim()||send.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700"><Send size={13}/>Send reply</Button></div></div></div></div>:<div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-8"><EmptyState title="Your master inbox" description="Select a lead reply to open the conversation and respond." action={<Button onClick={()=>sync.mutate()} variant="outline"><RefreshCw size={14}/>Sync replies</Button>}/></div>}</main>
    </div>
  </div>;
}

function formatInboxTime(value:string){
  const date=new Date(value); const now=new Date();
  if(date.toDateString()===now.toDateString()) return date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  return date.toLocaleDateString([],{month:"short",day:"numeric"});
}
