import { Check, Crown, Lock, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FEATURE_INFO } from '../lib/features';
import type { FeatureKey } from '../lib/types';
import { clsx } from './ui';

/** Big dashboard "CoachFlow Premium" card. */
export function PremiumCard({ price = 1499, className }: { price?: number; className?: string }) {
  const perks = ['Automated fee reminders', 'WhatsApp communication', 'Advanced reports', 'Parent portal', 'Online fee collection', 'AI Student Insights', 'Custom institute branding'];
  return (
    <div className={clsx('relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-violet-700 to-fuchsia-700 p-6 text-white shadow-glow', className)}>
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-fuchsia-400/20 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
          <Sparkles className="h-4 w-4" /> CoachFlow Premium
        </div>
        <h3 className="mt-3 text-xl font-extrabold leading-snug">Unlock the full power of your institute</h3>
        <ul className="mt-4 grid gap-2 text-sm text-white/90">
          {perks.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15"><Check className="h-3 w-3" /></span>
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-end gap-1">
          <span className="text-3xl font-extrabold">₹{price.toLocaleString('en-IN')}</span>
          <span className="mb-1 text-sm text-white/70">/ month</span>
        </div>
        <Link to="/app/subscription" className="btn mt-4 w-full bg-white text-brand-700 hover:bg-amber-50">
          <Crown className="h-4 w-4" /> Upgrade to Premium
        </Link>
      </div>
    </div>
  );
}

/** Contextual, in-page upgrade nudge (e.g. "STOP CHASING FEES MANUALLY"). */
export function UpgradeCard({ emoji = '✨', title, text, cta = 'Upgrade', compact, className }: { emoji?: string; title: string; text: ReactNode; cta?: string; compact?: boolean; className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-brand-50 via-violet-50 to-fuchsia-50', compact ? 'p-4' : 'p-5', className)}>
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-200/40 blur-xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm">{emoji}</div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">{title}</p>
            <p className="mt-0.5 text-sm text-slate-600">{text}</p>
          </div>
        </div>
        <Link to="/app/subscription" className="btn-premium shrink-0">{cta}</Link>
      </div>
    </div>
  );
}

/** Renders children when the plan has the feature; otherwise a locked panel. */
export function FeatureGate({ feature, children, title, text }: { feature: FeatureKey; children: ReactNode; title?: string; text?: string }) {
  const { hasFeature } = useAuth();
  if (hasFeature(feature)) return <>{children}</>;
  const info = FEATURE_INFO[feature];
  return (
    <div className="card card-pad relative overflow-hidden text-center">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="relative mx-auto max-w-md py-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 text-white shadow-glow">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="mt-5 text-xl font-extrabold text-slate-900">{title ?? `Unlock ${info.label}`}</h3>
        <p className="mt-2 text-sm text-slate-500">{text ?? `${info.label} is available on the ${info.minPlan === 'premium' ? 'Premium' : 'Growth & Premium'} plans.`}</p>
        <Link to="/app/subscription" className="btn-premium mt-6"><Crown className="h-4 w-4" /> See plans</Link>
      </div>
    </div>
  );
}
