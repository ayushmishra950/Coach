import { ArrowRight, Check, Crown, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Input, Select } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../lib/api';

const TYPES = ['School Tuition', 'JEE/NEET', 'SSC/Banking', 'English Speaking', 'Computer Institute', 'Coding Academy', 'Other'];

function BrandPanel() {
  const perks = ['Unlimited access to every Premium feature', 'Automatic fee reminders to parents', 'WhatsApp, email & SMS notifications', 'Parent portal & AI student insights', 'Set up in under 10 minutes'];
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-900 via-brand-800 to-fuchsia-800 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
      <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand-400/30 blur-3xl" />
      <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-fuchsia-500/30 blur-3xl" />
      <div className="relative"><Logo light /></div>
      <div className="relative max-w-md">
        <p className="inline-flex items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200 ring-1 ring-amber-200/30">
          <Crown className="h-3.5 w-3.5" /> 30-day free Premium trial
        </p>
        <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">Run your whole institute from one screen.</h2>
        <p className="mt-3 text-white/70">Students, batches, attendance, fees, tests and parents — organised in minutes, not months.</p>
        <ul className="mt-8 space-y-3">
          {perks.map((p) => (
            <li key={p} className="flex items-center gap-3 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-300/30"><Check className="h-3.5 w-3.5" /></span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex items-center gap-3 text-sm text-white/70">
        <ShieldCheck className="h-5 w-5 text-emerald-300" /> No credit card needed · Cancel anytime · Your data stays yours
      </div>
    </div>
  );
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ instituteName: '', ownerName: '', email: '', phone: '', city: '', type: 'School Tuition', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (f.password !== f.confirm) return toast.error('Passwords do not match');
    setBusy(true);
    try {
      const { confirm: _confirm, ...body } = f;
      await register(body);
      toast.success('Your institute is ready! Enjoy 30 days of Premium 🎉');
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error(errMsg(err, 'Could not create your account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <BrandPanel />
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <p className="text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Log in</Link></p>
        </div>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10 animate-fade-up">
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-r from-brand-50 to-fuchsia-50 px-3 py-1 text-xs font-bold text-violet-700 ring-1 ring-violet-200 lg:hidden">
            <Sparkles className="h-3.5 w-3.5" /> 30-day free Premium trial
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Create your institute</h1>
          <p className="mt-2 text-sm text-slate-500">Start your <b className="text-slate-700">30-day free Premium trial</b>. No card needed.</p>

          <form onSubmit={submit} className="mt-8 grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Institute name" required placeholder="e.g. Bright Future Classes" value={f.instituteName} onChange={set('instituteName')} />
            <Input label="Your name" required placeholder="Rajesh Sharma" value={f.ownerName} onChange={set('ownerName')} />
            <Input label="Phone" type="tel" placeholder="98765 43210" value={f.phone} onChange={set('phone')} />
            <Input className="sm:col-span-2" label="Email" type="email" required autoComplete="email" placeholder="you@institute.com" value={f.email} onChange={set('email')} />
            <Input label="City" placeholder="Jaipur" value={f.city} onChange={set('city')} />
            <Select label="Institute type" value={f.type} onChange={set('type')}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Input label="Password" type="password" required autoComplete="new-password" placeholder="At least 8 characters" hint="Use 8+ characters" value={f.password} onChange={set('password')} />
            <Input label="Confirm password" type="password" required autoComplete="new-password" placeholder="Type it again" value={f.confirm} onChange={set('confirm')} />
            <Button type="submit" variant="premium" className="py-3 sm:col-span-2" loading={busy}>
              Start my free trial <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-center text-xs text-slate-400 sm:col-span-2">By signing up you agree to our Terms and Privacy Policy.</p>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400">© {new Date().getFullYear()} CoachFlow · <Link to="/" className="hover:text-slate-600">Back to home</Link></p>
      </div>
    </div>
  );
}
