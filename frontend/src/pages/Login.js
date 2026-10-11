import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Logo from '../components/Logo';
import { useAuth } from '../lib/auth';
import { apiError } from '../lib/api';
import { EASE } from '../components/motion';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      toast.success('Uplink established');
      navigate('/app');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink grid lg:grid-cols-[1fr_0.85fr] grain" data-testid="login-page">
      <div className="flex flex-col justify-center px-6 sm:px-14 lg:px-20 py-14">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          <Link to="/" className="inline-block mb-14"><Logo /></Link>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal mb-4">Welcome back, commander</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-3">Sign in to Rohly</h1>
          <p className="text-slate-400 mb-10">Your outbound console is exactly where you left it.</p>

          <form onSubmit={submit} className="max-w-md space-y-5" data-testid="login-form">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Email</label>
              <input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl bg-panel border border-line px-4 py-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Password</label>
              <input
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full rounded-xl bg-panel border border-line px-4 py-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal"
              />
            </div>
            {error && (
              <div data-testid="login-error" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
            )}
            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-signal py-3.5 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-50 transition-signal signal-glow"
            >
              {busy ? 'Establishing uplink…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-sm text-slate-500">
            New to the console?{' '}
            <Link to="/signup" data-testid="login-to-signup-link" className="text-signal hover:underline">Create an account</Link>
          </p>
        </motion.div>
      </div>

      <div className="relative hidden lg:block overflow-hidden border-l border-line">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_30%,rgba(255,90,31,0.16),transparent_70%)]" />
        <div className="absolute inset-0 flex items-center justify-center p-14">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: EASE }}
            className="rounded-2xl border border-line bg-obsidian/80 backdrop-blur-xl p-8 max-w-sm"
          >
            <div className="flex items-center gap-2 mb-6">
              <span className="size-2 rounded-full bg-health animate-pulse-dot" />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400">Console status</span>
            </div>
            {[['Campaigns live', '2'], ['Inboxes healthy', '3 / 5'], ['Replies today', '12'], ['Bounce rate', '1.8%']].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-line/60 last:border-0 py-3.5">
                <span className="text-sm text-slate-400 flex-1">{k}</span>
                <span className="font-mono text-sm text-slate-100">{v}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
