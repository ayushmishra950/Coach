import {
  AlertTriangle, ArrowRight, BarChart3, Bell, BellRing, BookOpen, BookText, Brain, CalendarCheck, Check, ChevronDown, ClipboardList,
  Code2, Crown, FileSpreadsheet, GraduationCap, IndianRupee, Landmark, Languages, LayoutDashboard, Mail, Menu, MessageCircle,
  MessageSquare, Minus, NotebookPen, Play, School, Smartphone, Sparkles, Star, Stethoscope, UserSquare2, Users, X, Zap,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo, LogoMark } from '../components/Logo';
import { clsx } from '../components/ui';
import { api } from '../lib/api';
import { COMPARISON, FEATURE_INFO } from '../lib/features';
import type { Plan } from '../lib/types';

/* ────────────────────────── helpers ────────────────────────── */

const FALLBACK_PLANS: Plan[] = [
  { _id: 's', key: 'starter', name: 'Starter', tagline: 'For new & small institutes', priceMonthly: 499, priceYearly: 4990, studentLimit: 50, teacherLimit: 3, features: [], whatsappLimit: 0, popular: false, order: 1 },
  { _id: 'g', key: 'growth', name: 'Growth', tagline: 'For growing institutes', priceMonthly: 999, priceYearly: 9990, studentLimit: 150, teacherLimit: 10, features: ['feeReminders', 'parentPortal', 'whatsapp', 'onlinePayments', 'advancedTests'], whatsappLimit: 500, popular: false, order: 2 },
  { _id: 'p', key: 'premium', name: 'Premium', tagline: 'For established institutes', priceMonthly: 1499, priceYearly: 14990, studentLimit: 500, teacherLimit: 25, features: ['feeReminders', 'parentPortal', 'whatsapp', 'onlinePayments', 'advancedTests', 'advancedReports', 'aiInsights', 'customBranding', 'prioritySupport'], whatsappLimit: 5000, popular: true, order: 3 },
];

const rupee = (n: number) => '₹' + n.toLocaleString('en-IN');

function SectionTitle({ eyebrow, title, text, light }: { eyebrow: string; title: ReactNode; text?: ReactNode; light?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className={clsx('text-xs font-extrabold uppercase tracking-[0.2em]', light ? 'text-violet-300' : 'text-brand-600')}>{eyebrow}</p>
      <h2 className={clsx('mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl', light ? 'text-white' : 'text-slate-900')}>{title}</h2>
      {text && <p className={clsx('mt-4 text-base sm:text-lg', light ? 'text-slate-300' : 'text-slate-500')}>{text}</p>}
    </div>
  );
}

