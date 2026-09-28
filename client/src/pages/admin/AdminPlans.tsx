import { Check, Crown, Info, Rocket, Save, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, ErrorState, Input, PageHeader, Skeleton, Toggle, clsx } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { FEATURE_INFO } from '../../lib/features';
import { inr } from '../../lib/format';
import type { FeatureKey, Plan } from '../../lib/types';

const ICONS = { starter: Rocket, growth: Sparkles, premium: Crown } as const;
const GRADIENT = { starter: 'from-slate-500 to-slate-700', growth: 'from-sky-500 to-brand-500', premium: 'from-brand-600 via-violet-600 to-fuchsia-600' } as const;

type NumKey = 'priceMonthly' | 'priceYearly' | 'studentLimit' | 'teacherLimit' | 'whatsappLimit';
/** Number fields are kept as the typed string ('' and '-' are allowed mid-edit) and validated on save. */
type Draft = Omit<Plan, '_id' | 'order' | NumKey> & Record<NumKey, string>;
const toDraft = (p: Plan): Draft => ({
  key: p.key, name: p.name, tagline: p.tagline ?? '', priceMonthly: String(p.priceMonthly), priceYearly: String(p.priceYearly),
  studentLimit: String(p.studentLimit), teacherLimit: String(p.teacherLimit), features: [...p.features], whatsappLimit: String(p.whatsappLimit ?? 0), popular: !!p.popular,
});
/** '' / '-' / '1.5' → NaN-safe number (NaN when not a number yet). */
const toNum = (v: string) => (v.trim() === '' || v.trim() === '-' ? NaN : Number(v));

export default function AdminPlans() {
  const { data, loading, error, reload } = useApi<{ plans: Plan[]; featureKeys: FeatureKey[] }>('/admin/plans');

  return (
    <div>
      <PageHeader title="Plans & pricing" subtitle="Configure subscription tiers, limits and feature entitlements." />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-brand-900">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <div>
          <p className="font-semibold">Changes go live immediately</p>
          <p className="text-brand-800/80">Prices here update the public pricing page and subscription checkout instantly. Feature changes apply to every institute on that plan on their next request.</p>
          <p className="mt-1 text-brand-800/80"><b>Price changes and existing subscribers:</b> institutes already on a plan keep their current period and are charged the new price from their next renewal.</p>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[640px]" />)}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {data!.plans.map((p) => <PlanEditor key={p.key} plan={p} featureKeys={data!.featureKeys} onSaved={reload} />)}
        </div>
      )}
    </div>
  );
}

const NUM_FIELDS = [
  ['priceMonthly', 'Monthly price'], ['priceYearly', 'Yearly price'], ['studentLimit', 'Student limit'],
  ['teacherLimit', 'Teacher limit'], ['whatsappLimit', 'WhatsApp limit'],
] as const;
const isWhole = (v: string, min: number) => { const n = toNum(v); return Number.isInteger(n) && n >= min && n <= 10_000_000; };

