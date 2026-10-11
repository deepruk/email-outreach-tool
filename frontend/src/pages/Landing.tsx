import { ArrowRight, Activity, BarChart3, Flame, Mail, Reply, ShieldCheck, Upload, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  { icon: Zap, tone: "text-orange-500", title: "Campaign engine", body: "Draft, launch, pause and schedule campaigns with personalized messages mapped to every row of your CSV.", note: "draft → launch → schedule" },
  { icon: ShieldCheck, tone: "text-emerald-400", title: "Inbox health, on instruments", body: "See connected mailboxes, daily sending limits and reply-tracking status before problems cost you.", bars: true },
  { icon: Reply, tone: "text-cyan-400", title: "Reply radar", body: "Bring the conversations that matter into focus, so your team can prioritize replies instead of hunting for them.", pills: true },
  { icon: Upload, tone: "text-orange-500", title: "CSV in, pipeline out", body: "Import your lead list, map columns once, and prepare personalized outreach for the next launch window.", note: "leads.csv  →  mapped and ready" },
  { icon: BarChart3, tone: "text-orange-500", title: "Analytics that answer back", body: "Track sends, replies and bounces over any window. Understand the funnel at a glance.", chart: true },
  { icon: Flame, tone: "text-cyan-400", title: "Warm-up autopilot", body: "Keep mailbox ramp-up and sending limits visible in one place as you grow your outreach.", note: "mailbox health  ·  monitored" },
];

