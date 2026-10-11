import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Radar, Inbox, Reply, BarChart3, Upload, Flame, ShieldCheck, Zap } from 'lucide-react';
import Logo from '../components/Logo';
import { Reveal, KineticLines, CountUp, TiltCard, EASE } from '../components/motion';
import { useLenis } from '../hooks/useLenis';

const HERO_IMG = 'https://images.unsplash.com/photo-1758520145408-dedb359d1c49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwyfHxzYWxlcyUyMHRlYW0lMjB3b3JraW5nJTIwb2ZmaWNlJTIwdGVjaG5vbG9neSUyMGRhcmslMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc5MTYyNjE1N3ww&ixlib=rb-4.1.0&q=85';
const COCKPIT_IMG = 'https://images.unsplash.com/photo-1758520145132-b0ecdb967295?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwzfHxzYWxlcyUyMHRlYW0lMjB3b3JraW5nJTIwb2ZmaWNlJTIwdGVjaG5vbG9neSUyMGRhcmslMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc5MTYyNjE1N3ww&ixlib=rb-4.1.0&q=85';

function Nav() {
  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
      className="fixed top-0 inset-x-0 z-50"
      data-testid="landing-nav"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="glass mt-4 rounded-2xl border border-line/70 px-5 py-3 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
            <a href="#product" className="hover:text-signal transition-signal">Product</a>
            <a href="#telemetry" className="hover:text-signal transition-signal">Telemetry</a>
            <a href="#pricing" className="hover:text-signal transition-signal">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" data-testid="nav-signin-link" className="hidden sm:block font-mono text-[11px] uppercase tracking-[0.2em] text-slate-300 hover:text-signal transition-signal px-3 py-2">Sign in</Link>
            <Link to="/app" data-testid="nav-launch-app-btn" className="group inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110 transition-signal signal-glow">
              Launch app
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform duration-200" />
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

function CockpitMock() {
  const bars = [38, 52, 30, 64, 48, 76, 58, 88, 70, 96, 82, 100];
  return (
    <div className="rounded-2xl border border-line bg-obsidian/90 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/60" style={{ transform: 'translateZ(50px)' }} data-testid="hero-cockpit-mock">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-signal animate-pulse-dot" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400">Live telemetry</span>
        </div>
        <span className="font-mono text-[10px] text-telemetry">+18.4% this week</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { l: 'Sent', v: '1,284', c: 'text-slate-100' },
          { l: 'Replies', v: '162', c: 'text-telemetry' },
          { l: 'Reply rate', v: '12.6%', c: 'text-health' },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-line bg-panel/60 px-3.5 py-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500 mb-1">{s.l}</div>
            <div className={`font-display text-lg font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{ background: i > 8 ? '#FF5A1F' : 'rgba(255,90,31,.28)' }}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 1, delay: 1 + i * 0.07, ease: EASE }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        {['warm-up', 'deliverability', 'reply radar'].map((t) => (
          <span key={t} className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-health" /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yBg = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const yVisual = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0.15]);

  return (
    <section ref={ref} className="relative min-h-screen overflow-hidden pt-36 pb-24" data-testid="landing-hero">
      <motion.div style={{ y: yBg }} className="absolute inset-0 grid-bg" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_30%_20%,rgba(255,90,31,0.14),transparent_65%)]" />
      <div className="absolute -top-40 left-1/3 size-[560px] rounded-full bg-signal/10 blur-[140px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
        <motion.div style={{ opacity: fade }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
            className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-signal/30 bg-signal/10 px-4 py-1.5"
          >
            <span className="size-1.5 rounded-full bg-signal animate-pulse-dot" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal">Outbound command center</span>
          </motion.div>

          <KineticLines
            className="font-display font-bold leading-[0.98] tracking-tight text-[clamp(2.6rem,7vw,5.4rem)]"
            lines={<>Your outbound,</>}
            delay={0.45}
          />
          <KineticLines
            className="font-display font-bold leading-[0.98] tracking-tight text-[clamp(2.6rem,7vw,5.4rem)]"
            lines={<span><span className="text-signal">commanded.</span> <span className="text-slate-600">Not babysat.</span></span>}
            delay={0.62}
          />

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.95, ease: EASE }}
            className="mt-7 max-w-lg text-base sm:text-lg leading-relaxed text-slate-400"
          >
            Rohly runs personalized campaigns across your inboxes, watches deliverability like a flight instrument, and surfaces every reply that matters — from one dark, precise console.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.1, ease: EASE }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link to="/app" data-testid="hero-cta-primary" className="group inline-flex items-center gap-2.5 rounded-full bg-signal px-7 py-3.5 text-base font-bold text-ink hover:brightness-110 hover:scale-[1.02] transition-signal signal-glow">
              Take the console
              <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
            <a href="#product" className="inline-flex items-center gap-2 rounded-full border border-line px-7 py-3.5 text-base font-semibold text-slate-200 hover:border-signal/50 hover:text-signal transition-signal">
              See the system
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.3 }}
            className="mt-12 flex flex-wrap gap-x-10 gap-y-4"
          >
            {[
              { v: 3.2, s: 'x', l: 'median reply lift', d: 0 },
              { v: 98.4, s: '%', l: 'deliverability rate', d: 1 },
              { v: 11, s: 's', l: 'to first campaign', d: 0 },
            ].map((m) => (
              <div key={m.l}>
                <div className="font-display text-2xl sm:text-3xl font-bold text-slate-50">
                  <CountUp value={m.v} decimals={m.d} suffix={m.s} />
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">{m.l}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div style={{ y: yVisual }} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, delay: 0.8, ease: EASE }}>
          <TiltCard testid="hero-tilt-visual">
            <div className="relative">
              <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_60%_35%,rgba(255,90,31,0.22),transparent_70%)] blur-2xl" />
              <CockpitMock />
            </div>
          </TiltCard>
        </motion.div>
      </div>
    </section>
  );
}

function Marquee() {
  const items = ['Personalized at scale', 'Multi-inbox rotation', 'Warm-up autopilot', 'Reply radar', 'CSV imports in seconds', 'Bounce shielding', 'Live deliverability telemetry', 'Sequences that read like you wrote them'];
  const row = items.map((t, i) => (
    <span key={i} className="mx-7 inline-flex items-center gap-7 font-display text-xl sm:text-2xl font-medium text-slate-500">
      {t} <span className="text-signal">✳</span>
    </span>
  ));
  return (
    <section className="border-y border-line/70 bg-obsidian/60 py-7 overflow-hidden" data-testid="editorial-marquee">
      <div className="flex w-max animate-marquee whitespace-nowrap" style={{ width: '200%' }}>
        <div className="flex w-1/2 justify-around">{row}</div>
        <div className="flex w-1/2 justify-around" aria-hidden="true">{row}</div>
      </div>
    </section>
  );
}

function Bento() {
  const cards = [
    {
      icon: Zap, title: 'Campaign engine', body: 'Draft, launch, pause and schedule campaigns that pull {{first_name}}-level personalization from every row of your CSV.', testid: 'bento-campaign-engine',
      accent: 'text-signal',
      visual: (
        <div className="flex flex-col gap-2 mt-6">
          {['draft → launch → schedule'].map((s, i) => (
            <div key={i} className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span className="size-1.5 rounded-full bg-signal" /> {s}
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: ShieldCheck, title: 'Inbox health, on instruments', body: 'Every connected mailbox reports warm-up day, daily limit burn and reply-tracking status — before problems cost you.', testid: 'bento-inbox-health',
      accent: 'text-health',
      visual: (
        <div className="mt-6 space-y-2.5">
          {[80, 55, 30].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-line overflow-hidden">
              <motion.div className="h-full rounded-full bg-health" initial={{ width: 0 }} whileInView={{ width: `${w}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.15, ease: EASE }} />
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Reply, title: 'Reply radar', body: 'Positive, neutral or not-interested — every reply is classified the moment it lands, and the hot ones surface first.', testid: 'bento-reply-radar',
      accent: 'text-telemetry',
      visual: (
        <div className="mt-6 flex gap-2">
          {['positive', 'neutral', 'cold'].map((t, i) => (
            <span key={t} className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${i === 0 ? 'border-health/40 text-health' : i === 1 ? 'border-telemetry/40 text-telemetry' : 'border-line text-slate-500'}`}>{t}</span>
          ))}
        </div>
      ),
    },
    {
      icon: Upload, title: 'CSV in, pipeline out', body: 'Drop a list, map the columns once, and your leads are staged for the next launch window.', testid: 'bento-csv',
      accent: 'text-signal',
      visual: (
        <div className="mt-6 rounded-xl border border-dashed border-line px-4 py-4 font-mono text-[11px] text-slate-500">
          founders_q4.csv <span className="text-health">— 2,412 rows mapped</span>
        </div>
      ),
    },
    {
      icon: BarChart3, title: 'Analytics that answer back', body: 'Reply rate, positive-reply rate and bounce rate over any window — the funnel is one glance, not a spreadsheet.', testid: 'bento-analytics',
      accent: 'text-signal',
      visual: (
        <div className="mt-6 flex items-end gap-1.5 h-16">
          {[30, 45, 38, 60, 52, 74, 66, 90].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-signal/25 to-signal" style={{ height: `${h}%` }} />
          ))}
        </div>
      ),
    },
    {
      icon: Flame, title: 'Warm-up autopilot', body: 'New mailboxes earn sender reputation on a 14-day ramp while Rohly meters every send against the limit.', testid: 'bento-warmup',
      accent: 'text-telemetry',
      visual: (
        <div className="mt-6 flex items-center gap-3">
          <div className="size-12 rounded-full border-4 border-line border-t-telemetry animate-radar-sweep" />
          <span className="font-mono text-[11px] text-slate-400">day 9 / 14 — ramping</span>
        </div>
      ),
    },
  ];

  return (
    <section id="product" className="relative py-28 sm:py-36" data-testid="landing-bento">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal mb-4">The system</p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight max-w-2xl leading-[1.05]">
            Six instruments. One console. Zero guesswork.
          </h2>
        </Reveal>
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.06} className="h-full">
              <div data-testid={c.testid} className="group h-full rounded-2xl border border-line bg-obsidian p-7 hover:border-signal/40 hover:-translate-y-1 transition-signal duration-300">
                <c.icon size={22} className={`${c.accent} mb-5`} />
                <h3 className="font-display text-lg font-semibold mb-2.5">{c.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{c.body}</p>
                {c.visual}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Telemetry() {
  return (
    <section id="telemetry" className="relative py-28 sm:py-32 border-y border-line/60 overflow-hidden" data-testid="landing-telemetry">
      <div className="absolute inset-0">
        <img src={COCKPIT_IMG} alt="" className="duotone size-full object-cover opacity-30" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/40" />
      </div>
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 grid lg:grid-cols-2 gap-14 items-center">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-telemetry mb-4">Telemetry deck</p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-[1.05] mb-6">
            Read your outbound like flight data.
          </h2>
          <p className="text-slate-400 leading-relaxed max-w-md mb-9">
            Sends, opens, replies and bounces stream into one timeline. When an inbox drifts off-spec, the attention queue flags it before your domain pays for it.
          </p>
          <ul className="space-y-4">
            {['Inbox attention queue with reconnect + warm-up alerts', 'Daily send/reply curve across any 7–90 day window', 'Positive-reply sentiment separated from noise'].map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm text-slate-300">
                <Radar size={16} className="text-signal mt-0.5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="relative rounded-2xl overflow-hidden border border-line" data-testid="telemetry-photo">
            <img src={HERO_IMG} alt="Team operating Rohly in a dark office" className="duotone w-full aspect-[4/3] object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,90,31,0.25),transparent_60%)] mix-blend-screen" />
            <div className="absolute bottom-5 left-5 right-5 glass rounded-xl border border-line px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500">Replies this week</div>
                <div className="font-display text-2xl font-bold text-slate-50"><CountUp value={162} /></div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500">Positive</div>
                <div className="font-display text-2xl font-bold text-health"><CountUp value={41} /></div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    { name: 'Cadet', price: 29, feats: ['1 inbox', '1,000 leads', 'Core analytics'], testid: 'pricing-cadet' },
    { name: 'Growth', price: 79, feats: ['20 inboxes', '25,000 leads', 'Warm-up autopilot', 'Reply radar'], hot: true, testid: 'pricing-growth' },
    { name: 'Fleet', price: 199, feats: ['Unlimited inboxes', 'Unlimited leads', 'Priority relay', 'Dedicated IP pool'], testid: 'pricing-fleet' },
  ];
  return (
    <section id="pricing" className="py-28 sm:py-36" data-testid="landing-pricing">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal mb-4">Flight plans</p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight">Pick your altitude.</h2>
        </Reveal>
        <div className="mt-14 grid md:grid-cols-3 gap-4 items-stretch">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08} className="h-full">
              <div data-testid={t.testid} className={`relative h-full rounded-2xl p-8 border transition-signal duration-300 ${t.hot ? 'border-signal/60 bg-obsidian signal-glow' : 'border-line bg-obsidian/60 hover:border-slate-600'}`}>
                {t.hot && <span className="absolute -top-3 left-8 rounded-full bg-signal px-3 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink font-bold">Most flown</span>}
                <div className="font-display text-xl font-semibold mb-1">{t.name}</div>
                <div className="font-display text-4xl font-bold mb-6">${t.price}<span className="text-base text-slate-500 font-body font-medium"> /mo</span></div>
                <ul className="space-y-3 mb-8">
                  {t.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <Inbox size={14} className="text-signal shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" data-testid={`${t.testid}-cta`} className={`block text-center rounded-full py-3 text-sm font-bold transition-signal ${t.hot ? 'bg-signal text-ink hover:brightness-110' : 'border border-line text-slate-200 hover:border-signal/50 hover:text-signal'}`}>
                  Start with {t.name}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative py-32 overflow-hidden" data-testid="landing-final-cta">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(255,90,31,0.16),transparent_70%)]" />
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8 text-center">
        <Reveal>
          <KineticLines
            className="font-display font-bold tracking-tight text-[clamp(2.2rem,5.5vw,4.2rem)] leading-[1.02]"
            lines={<span>Stop chasing. Start <span className="text-signal">commanding.</span></span>}
          />
          <p className="mt-6 text-slate-400 max-w-xl mx-auto leading-relaxed">
            Your next campaign is one CSV away. Connect an inbox, upload a list, and watch the telemetry come alive.
          </p>
          <Link to="/app" data-testid="final-cta-btn" className="group mt-10 inline-flex items-center gap-2.5 rounded-full bg-signal px-8 py-4 text-base font-bold text-ink hover:brightness-110 hover:scale-[1.02] transition-signal signal-glow">
            Launch the console
            <ArrowUpRight size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line/60 py-12" data-testid="landing-footer">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <Logo dim />
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-600">Rohly — outbound command center</p>
        <div className="flex gap-6 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <a href="#product" className="hover:text-signal transition-signal">Product</a>
          <a href="#pricing" className="hover:text-signal transition-signal">Pricing</a>
          <Link to="/login" className="hover:text-signal transition-signal">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useLenis(true);
  return (
    <div className="min-h-screen bg-ink text-slate-100 antialiased grain" data-testid="landing-page">
      <Nav />
      <Hero />
      <Marquee />
      <Bento />
      <Telemetry />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}
