import { ArrowRight, BellRing, CalendarCheck, GraduationCap, IndianRupee, Lock, Mail, ShieldCheck, Sparkles, UserSquare2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, clsx } from '../components/ui';
import { homeFor, useAuth } from '../context/AuthContext';
import { errMsg } from '../lib/api';

const DEMOS = [
  { role: 'Owner', email: 'owner@coachflow.in', password: 'owner123', icon: GraduationCap, cls: 'from-brand-500 to-violet-500', hint: 'Full institute dashboard' },
  { role: 'Teacher', email: 'teacher@coachflow.in', password: 'teacher123', icon: UserSquare2, cls: 'from-sky-500 to-cyan-500', hint: 'Attendance & marks' },
  { role: 'Parent', email: 'parent@coachflow.in', password: 'parent123', icon: Users, cls: 'from-emerald-500 to-teal-500', hint: 'Parent portal' },
  { role: 'Super Admin', email: 'admin@coachflow.in', password: 'admin123', icon: ShieldCheck, cls: 'from-amber-500 to-orange-500', hint: 'SaaS control panel' },
];

function BrandPanel() {
  const points = [
    { icon: CalendarCheck, title: 'Attendance in 30 seconds', text: 'Parents are notified the moment a child is absent.' },
    { icon: IndianRupee, title: 'Fees collected on time', text: 'Automatic reminders before and after due dates.' },
    { icon: BellRing, title: 'Parents always in the loop', text: 'Marks, fees and notices on WhatsApp, email & portal.' },
  ];
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-violet-800 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-500/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-400/25 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="relative"><Logo light /></div>
      <div className="relative max-w-md">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Trusted by coaching institutes across India
        </p>
        <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">
          Your Coaching Institute.<br />
          <span className="bg-gradient-to-r from-amber-200 via-pink-200 to-violet-200 bg-clip-text text-transparent">One Simple Dashboard.</span>
        </h2>
        <ul className="mt-8 space-y-5">
          {points.map((p) => (
            <li key={p.title} className="flex gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15"><p.icon className="h-5 w-5" /></div>
              <div>
                <p className="font-bold">{p.title}</p>
                <p className="text-sm text-white/70">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur">
        <p className="text-sm leading-relaxed text-white/90">“Earlier I spent every Sunday chasing fees on WhatsApp. Now reminders go out on their own and I just check the dashboard.”</p>
        <p className="mt-3 text-xs font-semibold text-white/60">— Institute owner, Jaipur (illustrative)</p>
      </div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const doLogin = async (em: string, pw: string, key: string) => {
    setBusy(key);
    try {
      const s = await login(em.trim(), pw);
      toast.success(`Welcome back, ${s.user.name.split(' ')[0]}!`);
      const next = params.get('next');
      navigate(next && next.startsWith('/') ? next : homeFor(s.user.role), { replace: true });
    } catch (e) {
      toast.error(errMsg(e, 'Login failed'));
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    doLogin(email, password, 'form');
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <BrandPanel />
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <p className="text-sm text-slate-500">New here? <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">Start free trial</Link></p>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Welcome back 👋</h1>
          <p className="mt-2 text-sm text-slate-500">Log in to manage your institute.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-10" type="email" required autoComplete="email" placeholder="you@institute.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </label>
            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-10" type="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </label>
            <Button type="submit" className="w-full py-3" loading={busy === 'form'} disabled={!!busy}>
              Log in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wider text-brand-700">Demo accounts</p>
              <p className="text-xs text-slate-500">One click to explore</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMOS.map((d) => (
                <button key={d.role} type="button" disabled={!!busy}
                  onClick={() => { setEmail(d.email); setPassword(d.password); doLogin(d.email, d.password, d.role); }}
                  className={clsx('group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft disabled:opacity-60')}>
                  <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white', d.cls)}>
                    {busy === d.role ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <d.icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{d.role}</p>
                    <p className="truncate text-[11px] text-slate-500">{d.hint}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">© {new Date().getFullYear()} CoachFlow · <Link to="/" className="hover:text-slate-600">Back to home</Link></p>
      </div>
    </div>
  );
}
