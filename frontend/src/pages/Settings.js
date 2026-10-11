import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import { apiError } from '../lib/api';
import { Reveal } from '../components/motion';

export default function Settings() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [notify, setNotify] = useState({ replies: true, warmup: true, bounces: false });

  const saveProfile = async () => {
    try {
      await api.patch('/auth/profile', { name });
      setUser({ ...user, name });
      toast.success('Profile updated');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const savePassword = async () => {
    try {
      await api.post('/auth/change-password', { current_password: pw.current, new_password: pw.next });
      toast.success('Password changed');
      setPw({ current: '', next: '' });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const inputCls = 'w-full rounded-xl bg-panel border border-line px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-signal focus:ring-2 focus:ring-signal/20 transition-signal';

  return (
    <div className="max-w-2xl" data-testid="settings-page">
      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Console preferences and account security.</p>
      </div>

      <Reveal y={12}>
        <div className="rounded-2xl border border-line bg-obsidian p-6 sm:p-8 mb-4" data-testid="settings-profile-card">
          <h2 className="font-display text-lg font-semibold mb-6">Profile</h2>
          <div className="space-y-5">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Name</label>
              <input data-testid="settings-name-input" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Email</label>
              <input data-testid="settings-email-input" value={user?.email || ''} disabled className={`${inputCls} opacity-50`} />
            </div>
            <button data-testid="settings-save-profile-btn" onClick={saveProfile} className="rounded-full bg-signal px-6 py-2.5 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">Save profile</button>
          </div>
        </div>
      </Reveal>

      <Reveal y={12} delay={0.06}>
        <div className="rounded-2xl border border-line bg-obsidian p-6 sm:p-8 mb-4" data-testid="settings-password-card">
          <h2 className="font-display text-lg font-semibold mb-6">Password</h2>
          <div className="space-y-5">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">Current password</label>
              <input data-testid="settings-current-password-input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 block mb-2">New password</label>
              <input data-testid="settings-new-password-input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputCls} />
            </div>
            <button data-testid="settings-change-password-btn" onClick={savePassword} className="rounded-full border border-signal/40 text-signal px-6 py-2.5 text-sm font-bold hover:bg-signal/10 transition-signal">Change password</button>
          </div>
        </div>
      </Reveal>

      <Reveal y={12} delay={0.12}>
        <div className="rounded-2xl border border-line bg-obsidian p-6 sm:p-8" data-testid="settings-notifications-card">
          <h2 className="font-display text-lg font-semibold mb-6">Notifications</h2>
          <div className="space-y-1">
            {[
              { k: 'replies', l: 'New replies', d: 'Ping me when a lead replies' },
              { k: 'warmup', l: 'Warm-up milestones', d: 'When an inbox completes ramp' },
              { k: 'bounces', l: 'Bounce alerts', d: 'If bounce rate crosses 3%' },
            ].map((n) => (
              <label key={n.k} className="flex items-center justify-between py-3.5 border-b border-line/40 last:border-0 cursor-pointer" data-testid={`settings-notification-${n.k}`}>
                <div>
                  <div className="text-sm text-slate-200">{n.l}</div>
                  <div className="text-xs text-slate-500">{n.d}</div>
                </div>
                <button
                  type="button"
                  data-testid={`settings-notification-toggle-${n.k}`}
                  onClick={() => setNotify({ ...notify, [n.k]: !notify[n.k] })}
                  className={`relative h-6 w-11 rounded-full transition-signal ${notify[n.k] ? 'bg-signal' : 'bg-line'}`}
                >
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all duration-200 ${notify[n.k] ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </label>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