export default function Landing() {
  return <main className="rohly-landing min-h-screen overflow-hidden text-slate-100">
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <header className="relative z-10 mt-4 flex h-16 items-center justify-between rounded-2xl border border-slate-700/70 bg-slate-950/75 px-5 shadow-2xl backdrop-blur-xl sm:px-7">
        <Link to="/" className="flex items-center gap-3 text-lg font-bold tracking-tight"><span className="flex size-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-orange-500"><Activity size={17}/></span>Rohly</Link>
        <nav className="hidden items-center gap-8 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 md:flex"><a href="#system" className="hover:text-white">Product</a><a href="#telemetry" className="hover:text-white">Telemetry</a><a href="#pricing" className="hover:text-white">Pricing</a></nav>
        <div className="flex items-center gap-4"><Link to="/login" className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 sm:block">Sign in</Link><Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-xs font-bold text-slate-950 transition hover:bg-orange-400">Launch app <ArrowRight size={15}/></Link></div>
      </header>

      <section id="telemetry" className="relative grid min-h-[620px] items-center gap-14 py-16 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
        <div className="pointer-events-none absolute -left-36 top-12 h-96 w-96 rounded-full bg-orange-600/10 blur-[100px]"/>
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.3em] text-orange-500"><span className="size-1.5 rounded-full bg-orange-500"/> Outbound command center</span>
          <h1 className="mt-7 max-w-2xl font-heading text-5xl font-extrabold leading-[.99] tracking-[-.055em] sm:text-6xl lg:text-[76px]">Your outbound,<br/>commanded.<br/><span className="text-orange-500">Not babysat.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">Rohly runs personalized campaigns across your inboxes, keeps deliverability in view, and brings every reply that matters into one precise console.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link to="/login" className="inline-flex items-center gap-3 rounded-full bg-orange-500 px-6 py-4 text-sm font-bold text-slate-950 transition hover:bg-orange-400">Take the console <ArrowRight size={16}/></Link><a href="#system" className="rounded-full border border-slate-700 px-6 py-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500">See the system</a></div>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4"><div><p className="font-heading text-3xl font-bold">One</p><p className="mt-1 text-[9px] uppercase tracking-[.24em] text-slate-500">Unified console</p></div><div><p className="font-heading text-3xl font-bold">24/7</p><p className="mt-1 text-[9px] uppercase tracking-[.24em] text-slate-500">Campaign visibility</p></div><div><p className="font-heading text-3xl font-bold">CSV</p><p className="mt-1 text-[9px] uppercase tracking-[.24em] text-slate-500">Personalized sends</p></div></div>
        </div>
        <div className="relative z-10 mx-auto w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.25em] text-slate-400"><span className="size-2 rounded-full bg-orange-500"/> Live telemetry</div><span className="text-[10px] font-semibold text-cyan-400">OUTBOUND OVERVIEW</span></div>
          <div className="mt-5 grid grid-cols-3 gap-3">{[{label:"SENT",value:"—"},{label:"REPLIES",value:"—"},{label:"REPLY RATE",value:"—"}].map(m=><div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><p className="text-[9px] tracking-[.2em] text-slate-500">{m.label}</p><p className="mt-2 text-xl font-bold text-slate-100">{m.value}</p></div>)}</div>
          <div className="mt-7 flex h-28 items-end gap-2 border-b border-slate-800 pb-3">{[34,48,25,58,44,70,51,83,63,91,75,96].map((h,i)=><span key={i} style={{height:h+"%"}} className={`flex-1 rounded-t-md ${i>8?"bg-orange-500":"bg-orange-500/35"}`}/>)}</div>
          <div className="mt-5 flex flex-wrap justify-between gap-3 text-[9px] font-semibold uppercase tracking-[.18em] text-slate-500"><span><i className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400"/>Inbox health</span><span><i className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400"/>Deliverability</span><span><i className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400"/>Reply radar</span></div>
          <p className="mt-5 border-t border-slate-800 pt-4 text-[10px] leading-5 text-slate-500">Illustrative preview · your real campaign metrics appear after you sign in.</p>
        </div>
      </section>
    </div>

    <div className="border-y border-slate-800/80 bg-slate-950/60 py-5"><div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-9 gap-y-3 px-5 text-xs font-medium text-slate-400 sm:justify-between sm:px-8"><span>✳ Personalized outreach</span><span>✳ Inbox health</span><span>✳ Reply radar</span><span>✳ CSV imports</span><span>✳ Sending controls</span></div></div>

    <section id="system" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <p className="text-[10px] font-bold uppercase tracking-[.32em] text-orange-500">The system</p><h2 className="mt-5 max-w-2xl font-heading text-4xl font-extrabold leading-tight tracking-[-.045em] sm:text-5xl">Six instruments. One console. Zero guesswork.</h2>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(({icon:Icon,tone,title,body,note,bars,pills,chart})=><article key={title} className="min-h-64 rounded-2xl border border-slate-800 bg-slate-950/65 p-6 transition hover:border-slate-700"><Icon className={tone} size={21}/><h3 className="mt-6 text-base font-bold text-slate-100">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>{note&&<p className="mt-5 rounded-lg border border-dashed border-slate-800 px-3 py-3 font-mono text-[10px] text-slate-400"><span className="text-orange-500">●</span> {note}</p>}{bars&&<div className="mt-6 space-y-2">{[82,61,37].map((w,i)=><div key={i} className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div style={{width:w+"%"}} className="h-full rounded-full bg-emerald-400"/></div>)}</div>}{pills&&<div className="mt-5 flex gap-2">{["POSITIVE","NEUTRAL","FOLLOW-UP"].map((p,i)=><span key={p} className={`rounded-full border px-3 py-1 text-[9px] tracking-wider ${i===0?"border-emerald-500/50 text-emerald-400":i===1?"border-cyan-500/50 text-cyan-400":"border-slate-700 text-slate-500"}`}>{p}</span>)}</div>}{chart&&<div className="mt-5 flex h-9 items-end gap-1.5">{[35,55,43,72,60,84,69,100].map((h,i)=><span key={i} style={{height:h+"%"}} className="flex-1 rounded-t bg-gradient-to-t from-orange-700/70 to-orange-500"/></div>}</article>)}</div>
    </section>
    <section id="pricing" className="mx-auto max-w-6xl px-5 pb-20 sm:px-8"><div className="flex flex-col justify-between gap-6 rounded-2xl border border-slate-800 bg-slate-950/75 p-8 sm:flex-row sm:items-center sm:p-10"><div><p className="text-[10px] font-bold uppercase tracking-[.3em] text-orange-500">Ready when you are</p><h2 className="mt-3 font-heading text-3xl font-bold tracking-tight">Run outbound with more control.</h2><p className="mt-2 text-sm text-slate-400">Bring your inboxes and campaigns into one workspace.</p></div><Link to="/login" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-4 text-sm font-bold text-slate-950 hover:bg-orange-400">Launch Rohly <ArrowRight size={16}/></Link></div></section>
    <footer className="border-t border-slate-800/80 py-7 text-center text-xs text-slate-600">© {new Date().getFullYear()} Rohly · Outbound command center</footer>
  </main>;
}
