import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Megaphone, Users, Inbox as InboxIcon, BarChart3, Upload, CreditCard, Settings as SettingsIcon, LogOut, Menu, X, Plus, ChevronDown, Signal } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../lib/auth';

const NAV_GROUPS = [
  { label: 'Overview', items: [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, testid: 'nav-dashboard-link' },
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3, testid: 'nav-analytics-link' },
  ] },
  { label: 'Outbound', items: [
    { to: '/app/campaigns', label: 'Campaigns', icon: Megaphone, testid: 'nav-campaigns-link' },
    { to: '/app/leads', label: 'Leads', icon: Users, testid: 'nav-leads-link' },
  ] },
  { label: 'Channels', items: [
    { to: '/app/inboxes', label: 'Mailboxes', icon: InboxIcon, testid: 'nav-inboxes-link' },
    { to: '/app/imports', label: 'Imports', icon: Upload, testid: 'nav-imports-link' },
  ] },
  { label: 'Workspace', items: [
    { to: '/app/billing', label: 'Billing', icon: CreditCard, testid: 'nav-billing-link' },
    { to: '/app/settings', label: 'Settings', icon: SettingsIcon, testid: 'nav-settings-link' },
  ] },
];

const TITLES = [
  ['/app/campaigns/new', 'New campaign', 'Name the mission, write the email, aim it at a list'],
  ['/app/campaigns', 'Campaigns', 'Draft, launch and steer every outbound mission'],
  ['/app/leads', 'Leads', 'Your audience — search, filter and act in bulk'],
  ['/app/inboxes', 'Mailboxes', 'Connected sending accounts and their health'],
  ['/app/analytics', 'Analytics', 'The whole funnel on one instrument panel'],
  ['/app/imports', 'Imports', 'Bring lists in, mapped and ready'],
  ['/app/billing', 'Billing', 'Plan, usage and invoices'],
  ['/app/settings', 'Settings', 'Account and console preferences'],
  ['/app', 'Dashboard', 'Your outbound at a glance'],
];

function useTitle() {
  const { pathname } = useLocation();
  const hit = TITLES.find(([p]) => pathname === p || (p !== '/app' && pathname.startsWith(p))) || TITLES[TITLES.length - 1];
  if (pathname.startsWith('/app/campaigns/') && !pathname.endsWith('/new')) return ['Campaign', 'Mission detail, audience and live activity'];
  return hit.slice(1);
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 border-b border-line/60">
        <NavLink to="/" data-testid="sidebar-logo-link"><Logo /></NavLink>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" data-testid="sidebar-nav">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-2 font-mono text-[9px] uppercase tracking-[0.25em] text-slate-600">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  data-testid={n.testid}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-signal ${
                      isActive ? 'bg-signal/10 text-signal' : 'text-slate-400 hover:text-slate-100 hover:bg-panel'
                    }`
                  }
                >
                  <n.icon size={15} className="shrink-0" />
                  {n.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 pb-5 border-t border-line/60 pt-4">
        <div className="flex items-center gap-3 px-2.5 pb-3">
          <div className="size-9 rounded-full bg-gradient-to-br from-signal to-signal-dim flex items-center justify-center font-display font-bold text-ink text-sm">
            {(user?.name || 'R')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-100 truncate" data-testid="sidebar-user-name">{user?.name}</div>
            <div className="font-mono text-[10px] text-slate-500 truncate">{user?.email}</div>
          </div>
        </div>
        <button
          data-testid="sidebar-logout-btn"
          onClick={async () => { await logout(); navigate('/'); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-signal"
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button data-testid="topbar-user-menu-btn" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border border-line pl-1.5 pr-3 py-1.5 hover:border-slate-600 transition-signal">
        <span className="size-6 rounded-full bg-gradient-to-br from-signal to-signal-dim flex items-center justify-center font-display font-bold text-ink text-[11px]">{(user?.name || 'R')[0].toUpperCase()}</span>
        <ChevronDown size={13} className="text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-line bg-obsidian shadow-2xl shadow-black/50 overflow-hidden"
              data-testid="topbar-user-menu"
            >
              <div className="px-4 py-3 border-b border-line/60">
                <div className="text-sm font-semibold text-slate-100 truncate">{user?.name}</div>
                <div className="font-mono text-[10px] text-slate-500 truncate">{user?.email}</div>
              </div>
              <button onClick={() => { setOpen(false); navigate('/app/settings'); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-300 hover:bg-panel transition-signal" data-testid="user-menu-settings">
                <SettingsIcon size={14} /> Settings
              </button>
              <button onClick={() => { setOpen(false); navigate('/app/billing'); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-300 hover:bg-panel transition-signal" data-testid="user-menu-billing">
                <CreditCard size={14} /> Billing
              </button>
              <button onClick={async () => { setOpen(false); await logout(); navigate('/'); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-300 hover:bg-red-500/10 transition-signal" data-testid="user-menu-logout">
                <LogOut size={14} /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [title, sub] = useTitle();
  return (
    <div className="min-h-screen bg-ink text-slate-100" data-testid="app-shell">
      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block w-60 bg-obsidian/70 border-r border-line/60 backdrop-blur-xl">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/75 lg:hidden" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-60 bg-obsidian border-r border-line lg:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 glass border-b border-line/60 px-5 sm:px-8 py-3 flex items-center justify-between gap-4" data-testid="app-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <button data-testid="topbar-menu-btn" className="lg:hidden p-2 -ml-2 text-slate-300" onClick={() => setOpen(true)} aria-label="Open menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold leading-tight truncate" data-testid="topbar-title">{title}</h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate">{sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden xl:flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              <Signal size={12} className="text-health" /> Live
            </span>
            <UserMenu />
            <Link to="/app/campaigns/new" data-testid="topbar-new-campaign-btn" className="inline-flex items-center gap-2 rounded-full bg-signal px-4 py-2 text-[13px] font-bold text-ink hover:brightness-110 transition-signal signal-glow">
              <Plus size={15} /> <span className="hidden sm:inline">New campaign</span>
            </Link>
          </div>
        </header>
        <main className="px-5 sm:px-8 py-7 max-w-[1400px]" data-testid="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AttentionBar({ attention }) {
  if (!attention || attention.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex items-center gap-3" data-testid="attention-bar">
      <Signal size={16} className="text-amber-400 shrink-0" />
      <p className="text-sm text-amber-200">
        {attention[0].message} — {attention[0].email}
        {attention.length > 1 && <span className="text-amber-400/70"> · +{attention.length - 1} more need attention</span>}
      </p>
    </div>
  );
}
