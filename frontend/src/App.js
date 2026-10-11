import React, { Component } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './App.css';
import { AuthProvider, useAuth } from './lib/auth';
import { scrollToTopInstant } from './hooks/useLenis';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AppShell from './pages/AppShell';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import CampaignEditor from './pages/CampaignEditor';
import Leads from './pages/Leads';
import Inboxes from './pages/Inboxes';
import Analytics from './pages/Analytics';
import Imports from './pages/Imports';
import Billing from './pages/Billing';
import Settings from './pages/Settings';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-ink flex items-center justify-center p-8">
          <div className="max-w-md border border-line rounded-2xl bg-obsidian p-8">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal mb-3">Signal lost</p>
            <p className="font-display text-2xl font-semibold mb-2">Something misfired</p>
            <p className="text-slate-400 text-sm mb-6">{String(this.state.error?.message || this.state.error)}</p>
            <button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-full bg-signal text-ink font-semibold text-sm hover:brightness-110 transition-signal">
              Reload console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    scrollToTopInstant();
  }, [pathname]);
  return null;
}

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 animate-pulse">Establishing uplink…</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/app" element={<Protected><AppShell /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/new" element={<CampaignEditor />} />
        <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="campaigns/:campaignId/edit" element={<CampaignEditor />} />
        <Route path="leads" element={<Leads />} />
        <Route path="inboxes" element={<Inboxes />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="imports" element={<Imports />} />
        <Route path="billing" element={<Billing />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: '#0D111A', border: '1px solid #1E293B', color: '#F8FAFC', fontFamily: 'Plus Jakarta Sans' },
            }}
          />
          <ScrollToTop />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
