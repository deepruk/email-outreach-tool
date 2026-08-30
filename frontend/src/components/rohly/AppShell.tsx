import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  CreditCard,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Search,
  Send,
  Settings,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { SearchResult, UserPublic } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/inbox", label: "Unified Inbox", icon: Inbox },
  { to: "/inboxes", label: "Inboxes", icon: Mail },
  { to: "/warm-up", label: "Inbox Health", icon: ShieldCheck },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/imports", label: "CSV Imports", icon: FileSpreadsheet },
  { to: "/billing", label: "Billing", icon: CreditCard },
];

export function RequireAuth() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<UserPublic | null>("/auth/session"), retry: false });
  const location = useLocation();
  if (me.isLoading) return <div className="flex min-h-svh items-center justify-center bg-slate-50"><div className="size-7 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" data-testid="auth-loading" /></div>;
  if (me.isError || !me.data) return <LoginRedirect next={location.pathname} />;
  return <AppShell user={me.data} />;
}

function LoginRedirect({ next }: { next: string }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true }); }, [navigate, next]);
  return null;
}

function AppShell({ user }: { user: UserPublic }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("rohly-sidebar-collapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => { localStorage.setItem("rohly-sidebar-collapsed", String(collapsed)); }, [collapsed]);
  useEffect(() => {
    const button = document.querySelector<HTMLElement>('[data-testid="notifications-button"]');
    const openHealth = () => navigate("/warm-up");
    button?.addEventListener("click", openHealth);
    return () => button?.removeEventListener("click", openHealth);
  }, [navigate]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (!typing && event.key.toLowerCase() === "n") navigate("/campaigns/new");
      if (event.key === "Escape") { setSearchOpen(false); setProfileOpen(false); setHelpOpen(false); setMobileOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
  const logout = useMutation({ mutationFn: () => apiPost<void>("/auth/logout"), onSuccess: () => { queryClient.clear(); navigate("/login"); } });
  const current = nav.find((item) => item.to === location.pathname)?.label ?? (location.pathname.startsWith("/campaigns/") ? "Campaign" : "Rohly");
  const sidebar = <div className="flex h-full flex-col"><Link to="/" className={`flex h-16 items-center border-b border-slate-200 ${collapsed ? "justify-center" : "px-4"}`} data-testid="rohly-brand"><div className="flex size-8 items-center justify-center rounded-lg bg-blue-700 text-white shadow-sm"><Activity size={16} /></div>{collapsed ? null : <div className="ml-3"><p className="text-[17px] font-bold tracking-[-0.04em] text-slate-950">Rohly</p><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Outbound OS</p></div>}</Link><nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary navigation">{nav.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `group flex h-9 items-center rounded-md text-sm font-medium transition-[background-color,color] ${collapsed ? "justify-center" : "gap-3 px-3"} ${isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`} data-testid={`nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}><item.icon size={16} strokeWidth={1.8} /><span className={collapsed ? "sr-only" : ""}>{item.label}</span></NavLink>)}</nav><div className="border-t border-slate-200 p-3"><NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex h-9 items-center rounded-md text-sm font-medium ${collapsed ? "justify-center" : "gap-3 px-3"} ${isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`} data-testid="nav-settings"><Settings size={16} /><span className={collapsed ? "sr-only" : ""}>Settings</span></NavLink><button type="button" onClick={() => setCollapsed((value) => !value)} className="mt-1 hidden h-9 w-full items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} data-testid="sidebar-collapse-button">{collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /><span className="ml-2 text-xs">Collapse</span></>}</button></div></div>;
  return <div className="min-h-svh bg-slate-50 text-slate-950"><aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white transition-[width] duration-150 lg:block ${collapsed ? "w-[68px]" : "w-60"}`} data-testid="desktop-sidebar">{sidebar}</aside>{mobileOpen ? <div className="fixed inset-0 z-50 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)}><aside className="h-full w-64 bg-white" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div> : null}<div className={`transition-[padding] duration-150 ${collapsed ? "lg:pl-[68px]" : "lg:pl-60"}`}><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6" data-testid="topbar"><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={18} /></button><div className="text-sm"><span className="text-slate-400">Rohly</span><span className="mx-2 text-slate-300">/</span><span className="font-semibold text-slate-700" data-testid="current-page">{current}</span></div></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => setSearchOpen(true)} className="mr-1 hidden h-9 min-w-56 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white md:flex" data-testid="global-search-button"><Search size={14} /><span>Search Rohly...</span><kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button><button type="button" className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications" data-testid="notifications-button"><Bell size={17} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-blue-600" /></button><button type="button" onClick={() => setHelpOpen((value) => !value)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Help" data-testid="help-button"><CircleHelp size={17} /></button><div className="relative ml-1"><button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-slate-100" data-testid="profile-menu-button"><span className="flex size-7 items-center justify-center rounded-md bg-blue-700 text-[10px] font-bold text-white">DS</span><span className="hidden text-left xl:block"><span className="block text-xs font-semibold text-slate-800">{user.name}</span><span className="block text-[10px] text-slate-400">Rohly workspace</span></span></button>{profileOpen ? <div className="absolute right-0 top-11 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl" data-testid="profile-menu"><div className="border-b border-slate-100 px-2 py-2"><p className="truncate text-xs font-semibold">{user.name}</p><p className="truncate text-[11px] text-slate-500">{user.email}</p></div><Link to="/settings" onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-50"><User size={14} /> Profile & settings</Link><button type="button" onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50" data-testid="logout-button"><LogOut size={14} /> Log out</button></div> : null}</div></div></header><main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-7"><Outlet context={{ user }} /></main></div>{searchOpen ? <CommandPalette onClose={() => setSearchOpen(false)} onNavigate={(href) => { setSearchOpen(false); navigate(href); }} /> : null}{helpOpen ? <div className="fixed right-5 top-20 z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl" data-testid="help-panel"><div className="flex justify-between"><h2 className="text-sm font-semibold">Rohly shortcuts</h2><button onClick={() => setHelpOpen(false)} aria-label="Close help"><X size={15} /></button></div><div className="mt-4 space-y-3 text-xs text-slate-600"><p className="flex justify-between"><span>Global search</span><kbd>⌘ K</kbd></p><p className="flex justify-between"><span>New campaign</span><kbd>N</kbd></p><p className="flex justify-between"><span>Close panel</span><kbd>Esc</kbd></p></div></div> : null}<Toaster position="bottom-right" richColors /></div>;
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useQuery({ queryKey: ["search", query], queryFn: () => apiGet<SearchResult[]>(`/product/search?q=${encodeURIComponent(query)}`), enabled: query.trim().length > 0 });
  return <div className="fixed inset-0 z-[70] flex justify-center bg-slate-950/30 px-4 pt-[12vh]" onClick={onClose} data-testid="command-palette-overlay"><div className="h-fit w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()} data-testid="command-palette"><div className="flex items-center gap-3 border-b border-slate-200 px-4"><Search size={17} className="text-slate-400" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns, leads, inboxes, replies..." className="h-14 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="command-search-input" /><button type="button" onClick={onClose} className="text-xs text-slate-400">Esc</button></div><div className="max-h-96 overflow-y-auto p-2">{query && results.isLoading ? <div className="p-6 text-center text-xs text-slate-400">Searching...</div> : results.data?.length ? results.data.map((result) => <button key={`${result.type}-${result.id}`} type="button" onClick={() => onNavigate(result.href)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-slate-50" data-testid={`search-result-${result.type}-${result.id}`}><span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">{result.type}</span><span><span className="block text-sm font-semibold text-slate-800">{result.title}</span><span className="block text-xs text-slate-500">{result.subtitle}</span></span></button>) : <div className="p-8 text-center text-xs text-slate-400">{query ? "No matching Rohly records" : "Start typing to search the workspace"}</div>}</div></div></div>;
}