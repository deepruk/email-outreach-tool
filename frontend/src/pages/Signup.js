import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Logo from '../components/Logo';
import { useAuth } from '../lib/auth';
import { apiError } from '../lib/api';
import { EASE } from '../components/motion';

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form.name, form.email, form.password);
      toast.success('Console created — welcome aboard');
      navigate('/app');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full rounded-xl bg-panel border border-line px-4 py-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal';

  return (
    <div className="min-h-screen bg-ink grain flex flex-col" data-testid="signup-page">
      <div className="px-6 sm:px-14 lg:px-20 pt-10">
        <Link to="/"><Logo /></Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }} className="w-full max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal mb-4">Request console access</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-3">Create your account</h1>
          <p className="text-slate-400 mb-10">One console for every campaign, inbox and reply.</p>

          <form onSubmit={submit} className="space-y-5" data-testid="signup-form">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Full name</label>
              <input data-testid="signup-name-input" required value={form.name} onChange={set('name')} placeholder="Ada Lovelace" className={inputCls} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Email</label>
              <input data-testid="signup-email-input" type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" className={inputCls} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Password</label>
              <input data-testid="signup-password-input" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="8+ characters" className={inputCls} />
            </div>
            {error && <div data-testid="signup-error" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
            <button data-testid="signup-submit-btn" type="submit" disabled={busy} className="w-full rounded-full bg-signal py-3.5 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-50 transition-signal signal-glow">
              {busy ? 'Building console…' : 'Create account'}
            </button>
          </form>

          <p className="mt-8 text-sm text-slate-500">
            Already commanding? <Link to="/login" data-testid="signup-to-login-link" className="text-signal hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