function PlanEditor({ plan, featureKeys, onSaved }: { plan: Plan; featureKeys: FeatureKey[]; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(plan));
  const [saving, setSaving] = useState(false);
  // Reloading after another card saves hands every card a new `plan` object. Only re-sync this card when
  // its plan data really changed, and never over edits the admin hasn't saved yet.
  const lastPlan = useRef(JSON.stringify(toDraft(plan)));
  useEffect(() => {
    const next = JSON.stringify(toDraft(plan));
    if (next === lastPlan.current) return;
    const prev = lastPlan.current;
    lastPlan.current = next;
    setD((cur) => (JSON.stringify(cur) === prev ? toDraft(plan) : cur));
  }, [plan]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (k: NumKey) => (e: ChangeEvent<HTMLInputElement>) => set(k, e.target.value);
  const errHint = (k: (typeof NUM_FIELDS)[number][0]) => (isWhole(d[k], k === 'whatsappLimit' ? -1 : 0) ? undefined : 'Whole number only');
  const toggleFeature = (f: FeatureKey) => set('features', d.features.includes(f) ? d.features.filter((x) => x !== f) : [...d.features, f]);

  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(plan));
  const n = (k: NumKey) => { const v = toNum(d[k]); return Number.isFinite(v) ? v : 0; };
  const monthsFree = n('priceMonthly') > 0 ? Math.round((12 - n('priceYearly') / n('priceMonthly')) * 10) / 10 : 0;
  const savingPct = n('priceMonthly') > 0 ? Math.round((1 - n('priceYearly') / (n('priceMonthly') * 12)) * 100) : 0;
  const Icon = ICONS[plan.key] ?? Rocket;

  const save = async () => {
    if (!d.name.trim()) return toast.error('Plan name is required');
    const bad = NUM_FIELDS.find(([k]) => !isWhole(d[k], k === 'whatsappLimit' ? -1 : 0));
    if (bad) return toast.error(`${bad[1]} must be a whole number${bad[0] === 'whatsappLimit' ? ' (-1 = unlimited)' : ' (0 or more)'}`);
    setSaving(true);
    try {
      const { key: _key, ...rest } = d;
      const body = { ...rest, ...Object.fromEntries(NUM_FIELDS.map(([k]) => [k, toNum(d[k])])) };
      await api.put(`/admin/plans/${plan.key}`, body);
      toast.success(`${d.name} plan saved`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={clsx('card relative flex flex-col overflow-hidden', d.popular && 'ring-2 ring-brand-500')}>
      <div className={clsx('bg-gradient-to-br p-5 text-white', GRADIENT[plan.key])}>
        <div className="flex items-start justify-between">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur"><Icon className="h-5 w-5" /></div>
          <div className="flex gap-1.5">
            {d.popular && <span className="badge bg-white/20 text-white">★ Most popular</span>}
            {dirty && <span className="badge bg-amber-400 text-amber-950">Unsaved</span>}
          </div>
        </div>
        <p className="mt-4 text-xl font-extrabold">{d.name || 'Untitled'}</p>
        <p className="text-sm text-white/75">{d.tagline || '—'}</p>
        <p className="mt-3"><span className="text-3xl font-extrabold">{inr(n('priceMonthly'))}</span><span className="text-sm text-white/70">/month</span></p>
        <p className="text-xs text-white/70">or {inr(n('priceYearly'))}/year</p>
      </div>

      <div className="flex-1 space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={d.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Key" value={plan.key} disabled />
        </div>
        <Input label="Tagline" value={d.tagline} onChange={(e) => set('tagline', e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Monthly (₹)" type="number" min={0} step={1} value={d.priceMonthly} onChange={num('priceMonthly')} hint={errHint('priceMonthly')} />
          <Input label="Yearly (₹)" type="number" min={0} step={1} value={d.priceYearly} onChange={num('priceYearly')} hint={errHint('priceYearly')} />
        </div>
        <div className={clsx('rounded-xl px-3 py-2 text-xs font-medium', monthsFree > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
          {monthsFree > 0
            ? <>Yearly ≈ <b>{monthsFree} months free</b> ({savingPct}% off) · {inr(n('priceYearly') / 12)}/mo effective</>
            : 'Yearly price gives no discount over monthly billing.'}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Students" type="number" min={0} step={1} value={d.studentLimit} onChange={num('studentLimit')} hint={errHint('studentLimit')} />
          <Input label="Teachers" type="number" min={0} step={1} value={d.teacherLimit} onChange={num('teacherLimit')} hint={errHint('teacherLimit')} />
          <Input label="WhatsApp/mo" type="number" min={-1} step={1} value={d.whatsappLimit} onChange={num('whatsappLimit')}
            hint={errHint('whatsappLimit') ?? (toNum(d.whatsappLimit) === -1 ? 'Unlimited' : toNum(d.whatsappLimit) === 0 ? 'Disabled' : '-1 = unlimited')} />
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <Toggle checked={d.popular} onChange={(v) => set('popular', v)} label="Mark as most popular" description="Highlighted on the pricing page (only one plan)." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Features</span>
            <Badge tone="brand">{d.features.length}/{featureKeys.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {featureKeys.map((f) => {
              const on = d.features.includes(f);
              return (
                <button key={f} type="button" onClick={() => toggleFeature(f)}
                  className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition',
                    on ? 'border-brand-200 bg-brand-50/60 text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                  <span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition',
                    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 font-medium">{FEATURE_INFO[f]?.label ?? f}</span>
                  {FEATURE_INFO[f] && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{FEATURE_INFO[f].minPlan}+</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-100 p-4">
        <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={!dirty || saving} onClick={() => setD(toDraft(plan))}>Reset</Button>
        <Button className="flex-1" variant={plan.key === 'premium' ? 'premium' : 'primary'} icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={save}>
          Save {d.name || 'plan'}
        </Button>
      </div>
    </div>
  );
}
