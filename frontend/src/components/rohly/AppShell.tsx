import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
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
import type { SearchResult, UserPublic, WorkspaceContext } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/inbox", label: "Master Inbox", icon: Inbox },
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
  const [railHovered, setRailHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => apiGet<WorkspaceContext[]>("/workspaces") });
  const currentWorkspace = useQuery({ queryKey: ["workspace-current"], queryFn: () => apiGet<WorkspaceContext>("/workspaces/current") });
  const selectWorkspace = useMutation({ mutationFn: (id: string) => apiPost<void>(`/workspaces/${id}/select`), onSuccess: () => { queryClient.clear(); window.location.assign("/"); } });
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
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || user.email.slice(0, 2).toUpperCase();
  const current = nav.find((item) => item.to === location.pathname)?.label ?? (location.pathname.startsWith("/campaigns/") ? "Campaign" : "Rohly");
  const railExpanded = railHovered || mobileOpen;
  const sidebar = <div className="flex h-full flex-col"><nav className="flex-1 space-y-1 overflow-y-auto p-3 pt-4" aria-label="Primary navigation">{nav.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `rohly-interactive group flex h-9 items-center rounded-lg text-sm font-medium transition-all duration-150 ${railExpanded ? "gap-3 px-3" : "justify-center"} ${isActive ? "rohly-option-active bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-800" : "text-slate-600 hover:bg-indigo-50/70 hover:text-indigo-900"}`} data-testid={`nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}><item.icon size={16} strokeWidth={1.8} /><span className={!railExpanded ? "sr-only" : ""}>{item.label}</span></NavLink>)}</nav><div className="border-t border-slate-200 p-3"><NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex h-9 items-center rounded-md text-sm font-medium ${railExpanded ? "gap-3 px-3" : "justify-center"} ${isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`} data-testid="nav-settings"><Settings size={16} /><span className={!railExpanded ? "sr-only" : ""}>Settings</span></NavLink></div></div>;
  return <div className="rohly-app-bg min-h-svh text-slate-950"><aside onMouseEnter={() => setRailHovered(true)} onMouseLeave={() => setRailHovered(false)} className={`fixed bottom-0 left-0 top-14 z-[60] hidden border-r border-indigo-100/80 bg-white/95 shadow-[8px_0_30px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-[width,box-shadow] duration-200 ease-out lg:block ${railExpanded ? "w-60 shadow-[14px_0_40px_rgba(15,23,42,0.10)]" : "w-[72px]"}`} data-testid="desktop-sidebar">{sidebar}</aside>{mobileOpen ? <div className="fixed inset-0 z-50 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)}><aside className="h-full w-64 bg-white" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div> : null}<div><header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 px-4 text-white shadow-[0_8px_30px_rgba(15,23,42,0.16)] sm:px-6" data-testid="topbar"><Link to="/" className="mr-5 hidden w-[48px] shrink-0 items-center gap-3 lg:flex xl:w-[220px]"><span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 shadow-[0_6px_18px_rgba(59,130,246,.3)]"><Activity size={16}/></span><span className="hidden xl:block"><span className="block text-[16px] font-bold tracking-[-.03em]">Rohly</span><span className="block text-[8px] font-semibold uppercase tracking-[.16em] text-indigo-200/70">Outbound OS</span></span></Link><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={18} /></button><div className="flex items-center gap-2 text-sm"><select aria-label="Active workspace" data-testid="workspace-switcher" value={currentWorkspace.data?.workspace.id ?? ""} onChange={(event) => selectWorkspace.mutate(event.target.value)} className="max-w-44 rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white outline-none backdrop-blur [&>option]:text-slate-900">{workspaces.data?.map((item) => <option key={item.workspace.id} value={item.workspace.id}>{item.workspace.name}</option>)}</select><span className="text-white/30">/</span><span className="font-semibold text-white/90" data-testid="current-page">{current}</span></div></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => setSearchOpen(true)} className="mr-1 hidden h-9 min-w-56 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-left text-sm text-indigo-100/70 transition-colors hover:bg-white/15 md:flex" data-testid="global-search-button"><Search size={14} /><span>Search Rohly...</span><kbd className="ml-auto rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">⌘ K</kbd></button><button type="button" className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications" data-testid="notifications-button"><Bell size={17} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-blue-600" /></button><button type="button" onClick={() => setHelpOpen((value) => !value)} className="rounded-md p-2 text-indigo-100/80 hover:bg-white/10 hover:text-white" aria-label="Help" data-testid="help-button"><CircleHelp size={17} /></button><div className="relative ml-1"><button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-white/10" data-testid="profile-menu-button"><span className="flex size-7 items-center justify-center rounded-md bg-blue-700 text-[10px] font-bold text-white">{initials}</span><span className="hidden text-left xl:block"><span className="block text-xs font-semibold text-white">{user.name}</span><span className="block max-w-32 truncate text-[10px] text-indigo-200/60">{currentWorkspace.data?.workspace.name ?? "Workspace"}</span></span></button>{profileOpen ? <div className="rohly-pop absolute right-0 top-11 w-56 rounded-xl border border-indigo-100 bg-white p-1.5 shadow-2xl" data-testid="profile-menu"><div className="border-b border-slate-100 px-2 py-2"><p className="truncate text-xs font-semibold">{user.name}</p><p className="truncate text-[11px] text-slate-500">{user.email}</p></div><Link to="/settings" onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-50"><User size={14} /> Profile & settings</Link><button type="button" onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50" data-testid="logout-button"><LogOut size={14} /> Log out</button></div> : null}</div></div></header><main key={location.pathname} className="rohly-page-enter mx-auto max-w-[1600px] p-4 sm:p-5 lg:ml-[72px] lg:p-6"><Outlet context={{ user }} /></main></div>{searchOpen ? <CommandPalette onClose={() => setSearchOpen(false)} onNavigate={(href) => { setSearchOpen(false); navigate(href); }} /> : null}{helpOpen ? <div className="rohly-pop fixed right-5 top-20 z-50 w-80 rounded-xl border border-indigo-100 bg-white p-4 shadow-2xl" data-testid="help-panel"><div className="flex justify-between"><h2 className="text-sm font-semibold">Rohly shortcuts</h2><button onClick={() => setHelpOpen(false)} aria-label="Close help"><X size={15} /></button></div><div className="mt-4 space-y-3 text-xs text-slate-600"><p className="flex justify-between"><span>Global search</span><kbd>⌘ K</kbd></p><p className="flex justify-between"><span>New campaign</span><kbd>N</kbd></p><p className="flex justify-between"><span>Close panel</span><kbd>Esc</kbd></p></div></div> : null}<Toaster position="bottom-right" richColors /></div>;
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useQuery({ queryKey: ["search", query], queryFn: () => apiGet<SearchResult[]>(`/product/search?q=${encodeURIComponent(query)}`), enabled: query.trim().length > 0 });
  return <div className="fixed inset-0 z-[70] flex justify-center bg-slate-950/30 px-4 pt-[12vh]" onClick={onClose} data-testid="command-palette-overlay"><div className="h-fit w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()} data-testid="command-palette"><div className="flex items-center gap-3 border-b border-slate-200 px-4"><Search size={17} className="text-slate-400" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns, leads, inboxes, replies..." className="h-14 border-0 px-0 shadow-none focus-visible:ring-0" data-testid="command-search-input" /><button type="button" onClick={onClose} className="text-xs text-slate-400">Esc</button></div><div className="max-h-96 overflow-y-auto p-2">{query && results.isLoading ? <div className="p-6 text-center text-xs text-slate-400">Searching...</div> : results.data?.length ? results.data.map((result) => <button key={`${result.type}-${result.id}`} type="button" onClick={() => onNavigate(result.href)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-slate-50" data-testid={`search-result-${result.type}-${result.id}`}><span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">{result.type}</span><span><span className="block text-sm font-semibold text-slate-800">{result.title}</span><span className="block text-xs text-slate-500">{result.subtitle}</span></span></button>) : <div className="p-8 text-center text-xs text-slate-400">{query ? "No matching Rohly records" : "Start typing to search the workspace"}</div>}</div></div></div>;
}