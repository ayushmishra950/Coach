import { Building2, CalendarPlus, GraduationCap, Mail, Phone, Settings2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput, Select, Skeleton, StatusBadge, Tabs, clsx,
  type BadgeTone,
} from '../../components/ui';
import { useApi, useDebounced } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, initials, inr } from '../../lib/format';
import type { Plan, PlanKey } from '../../lib/types';

type InstStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';

interface AdminInstitute {
  _id: string; name: string; ownerName?: string; email?: string; phone?: string; city?: string; type?: string;
  brandColor?: string; logoText?: string; plan: PlanKey; billingCycle?: 'monthly' | 'yearly'; status: InstStatus;
  trialEndsAt?: string; currentPeriodEnd?: string; createdAt: string;
  effectivePlan: PlanKey; students: number; teachers: number; mrr: number;
}

const STATUS_TABS: { value: 'all' | InstStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'suspended', label: 'Suspended' },
];

const PLAN_TONE: Record<PlanKey, BadgeTone> = { starter: 'gray', growth: 'blue', premium: 'violet' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function PlanBadge({ plan }: { plan: PlanKey }) {
  return <Badge tone={PLAN_TONE[plan] ?? 'gray'}>{cap(plan)}</Badge>;
}

function daysUntil(d?: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default function AdminInstitutes() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | InstStatus>('all');
  const [plan, setPlan] = useState<'all' | PlanKey>('all');
  const q = useDebounced(search, 350);
  const { data, loading, error, reload } = useApi<AdminInstitute[]>('/admin/institutes', { search: q || undefined, status, plan });
  const { data: planData } = useApi<{ plans: Plan[] }>('/admin/plans');
  const [managing, setManaging] = useState<AdminInstitute | null>(null);

  const rows = data ?? [];
  const totals = useMemo(() => ({
    mrr: rows.reduce((s, r) => s + r.mrr, 0),
    students: rows.reduce((s, r) => s + r.students, 0),
  }), [rows]);

  return (
    <div>
      <PageHeader
        title="Institutes"
        subtitle="Every coaching institute on CoachFlow — subscriptions, usage and account controls."
        actions={
          <div className="flex gap-2 text-sm">
            <span className="badge bg-white px-3 py-1.5 text-slate-600 ring-1 ring-slate-200">{rows.length} shown</span>
            <span className="badge bg-brand-50 px-3 py-1.5 text-brand-700">MRR {inr(totals.mrr)}</span>
          </div>
        }
      />

      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs tabs={STATUS_TABS} value={status} onChange={setStatus} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, city, email…" className="sm:w-72" />
            <select className="input sm:w-40" value={plan} onChange={(e) => setPlan(e.target.value as 'all' | PlanKey)}>
              <option value="all">All plans</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="premium">Premium</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Building2 className="h-7 w-7" />} title="No institutes found" text="Try a different search or filter." />
        ) : (
          <div className={clsx('table-wrap scrollbar-thin transition-opacity', loading && 'opacity-60')}>
            <table className="table">
              <thead>
                <tr>
                  <th>Institute</th><th>Owner</th><th>Plan</th><th>Status</th><th>Billing</th>
                  <th className="text-right">Students</th><th className="text-right">Teachers</th><th className="text-right">MRR</th>
                  <th>Joined</th><th>Trial ends</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const tl = i.status === 'trial' ? daysUntil(i.trialEndsAt) : null;
                  return (
                    <tr key={i._id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white shadow-sm"
                            style={{ background: `linear-gradient(135deg, ${i.brandColor || '#6366f1'}, ${i.brandColor || '#6366f1'}bb)` }}>
                            {i.logoText || initials(i.name)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{i.name}</p>
                            <p className="text-xs text-slate-500">{[i.city, i.type].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="font-medium text-slate-800">{i.ownerName || '—'}</p>
                        <p className="text-xs text-slate-500">{i.email}</p>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <PlanBadge plan={i.plan} />
                          {i.effectivePlan !== i.plan && (
                            <span className="text-[11px] font-medium text-slate-400">effective: <b className="text-slate-600">{cap(i.effectivePlan)}</b></span>
                          )}
                        </div>
                      </td>
                      <td><StatusBadge status={i.status} /></td>
                      <td className="capitalize text-slate-600">{i.billingCycle ?? 'monthly'}</td>
                      <td className="text-right font-semibold text-slate-800">{i.students}</td>
                      <td className="text-right font-semibold text-slate-800">{i.teachers}</td>
                      <td className="text-right font-bold text-slate-900">{i.mrr ? inr(i.mrr) : <span className="text-slate-300">—</span>}</td>
                      <td className="text-slate-600">{fmtDate(i.createdAt)}</td>
                      <td>
                        {i.trialEndsAt ? (
                          <div>
                            <p className="text-slate-600">{fmtDate(i.trialEndsAt)}</p>
                            {tl != null && (
                              <p className={clsx('text-[11px] font-semibold', tl <= 0 ? 'text-rose-600' : tl <= 3 ? 'text-amber-600' : 'text-emerald-600')}>
                                {tl <= 0 ? 'Expired' : `${tl} day${tl === 1 ? '' : 's'} left`}
                              </p>
                            )}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-right">
                        <Button size="sm" variant="secondary" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setManaging(i)}>Manage</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ManageModal inst={managing} plans={planData?.plans ?? []} onClose={() => setManaging(null)} onSaved={() => { setManaging(null); reload(); }} />
    </div>
  );
}

function ManageModal({ inst, plans, onClose, onSaved }: { inst: AdminInstitute | null; plans: Plan[]; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<PlanKey>('starter');
  const [status, setStatus] = useState<InstStatus>('active');
  const [extend, setExtend] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (inst) {
      setPlan(inst.plan);
      setStatus(inst.status);
      setExtend('');
    }
  }, [inst]);

  if (!inst) return null;
  const planInfo = plans.find((p) => p.key === plan);
  const extendDays = Number(extend) || 0;
  const dirty = plan !== inst.plan || status !== inst.status || extendDays > 0;

  const save = async () => {
    const body: { plan?: PlanKey; status?: InstStatus; extendTrialDays?: number } = {};
    if (plan !== inst.plan) body.plan = plan;
    if (status !== inst.status) body.status = status;
    if (extendDays > 0) body.extendTrialDays = extendDays;
    setSaving(true);
    try {
      await api.put(`/admin/institutes/${inst._id}`, body);
      toast.success(`${inst.name} updated`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const usage = (used: number, limit?: number) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : 0);

  return (
    <Modal open={!!inst} onClose={onClose} size="lg" title={`Manage ${inst.name}`} subtitle={[inst.city, inst.type].filter(Boolean).join(' · ')}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!dirty} onClick={save}>Save changes</Button></>}>
      <div className="space-y-6">
        {/* Account */}
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 text-slate-600"><Users className="h-4 w-4 text-slate-400" /> {inst.ownerName || '—'}</p>
          <p className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-slate-400" /> {inst.email || '—'}</p>
          <p className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-slate-400" /> {inst.phone || '—'}</p>
          <p className="flex items-center gap-2 text-slate-600"><CalendarPlus className="h-4 w-4 text-slate-400" /> Joined {fmtDate(inst.createdAt)}</p>
        </div>

        {/* Usage */}
        <div>
          <p className="label">Usage vs {planInfo?.name ?? cap(plan)} limits</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { l: 'Students', v: inst.students, lim: planInfo?.studentLimit, icon: <GraduationCap className="h-4 w-4" /> },
              { l: 'Teachers', v: inst.teachers, lim: planInfo?.teacherLimit, icon: <Users className="h-4 w-4" /> },
            ].map((u) => (
              <div key={u.l} className="rounded-2xl border border-slate-200 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{u.icon}{u.l}</p>
                <p className="mt-1 text-lg font-extrabold text-slate-900">{u.v}<span className="text-sm font-medium text-slate-400"> / {u.lim ?? '—'}</span></p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={clsx('h-full rounded-full', usage(u.v, u.lim) >= 90 ? 'bg-rose-500' : 'bg-brand-500')} style={{ width: `${usage(u.v, u.lim)}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500">Current MRR</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">{inr(inst.mrr)}</p>
              <p className="text-xs capitalize text-slate-500">{inst.billingCycle ?? 'monthly'} billing</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>Effective plan: <b className="text-slate-700">{cap(inst.effectivePlan)}</b></span>
            <span>Trial ends: <b className="text-slate-700">{fmtDate(inst.trialEndsAt)}</b></span>
            <span>Period ends: <b className="text-slate-700">{fmtDate(inst.currentPeriodEnd)}</b></span>
          </div>
        </div>

        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)}>
            {(plans.length ? plans : (['starter', 'growth', 'premium'] as PlanKey[]).map((k) => ({ key: k, name: cap(k), priceMonthly: 0 }))).map((p) => (
              <option key={p.key} value={p.key}>{p.name}{p.priceMonthly ? ` — ${inr(p.priceMonthly)}/mo` : ''}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as InstStatus)}>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>

        <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input label="Extend trial by (days)" type="number" min={1} max={365} placeholder="e.g. 7" value={extend}
              onChange={(e) => setExtend(e.target.value)} className="sm:w-48" />
            <div className="flex gap-2">
              {[7, 14, 30].map((d) => (
                <Button key={d} size="sm" variant={extendDays === d ? 'primary' : 'secondary'} onClick={() => setExtend(String(d))}>+{d}d</Button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Extending the trial also sets the status to <b>Trial</b>. Days are added to the current trial end (or today if already expired).</p>
        </div>

        {status === 'suspended' && inst.status !== 'suspended' && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">Suspending blocks all users of this institute from accessing CoachFlow.</p>
        )}
      </div>
    </Modal>
  );
}