/* ────────────────────────── nav ────────────────────────── */

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={clsx('sticky top-0 z-40 transition-all', scrolled ? 'border-b border-slate-200/70 bg-white/75 shadow-sm backdrop-blur-xl' : 'bg-transparent')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">{n.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/login" className="btn-ghost">Login</Link>
          <Link to="/register" className="btn-premium">Start free trial <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-5 pt-2 shadow-lg md:hidden animate-fade-up">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-semibold text-slate-700 hover:bg-slate-50">{n.label}</a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/login" className="btn-secondary">Login</Link>
            <Link to="/register" className="btn-premium">Start free trial</Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* ────────────────────────── hero mockup ────────────────────────── */

function DashboardMockup() {
  const nav = [LayoutDashboard, GraduationCap, UserSquare2, BookOpen, CalendarCheck, IndianRupee, ClipboardList, BarChart3];
  const actions = [
    { icon: IndianRupee, cls: 'bg-amber-50 text-amber-600', text: '12 students have fees overdue', tag: '₹31.2K' },
    { icon: AlertTriangle, cls: 'bg-rose-50 text-rose-600', text: 'Aman absent 3 days in a row', tag: 'Call parent' },
    { icon: ClipboardList, cls: 'bg-violet-50 text-violet-600', text: 'Physics test marks not entered', tag: 'JEE-A' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-brand-500/30 via-violet-500/25 to-fuchsia-500/30 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl shadow-brand-900/20 ring-1 ring-slate-900/5">
        {/* browser chrome */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[10px] text-slate-400 ring-1 ring-slate-200">app.coachflow.in/dashboard</div>
        </div>
        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-14 shrink-0 flex-col items-center gap-2 bg-slate-900 py-4 sm:flex">
            <LogoMark className="h-7 w-7" />
            <div className="mt-2 flex flex-col gap-1.5">
              {nav.map((I, i) => (
                <div key={i} className={clsx('grid h-8 w-8 place-items-center rounded-lg', i === 0 ? 'bg-gradient-to-br from-brand-500 to-violet-500 text-white' : 'text-slate-500')}>
                  <I className="h-4 w-4" />
                </div>
              ))}
            </div>
          </div>
          {/* body */}
          <div className="min-w-0 flex-1 space-y-3 bg-slate-50/60 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-slate-400">Friday, 25 September</p>
                <p className="text-sm font-extrabold text-slate-900 sm:text-base">Good Morning, Rajesh 👋</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative grid h-7 w-7 place-items-center rounded-lg bg-white ring-1 ring-slate-200"><Bell className="h-3.5 w-3.5 text-slate-500" /><span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500" /></div>
                <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-[10px] font-bold text-white">RS</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: 'Students', v: '248', I: GraduationCap, c: 'from-brand-500 to-violet-500' },
                { l: 'Teachers', v: '14', I: UserSquare2, c: 'from-sky-500 to-cyan-500' },
                { l: 'Batches', v: '18', I: BookOpen, c: 'from-emerald-500 to-teal-500' },
              ].map((s) => (
                <div key={s.l} className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-500">{s.l}</p>
                    <div className={clsx('grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br text-white', s.c)}><s.I className="h-3 w-3" /></div>
                  </div>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">{s.v}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-slate-700">Today's attendance</p>
                  <p className="text-sm font-extrabold text-emerald-600">87%</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[87%] rounded-full bg-emerald-500" /></div>
                <div className="mt-3 flex h-10 items-end gap-1">
                  {[62, 75, 70, 88, 80, 92, 87].map((h, i) => (
                    <div key={i} className={clsx('flex-1 rounded-t', i === 6 ? 'bg-gradient-to-t from-brand-500 to-violet-400' : 'bg-brand-100')} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
                <p className="text-[11px] font-bold text-slate-700">Fees this month</p>
                <p className="mt-1 text-lg font-extrabold text-slate-900">₹2,14,500 <span className="text-[10px] font-semibold text-emerald-600">collected</span></p>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[87%] bg-gradient-to-r from-brand-500 to-violet-500" />
                  <div className="h-full w-[13%] bg-amber-400" />
                </div>
                <p className="mt-2 text-[10px] font-semibold text-amber-600">₹31,200 pending</p>
              </div>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-700">⚡ Action Required</p>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-600">3 items</span>
              </div>
              <div className="space-y-1.5">
                {actions.map((a) => (
                  <div key={a.text} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                    <div className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-md', a.cls)}><a.icon className="h-3 w-3" /></div>
                    <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700">{a.text}</p>
                    <span className="shrink-0 text-[10px] font-bold text-brand-600">{a.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating cards */}
      <div className="absolute -left-4 top-24 hidden animate-float rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200 sm:block lg:-left-12">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><IndianRupee className="h-4 w-4" /></div>
          <div>
            <p className="text-xs font-bold text-slate-800">Fee received ₹8,000</p>
            <p className="text-[10px] text-slate-500">Priya Verma · via UPI · just now</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -right-2 hidden max-w-[240px] animate-float rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200 [animation-delay:1.5s] sm:block lg:-right-10">
        <div className="flex items-start gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#25D366]/10 text-[#128C7E]"><MessageCircle className="h-4 w-4" /></div>
          <div>
            <p className="text-xs font-bold text-slate-800">Rahul was absent today</p>
            <p className="text-[10px] text-slate-500">Parent notified on WhatsApp ✓✓</p>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -top-5 hidden animate-float rounded-2xl bg-gradient-to-r from-brand-600 to-fuchsia-600 px-3 py-2 text-white shadow-glow [animation-delay:3s] md:block lg:-right-8">
        <p className="flex items-center gap-1.5 text-[11px] font-bold"><Sparkles className="h-3.5 w-3.5 text-amber-200" /> 5 reminders sent automatically</p>
      </div>
    </div>
  );
}

/* ────────────────────────── sections ────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-10 sm:pt-16">
      <div className="absolute inset-0 -z-10 grid-bg [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="absolute -top-40 left-1/2 -z-10 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-200/50 via-violet-200/50 to-fuchsia-200/50 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8">
        <div className="animate-fade-up text-center lg:text-left">
          <a href="#pricing" className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm backdrop-blur">
            <span className="rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-600 px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
            AI student insights are here <ArrowRight className="h-3 w-3" />
          </a>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl xl:text-6xl">
            Your Coaching Institute.<br /><span className="text-gradient">One Simple Dashboard.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600 lg:mx-0">
            Students, batches, attendance, fees, tests and parent updates — all in one place. Stop juggling registers, Excel sheets and WhatsApp groups.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link to="/register" className="btn-premium px-6 py-3.5 text-base">Start free trial <ArrowRight className="h-5 w-5" /></Link>
            <Link to="/login" className="btn-secondary px-6 py-3.5 text-base"><Play className="h-4 w-4 text-brand-600" /> Try live demo</Link>
          </div>
          <p className="mt-4 text-sm font-medium text-slate-500">✨ 30-day free pilot · No card needed · Setup in 10 minutes</p>
          <div className="mt-8 flex items-center justify-center gap-4 lg:justify-start">
            <div className="flex -space-x-2">
              {['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9'].map((c, i) => (
                <div key={c} className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ background: c }}>{['RS', 'AK', 'PM', 'SV', 'NJ'][i]}</div>
              ))}
            </div>
            <div className="text-left">
              <div className="flex text-amber-400">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
              <p className="text-xs text-slate-500">Loved by institute owners & teachers</p>
            </div>
          </div>
        </div>
        <div className="animate-fade-up [animation-delay:.15s]"><DashboardMockup /></div>
      </div>
    </section>
  );
}

function Problem() {
  const tools = [
    { icon: FileSpreadsheet, label: 'Excel sheets', cls: 'text-emerald-600 bg-emerald-50', rot: '-rotate-6' },
    { icon: NotebookPen, label: 'Paper registers', cls: 'text-amber-600 bg-amber-50', rot: 'rotate-3' },
    { icon: MessageSquare, label: 'WhatsApp groups', cls: 'text-green-600 bg-green-50', rot: '-rotate-2' },
    { icon: BookText, label: 'Fee diary', cls: 'text-rose-600 bg-rose-50', rot: 'rotate-6' },
  ];
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="The problem" title={<>Your institute runs on <span className="text-rose-500">4 different tools</span>.</>}
          text="Attendance in a register, fees in a diary, marks in Excel, parents on WhatsApp. Nothing talks to each other — and you spend evenings stitching it together." />
        <div className="mt-14 grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
          <div className="grid grid-cols-2 gap-4">
            {tools.map((t) => (
              <div key={t.label} className={clsx('card flex flex-col items-center gap-3 p-6 text-center transition hover:rotate-0', t.rot)}>
                <div className={clsx('grid h-12 w-12 place-items-center rounded-2xl', t.cls)}><t.icon className="h-6 w-6" /></div>
                <p className="text-sm font-bold text-slate-700">{t.label}</p>
                <p className="text-[11px] font-medium text-rose-500">Scattered · Manual · Error-prone</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <div className="grid h-14 w-14 rotate-90 place-items-center rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white shadow-glow lg:rotate-0">
              <ArrowRight className="h-6 w-6" />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-8 text-white shadow-glow">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <LogoMark className="h-12 w-12" />
            <h3 className="mt-5 text-2xl font-extrabold">One place for everything.</h3>
            <ul className="mt-5 space-y-3 text-sm">
              {['Mark attendance in 30 seconds', 'Every fee, receipt & due date tracked', 'Test marks & report cards auto-calculated', 'Parents updated automatically'].map((x) => (
                <li key={x} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/20"><Check className="h-3.5 w-3.5" /></span>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Promises() {
  const items = [
    { emoji: '📊', title: 'Know your institute', text: 'Attendance, fees, performance and pending work — see the full picture of your institute every morning in one glance.', cls: 'from-brand-500 to-violet-500' },
    { emoji: '💰', title: 'Collect fees on time', text: 'Automatic reminders go out before and after due dates. Parents pay online, receipts are generated instantly.', cls: 'from-emerald-500 to-teal-500' },
    { emoji: '👨‍👩‍👦', title: 'Keep parents informed', text: 'Absence alerts, test results and notices reach parents on WhatsApp, email and their own portal — automatically.', cls: 'from-fuchsia-500 to-pink-500' },
  ];
  return (
    <section className="relative bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Our promise" title="Three things CoachFlow does really well" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((it, i) => (
            <div key={it.title} className="card group relative overflow-hidden p-8 transition hover:-translate-y-1 hover:shadow-xl animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className={clsx('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', it.cls)} />
              <div className="text-5xl">{it.emoji}</div>
              <h3 className="mt-5 text-xl font-extrabold text-slate-900">{it.title}</h3>
              <p className="mt-3 leading-relaxed text-slate-500">{it.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const f = [
    { icon: GraduationCap, title: 'Students', text: 'Complete profiles, parent contacts, batches, fee status and progress history in one card.', cls: 'bg-brand-50 text-brand-600' },
    { icon: BookOpen, title: 'Batches', text: 'Timetables, rooms, teachers and capacity. See which batch needs attention.', cls: 'bg-sky-50 text-sky-600' },
    { icon: CalendarCheck, title: 'Attendance', text: 'One-tap attendance per batch. Streaks, trends and low-attendance alerts.', cls: 'bg-emerald-50 text-emerald-600' },
    { icon: IndianRupee, title: 'Fees & reminders', text: 'Installments, receipts, UPI payments and automatic reminders to parents.', cls: 'bg-amber-50 text-amber-600' },
    { icon: ClipboardList, title: 'Tests & marks', text: 'Enter marks quickly, get ranks, averages and pass rates instantly.', cls: 'bg-violet-50 text-violet-600' },
    { icon: Users, title: 'Parent portal', text: 'Parents see attendance, marks, fees and notices — no more phone calls.', cls: 'bg-pink-50 text-pink-600' },
    { icon: BellRing, title: 'Notifications', text: 'WhatsApp, Email and SMS alerts for absence, fees, results and announcements.', cls: 'bg-green-50 text-green-600' },
    { icon: BarChart3, title: 'Reports', text: 'Revenue, collections, attendance and performance reports. Export to Excel.', cls: 'bg-cyan-50 text-cyan-600' },
    { icon: Brain, title: 'AI insights', text: 'Spot at-risk students early and get plain-English suggestions on what to do.', cls: 'bg-fuchsia-50 text-fuchsia-600', badge: 'Premium' },
  ];
  return (
    <section id="features" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Features" title={<>Everything your institute needs. <span className="text-gradient">Nothing it doesn't.</span></>}
          text="Built with coaching owners in India — simple enough for any teacher, powerful enough to run a 500-student institute." />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {f.map((x) => (
            <div key={x.title} className="group relative rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/5">
              <div className="flex items-center justify-between">
                <div className={clsx('grid h-12 w-12 place-items-center rounded-2xl transition group-hover:scale-110', x.cls)}><x.icon className="h-6 w-6" /></div>
                {x.badge && <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-600 px-2.5 py-0.5 text-[11px] font-bold text-white"><Crown className="h-3 w-3" />{x.badge}</span>}
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{x.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{x.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Flow({ steps, tone }: { steps: { icon: typeof Bell; title: string; text: string }[]; tone: string }) {
  return (
    <div className="relative mt-6 space-y-4">
      <div className={clsx('absolute bottom-5 left-5 top-5 w-0.5 bg-gradient-to-b opacity-40', tone)} />
      {steps.map((s, i) => (
        <div key={i} className="relative flex gap-4">
          <div className={clsx('relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg', tone)}><s.icon className="h-5 w-5" /></div>
          <div className="flex-1 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-sm font-bold text-white">{s.title}</p>
            <p className="text-xs text-slate-400">{s.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  const flows = [
    {
      tag: 'Workflow 1', title: 'Teacher marks attendance → parent notified', tone: 'from-sky-500 to-cyan-500',
      steps: [
        { icon: Smartphone, title: 'Teacher opens the batch on phone', text: 'JEE Batch A · 32 students · 4:00 PM' },
        { icon: CalendarCheck, title: 'Taps Present / Absent', text: 'Done in 30 seconds, saved instantly' },
        { icon: MessageCircle, title: "Rahul's parent gets a WhatsApp", text: '“Rahul was absent today in JEE Batch A”' },
      ],
    },
    {
      tag: 'Workflow 2', title: 'Pending fee → automatic reminder', tone: 'from-amber-500 to-orange-500',
      steps: [
        { icon: IndianRupee, title: 'Installment due on 10th', text: '₹8,000 · Priya Verma · Installment 2' },
        { icon: BellRing, title: 'Reminder 3 days before & after', text: 'WhatsApp + email, sent automatically' },
        { icon: Check, title: 'Parent pays via UPI', text: 'Receipt generated, dashboard updated' },
      ],
    },
    {
      tag: 'Workflow 3', title: 'Owner sees the complete picture', tone: 'from-violet-500 to-fuchsia-500',
      steps: [
        { icon: LayoutDashboard, title: 'Open CoachFlow every morning', text: 'Students, attendance, fees at a glance' },
        { icon: AlertTriangle, title: '“Action Required” list', text: 'Overdue fees, absentees, pending marks' },
        { icon: Brain, title: 'AI flags at-risk students', text: 'Before they drop out or fall behind' },
      ],
    },
  ];
  return (
    <section id="how" className="relative scroll-mt-20 overflow-hidden bg-slate-950 py-20 sm:py-28">
      <div className="absolute left-1/2 top-0 h-96 w-[50rem] -translate-x-1/2 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle light eyebrow="How it works" title="Work happens once. Everyone stays updated." text="Here's what a normal day looks like with CoachFlow." />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {flows.map((f) => (
            <div key={f.tag} className="rounded-3xl bg-white/[0.04] p-6 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[0.07]">
              <p className={clsx('inline-block rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white', f.tone)}>{f.tag}</p>
              <h3 className="mt-4 text-lg font-extrabold text-white">{f.title}</h3>
              <Flow steps={f.steps} tone={f.tone} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhoFor() {
  const w = [
    { icon: Stethoscope, title: 'JEE / NEET coaching', text: 'Large batches, weekly tests, rank tracking.' },
    { icon: Landmark, title: 'SSC / Banking', text: 'Mock tests, installments, many batches.' },
    { icon: School, title: 'School tuition', text: 'Class-wise batches and regular parent updates.' },
    { icon: Languages, title: 'English speaking', text: 'Short courses, flexible timings, fast admissions.' },
    { icon: Code2, title: 'Computer & coding', text: 'Course-based fees, labs and certifications.' },
  ];
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Who it's for" title="Made for every kind of coaching institute" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {w.map((x) => (
            <div key={x.title} className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 text-center transition hover:-translate-y-1 hover:shadow-lg">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-glow"><x.icon className="h-6 w-6" /></div>
              <p className="mt-4 font-bold text-slate-900">{x.title}</p>
              <p className="mt-1 text-xs text-slate-500">{x.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-4 w-4" /></span>;
  if (v === false) return <Minus className="mx-auto h-4 w-4 text-slate-300" />;
  return <span className="text-sm font-semibold text-slate-700">{v}</span>;
}

function Pricing() {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [yearly, setYearly] = useState(false);
  useEffect(() => {
    api.get<Plan[]>('/public/plans').then(({ data }) => data?.length && setPlans(data)).catch(() => {});
  }, []);
  const popularKey = plans.find((p) => p.popular)?.key ?? 'premium';
  const baseline = ['Student management', 'Batch management', 'Attendance', 'Basic fees tracking'];

  return (
    <section id="pricing" className="relative scroll-mt-20 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Pricing" title="Simple pricing. Less than one student's monthly fee." text="Start with a 30-day free pilot with every Premium feature. Pick a plan only when you're convinced." />
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center rounded-full bg-white p-1 shadow-soft ring-1 ring-slate-200">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button key={c} onClick={() => setYearly(c === 'yearly')}
                className={clsx('rounded-full px-5 py-2 text-sm font-bold capitalize transition', (c === 'yearly') === yearly ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800')}>
                {c}{c === 'yearly' && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">2 months free</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {plans.map((p) => {
            const popular = p.key === popularKey;
            const price = yearly ? p.priceYearly : p.priceMonthly;
            const perks = p.features.map((f) => FEATURE_INFO[f]?.label).filter(Boolean);
            return (
              <div key={p.key} className={clsx('relative flex flex-col rounded-3xl p-7 transition',
                popular ? 'bg-gradient-to-b from-brand-600 via-violet-600 to-fuchsia-600 text-white shadow-2xl shadow-violet-500/30 lg:-my-4 lg:py-11' : 'bg-white ring-1 ring-slate-200 hover:shadow-xl')}>
                {popular && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-4 py-1 text-xs font-extrabold tracking-wide text-amber-950 shadow-lg">⭐ POPULAR</span>}
                <h3 className={clsx('text-xl font-extrabold', popular ? 'text-white' : 'text-slate-900')}>{p.name}</h3>
                <p className={clsx('mt-1 text-sm', popular ? 'text-white/75' : 'text-slate-500')}>{p.tagline}</p>
                <div className="mt-6 flex items-end gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">{rupee(price)}</span>
                  <span className={clsx('mb-1.5 text-sm', popular ? 'text-white/70' : 'text-slate-500')}>/{yearly ? 'year' : 'month'}</span>
                </div>
                <p className={clsx('mt-1 h-5 text-xs font-semibold', popular ? 'text-amber-200' : 'text-emerald-600')}>
                  {yearly ? `≈ ${rupee(Math.round(p.priceYearly / 12))}/month · save ${rupee(p.priceMonthly * 12 - p.priceYearly)}` : ''}
                </p>
                <div className={clsx('mt-5 grid grid-cols-2 gap-2 rounded-2xl p-3 text-center text-xs', popular ? 'bg-white/10' : 'bg-slate-50')}>
                  <div><p className="text-lg font-extrabold">{p.studentLimit}</p><p className={popular ? 'text-white/70' : 'text-slate-500'}>students</p></div>
                  <div><p className="text-lg font-extrabold">{p.teacherLimit}</p><p className={popular ? 'text-white/70' : 'text-slate-500'}>teachers</p></div>
                </div>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {[...baseline, ...perks].map((x) => (
                    <li key={x} className="flex items-start gap-2.5">
                      <Check className={clsx('mt-0.5 h-4 w-4 shrink-0', popular ? 'text-amber-200' : 'text-emerald-500')} />
                      <span className={popular ? 'text-white/90' : 'text-slate-600'}>{x}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={clsx('mt-8 w-full', popular ? 'btn bg-white text-brand-700 hover:bg-amber-50' : 'btn-secondary')}>
                  Start free trial <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-20">
          <h3 className="text-center text-xl font-extrabold text-slate-900">Compare all features</h3>
          <div className="card mt-6 overflow-hidden">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-2/5">Feature</th>
                    {plans.map((p) => <th key={p.key} className={clsx('text-center', p.key === popularKey && '!bg-brand-50 !text-brand-700')}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.label}>
                      <td className="font-medium text-slate-700">{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className={clsx('text-center', plans[i]?.key === popularKey && 'bg-brand-50/40')}><Cell v={v} /></td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="font-bold text-slate-900">Price</td>
                    {plans.map((p) => (
                      <td key={p.key} className={clsx('text-center font-extrabold text-slate-900', p.key === popularKey && 'bg-brand-50/40')}>
                        {rupee(yearly ? p.priceYearly : p.priceMonthly)}<span className="text-xs font-medium text-slate-400">/{yearly ? 'yr' : 'mo'}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const t = [
    { name: 'Rajesh Sharma', role: 'JEE/NEET institute, Jaipur', color: '#6366f1', text: 'Fee collection went from “chasing parents every week” to “reminders go out by themselves”. My pending fees dropped a lot within the first month.' },
    { name: 'Anita Kulkarni', role: 'School tuition, Pune', color: '#ec4899', text: 'Parents stopped calling to ask about attendance and marks — they just see it in the portal. My teachers love how quick attendance is.' },
    { name: 'Mohd. Imran', role: 'SSC/Banking academy, Lucknow', color: '#10b981', text: 'I finally know which batch is profitable and which students need help. The morning dashboard is the first thing I open.' },
  ];
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Stories" title="What institute owners tell us" text={<span className="text-sm">Illustrative examples of the outcomes CoachFlow is built for.</span>} />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {t.map((x) => (
            <figure key={x.name} className="card flex flex-col p-7">
              <div className="flex text-amber-400">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
              <blockquote className="mt-4 flex-1 leading-relaxed text-slate-600">“{x.text}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white" style={{ background: x.color }}>{x.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{x.name}</p>
                  <p className="text-xs text-slate-500">{x.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    { q: 'Is there really a free trial?', a: 'Yes. Every new institute gets a 30-day free pilot with all Premium features. No credit card is needed to start.' },
    { q: 'Do my teachers and parents need to install an app?', a: 'No. CoachFlow works in any browser on phone, tablet or computer. Teachers and parents simply log in with their email.' },
    { q: 'How do WhatsApp notifications work?', a: 'On Growth and Premium plans, CoachFlow sends absence alerts, fee reminders and results to parents through a WhatsApp Business provider connected to your account.' },
    { q: 'Can I import my existing students?', a: 'Yes. You can add students one by one or bulk-import them from your existing Excel sheet in a few minutes.' },
    { q: 'Is my data safe?', a: 'Your data is stored securely and isolated per institute. Only people you invite can see it, and you can export it any time.' },
    { q: 'Can I change or cancel my plan later?', a: 'Anytime. Upgrade, downgrade or cancel from the Subscription page — no calls, no lock-in.' },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="FAQ" title="Questions? We've got answers." />
        <div className="mt-12 space-y-3">
          {qs.map((x, i) => (
            <div key={x.q} className={clsx('overflow-hidden rounded-2xl border bg-white transition', open === i ? 'border-brand-200 shadow-soft' : 'border-slate-200')}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-bold text-slate-900">{x.q}</span>
                <ChevronDown className={clsx('h-5 w-5 shrink-0 text-slate-400 transition', open === i && 'rotate-180 text-brand-600')} />
              </button>
              {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600 animate-fade-up">{x.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 via-violet-700 to-fuchsia-700 px-6 py-16 text-center text-white shadow-glow sm:px-12">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="relative">
          <Zap className="mx-auto h-10 w-10 text-amber-300" />
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">Give your institute the dashboard it deserves.</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">Set up in 10 minutes. Try every Premium feature free for 30 days.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className="btn bg-white px-6 py-3.5 text-base text-brand-700 hover:bg-amber-50">Start free trial <ArrowRight className="h-5 w-5" /></Link>
            <Link to="/login" className="btn border border-white/30 px-6 py-3.5 text-base text-white hover:bg-white/10">See the live demo</Link>
          </div>
          <p className="mt-4 text-sm text-white/70">30-day free pilot · No card needed</p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { h: 'Product', l: [['Features', '#features'], ['How it works', '#how'], ['Pricing', '#pricing'], ['FAQ', '#faq']] },
    { h: 'Account', l: [['Login', '/login'], ['Start free trial', '/register']] },
  ];
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1.2fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-slate-500">Your Coaching Institute. One Simple Dashboard. Made in India for coaching institutes.</p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <p className="text-sm font-bold text-slate-900">{c.h}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.l.map(([label, href]) => (
                <li key={label}>{href.startsWith('#') ? <a href={href} className="text-slate-500 hover:text-brand-600">{label}</a> : <Link to={href} className="text-slate-500 hover:text-brand-600">{label}</Link>}</li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-sm font-bold text-slate-900">Contact</p>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> hello@coachflow.in</li>
            <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp support</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} CoachFlow. All rights reserved.</div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = ''; };
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/70 via-white to-white bg-[length:100%_900px] bg-no-repeat text-slate-800">
      <Navbar />
      <Hero />
      <Problem />
      <Promises />
      <Features />
      <HowItWorks />
      <WhoFor />
      <Pricing />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
