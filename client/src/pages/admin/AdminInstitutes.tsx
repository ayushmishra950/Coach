import {
  Ban, Building2, CalendarPlus, Copy, Eye, GraduationCap, History, KeyRound, LifeBuoy, Mail, Phone, PlayCircle, Receipt, RotateCcw, Settings2, Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput, Select, Skeleton, StatusBadge, Tabs, Textarea, clsx,
  type BadgeTone,
} from '../../components/ui';
import { Pager } from '../../components/Pager';
import { useApi, useDebounced, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtDateTime, initials, inr, timeAgo } from '../../lib/format';
import type { Plan, PlanKey } from '../../lib/types';

type InstStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';

interface AdminInstitute {
  _id: string; name: string; ownerName?: string; email?: string; phone?: string; city?: string; type?: string;
  brandColor?: string; logoText?: string; plan: PlanKey; billingCycle?: 'monthly' | 'yearly'; status: InstStatus;
  trialEndsAt?: string; currentPeriodEnd?: string; createdAt: string;
  effectivePlan: PlanKey; students: number; teachers: number; mrr: number;
  suspendedAt?: string; suspendedReason?: string; statusBeforeSuspend?: InstStatus;
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
  // Paged server-side; changing search/status/plan goes back to page 1 automatically.
  const list = usePagedApi<AdminInstitute, { mrr: number }>('/admin/institutes', { search: q || undefined, status, plan });
  const { data, loading, error, reload } = list;
  const { data: planData } = useApi<{ plans: Plan[] }>('/admin/plans');
  const [managing, setManaging] = useState<AdminInstitute | null>(null);
  const [suspending, setSuspending] = useState<AdminInstitute | null>(null);
  const [reactivating, setReactivating] = useState<AdminInstitute | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const afterChange = () => reload();
  // (usePagedApi steps back automatically if a suspend/reactivate empties the current filtered page.)

  return (
    <div>
      <PageHeader
        title="Institutes"
        subtitle="Every coaching institute on CoachFlow — subscriptions, usage and account controls."
        actions={
          <div className="flex gap-2 text-sm">
            <span className="badge bg-white px-3 py-1.5 text-slate-600 ring-1 ring-slate-200">{total} {total === 1 ? 'institute' : 'institutes'}</span>
            <span className="badge bg-brand-50 px-3 py-1.5 text-brand-700">MRR {inr(data?.mrr ?? 0)}</span>
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
                  <th>Joined</th><th>Trial ends</th><th className="sticky right-0 z-10 bg-slate-50 text-right shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.25)]">Actions</th>
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
                            <button type="button" onClick={() => setViewing(i._id)}
                              className="text-left font-semibold text-slate-900 hover:text-brand-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded">
                              {i.name}
                            </button>
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
                      <td>
                        <StatusBadge status={i.status} />
                        {i.status === 'suspended' && (
                          <p className="mt-1 max-w-[12rem] whitespace-normal text-[11px] leading-snug text-rose-600">
                            {i.suspendedAt ? `Since ${fmtDate(i.suspendedAt)}` : ''}{i.suspendedReason ? ` · ${i.suspendedReason}` : ''}
                          </p>
                        )}
                      </td>
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
                      <td className="sticky right-0 z-10 bg-white text-right shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.25)]">
                        <div className="flex justify-end gap-2">
                          {i.status === 'suspended' ? (
                            <Button size="sm" variant="success" icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={() => setReactivating(i)}>Reactivate</Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => setSuspending(i)}>Suspend</Button>
                          )}
                          <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setViewing(i._id)}>View</Button>
                          <Button size="sm" variant="secondary" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setManaging(i)}>Manage</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.pager && <Pager {...list.pager} noun="institutes" />}
      </Card>

      <ManageModal inst={managing} plans={planData?.plans ?? []} onClose={() => setManaging(null)} onSaved={() => { setManaging(null); afterChange(); }} />
      <SuspendModal inst={suspending} onClose={() => setSuspending(null)} onDone={() => { setSuspending(null); afterChange(); }} />
      <DetailModal id={viewing} onClose={() => setViewing(null)} onChanged={afterChange} />
      <ReactivateModal inst={reactivating} onClose={() => setReactivating(null)} onDone={() => { setReactivating(null); afterChange(); }} />
    </div>
  );
}

function ManageModal({ inst, plans, onClose, onSaved }: { inst: AdminInstitute | null; plans: Plan[]; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<PlanKey>('starter');
  const [status, setStatus] = useState<InstStatus>('active');
  const [extend, setExtend] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [creds, setCreds] = useState<{ email: string; name: string; password: string } | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [recordPay, setRecordPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');

  useEffect(() => {
    if (inst) {
      setPlan(inst.plan);
      setStatus(inst.status);
      setExtend('');
      setCreds(null);
      setConfirmReset(false);
      setResetReason('');
      setRecordPay(false);
      setPayAmount('');
      setPayRef('');
    }
  }, [inst]);

  if (!inst) return null;
  const planInfo = plans.find((p) => p.key === plan);
  const extendDays = Number(extend) || 0;
  const dirty = plan !== inst.plan || status !== inst.status || extendDays > 0;
  const activating = status === 'active' && inst.status !== 'active';

  const save = async () => {
    const body: { plan?: PlanKey; status?: InstStatus; extendTrialDays?: number; offlinePayment?: { amount: number; reference: string } } = {};
    if (plan !== inst.plan) body.plan = plan;
    if (status !== inst.status) body.status = status;
    if (extendDays > 0) body.extendTrialDays = extendDays;
    if (activating && recordPay) {
      const amount = Number(payAmount);
      if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter the amount received');
      body.offlinePayment = { amount: Math.round(amount), reference: payRef.trim() };
    }
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

  const resetOwner = async () => {
    if (resetReason.trim().length < 3) return toast.error('Note how you verified the owner (at least 3 characters)');
    if (!confirmReset) return setConfirmReset(true);
    setConfirmReset(false);
    setResetting(true);
    try {
      const { data } = await api.post<{ email: string; name: string; password: string }>(`/admin/institutes/${inst._id}/reset-owner-password`, { reason: resetReason.trim() });
      setCreds(data);
      setResetReason('');
      toast.success('New owner password generated');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setResetting(false);
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

        {activating && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={recordPay} onChange={(e) => setRecordPay(e.target.checked)} />
              Record offline payment (bank transfer / cash)
            </label>
            <p className="mt-1 text-xs text-slate-500">Optional. Adds a successful subscription payment so it shows up in revenue.</p>
            {recordPay && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Amount received (₹)" type="number" min={1} step={1} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={planInfo ? String(inst.billingCycle === 'yearly' ? planInfo.priceYearly : planInfo.priceMonthly) : 'e.g. 1999'} />
                <Input label="Reference" maxLength={60} value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. UTR / NEFT number" />
              </div>
            )}
          </div>
        )}

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

        {/* Owner login help */}
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Owner forgot their password?</p>
              <p className="text-xs text-slate-500">Generate a one-time password and share it with the owner over a call or in person.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input label="How did you verify the owner?" required maxLength={200} value={resetReason} className="flex-1"
              onChange={(e) => { setResetReason(e.target.value); setConfirmReset(false); }} placeholder="e.g. Called back on the registered phone number" />
            <Button size="sm" variant={confirmReset ? 'danger' : 'secondary'} loading={resetting} icon={<KeyRound className="h-4 w-4" />} onClick={resetOwner}>
              {confirmReset ? 'Click again to confirm' : 'Reset owner password'}
            </Button>
          </div>
          {creds && (
            <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <p><b>{creds.name}</b> · {creds.email}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                One-time password: <code className="rounded bg-white px-2 py-0.5 font-mono font-bold">{creds.password}</code>
                <Button size="sm" variant="secondary" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copyText(creds.password)}>Copy</Button>
              </p>
              <p className="mt-1 text-xs text-emerald-700">The owner has been signed out on all their other devices. Ask them to change this password from Settings after logging in.</p>
            </div>
          )}
        </div>

        {status === 'suspended' && inst.status !== 'suspended' && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">Suspending blocks all users of this institute from accessing CoachFlow.</p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

const SUSPEND_REASONS = ['Subscription not paid', 'Institute asked to close the account', 'Terms of service violation'];

function SuspendModal({ inst, onClose, onDone }: { inst: AdminInstitute | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (inst) setReason('');
  }, [inst]);
  if (!inst) return null;

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<{ blocked: { teachers: number; parents: number } }>(`/admin/institutes/${inst._id}/suspend`, { reason });
      toast.success(`${inst.name} suspended — owner, ${data.blocked.teachers} teachers and ${data.blocked.parents} parents are blocked`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!inst} onClose={() => !busy && onClose()} size="md" title={`Suspend ${inst.name}?`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger" loading={busy} icon={<Ban className="h-4 w-4" />} onClick={submit}>Suspend institute</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="rounded-2xl bg-rose-50 p-4 text-rose-800 ring-1 ring-rose-100">
          <p className="font-bold">What happens right away</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The owner, all {inst.teachers} teacher{inst.teachers === 1 ? '' : 's'} and every parent of this institute are logged out and cannot log in.</li>
            <li>Live chat and notifications stop for them; automatic fee reminders stop.</li>
            <li>They see an “account suspended” message with the reason below.</li>
            <li><b>No data is deleted.</b> Reactivate any time to restore everything as it was.</li>
          </ul>
        </div>
        <div>
          <p className="label">Reason (shown to the institute)</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {SUSPEND_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={clsx('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', reason === r ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-rose-300')}>
                {r}
              </button>
            ))}
          </div>
          <Textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Subscription not paid since August" />
        </div>
      </div>
    </Modal>
  );
}

function ReactivateModal({ inst, onClose, onDone }: { inst: AdminInstitute | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!inst) return null;
  const back: InstStatus = inst.statusBeforeSuspend ?? (inst.trialEndsAt && new Date(inst.trialEndsAt) > new Date() ? 'trial' : 'cancelled');
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/institutes/${inst._id}/reactivate`);
      toast.success(`${inst.name} reactivated`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!inst} onClose={() => !busy && onClose()} size="sm" title={`Reactivate ${inst.name}?`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="success" loading={busy} icon={<PlayCircle className="h-4 w-4" />} onClick={submit}>Reactivate</Button></>}>
      <div className="space-y-3 text-sm text-slate-600">
        <p>Everyone at this institute will be able to log in again, with all their data as it was.</p>
        <p>
          The account goes back to <b className="capitalize text-slate-800">{back.replace('_', ' ')}</b>.
          {back === 'active' && ' If their paid period ended while suspended, it becomes “Past due” until they renew.'}
          {' '}To give them a paid plan now, use <b>Manage</b> after reactivating.
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  } catch {
    toast.error('Could not copy — select the text and copy it manually');
  }
}

interface DetailOwner { _id: string; name: string; email: string; phone?: string; lastLoginAt?: string; active?: boolean }
interface DetailPayment { _id: string; plan: string; cycle: 'monthly' | 'yearly'; amount: number; status: 'success' | 'failed' | 'refunded'; reference?: string; failureReason?: string; createdAt: string }
interface DetailTicket { _id: string; subject: string; status: string; priority?: string; createdAt: string }
interface DetailAudit { _id: string; createdAt: string; action: string; entity?: string; entityId?: string; detail?: string; userName?: string }
interface InstituteDetail {
  institute: AdminInstitute;
  owners: DetailOwner[];
  counts: { students: number; teachers: number; parents: number; batches: number };
  lastActiveAt: string | null;
  payments: DetailPayment[];
  tickets: DetailTicket[];
  audit: DetailAudit[];
}

function Section({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><span className="text-slate-400">{icon}</span>{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<InstituteDetail>(id ? `/admin/institutes/${id}` : null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRefunding(null);
    setRefundReason('');
  }, [id]);

  if (!id) return null;
  const d = data && data.institute._id === id ? data : null;

  const refund = async (p: DetailPayment) => {
    if (refundReason.trim().length < 3) return toast.error('Enter a reason for the refund');
    setBusy(true);
    try {
      await api.post(`/admin/payments/${p._id}/refund`, { reason: refundReason.trim() });
      toast.success(`${inr(p.amount)} marked as refunded — return the money in the gateway / bank`);
      setRefunding(null);
      setRefundReason('');
      reload();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!id} onClose={() => !busy && onClose()} size="xl" title={d ? d.institute.name : 'Institute'}
      subtitle={d ? [d.institute.city, d.institute.type, `Joined ${fmtDate(d.institute.createdAt)}`].filter(Boolean).join(' · ') : undefined}
      footer={<Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button>}>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !d ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className={clsx('space-y-6 transition-opacity', loading && 'opacity-60')}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <PlanBadge plan={d.institute.plan} />
            <StatusBadge status={d.institute.status} />
            <span className="capitalize text-slate-500">{d.institute.billingCycle ?? 'monthly'} billing</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">Last active: <b className="text-slate-700">{d.lastActiveAt ? timeAgo(d.lastActiveAt) : 'never'}</b></span>
            {d.institute.currentPeriodEnd && <><span className="text-slate-300">·</span><span className="text-slate-500">Period ends {fmtDate(d.institute.currentPeriodEnd)}</span></>}
            {d.institute.status === 'trial' && d.institute.trialEndsAt && <><span className="text-slate-300">·</span><span className="text-slate-500">Trial ends {fmtDate(d.institute.trialEndsAt)}</span></>}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['Students', d.counts.students], ['Teachers', d.counts.teachers], ['Parents', d.counts.parents], ['Batches', d.counts.batches]] as const).map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-500">{l}</p>
                <p className="mt-1 text-lg font-extrabold text-slate-900">{v.toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>

          <Section title="Owners" icon={<Users className="h-4 w-4" />}>
            {d.owners.length === 0 ? <p className="text-sm text-slate-500">No owner account.</p> : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {d.owners.map((o) => (
                  <div key={o._id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{o.name}{o.active === false && <Badge tone="gray" className="ml-2">Inactive</Badge>}</p>
                      <p className="flex flex-wrap gap-x-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{o.email}</span>
                        <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{o.phone || '—'}</span>
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">Last login: <b className="text-slate-700">{o.lastLoginAt ? fmtDateTime(o.lastLoginAt) : 'never'}</b></p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Recent SaaS payments" icon={<Receipt className="h-4 w-4" />}>
            {d.payments.length === 0 ? <p className="text-sm text-slate-500">No subscription payments yet.</p> : (
              <div className="table-wrap scrollbar-thin rounded-2xl border border-slate-200">
                <table className="table">
                  <thead><tr><th>Date</th><th>Plan</th><th className="text-right">Amount</th><th>Status</th><th>Reference</th><th className="text-right">Action</th></tr></thead>
                  <tbody>
                    {d.payments.map((p) => (
                      <tr key={p._id}>
                        <td className="whitespace-nowrap text-slate-600">{fmtDate(p.createdAt)}</td>
                        <td className="capitalize text-slate-700">{p.plan} · {p.cycle}</td>
                        <td className={clsx('text-right font-bold', p.status === 'refunded' ? 'text-slate-400 line-through' : 'text-slate-900')}>{inr(p.amount)}</td>
                        <td>{p.status === 'refunded' ? <Badge tone="violet">Refunded</Badge> : <StatusBadge status={p.status} />}</td>
                        <td className="max-w-[14rem] truncate font-mono text-xs text-slate-500" title={p.reference || p.failureReason}>{p.reference || p.failureReason || '—'}</td>
                        <td className="text-right">
                          {p.status === 'success' && refunding !== p._id && (
                            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<RotateCcw className="h-3.5 w-3.5" />}
                              onClick={() => { setRefunding(p._id); setRefundReason(''); }}>Refund</Button>
                          )}
                          {refunding === p._id && (
                            <div className="flex min-w-[16rem] flex-col items-end gap-2">
                              <input className="input" autoFocus maxLength={150} placeholder="Reason for refund" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
                              <div className="flex gap-2">
                                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRefunding(null)}>Cancel</Button>
                                <Button size="sm" variant="danger" loading={busy} onClick={() => refund(p)}>Confirm refund of {inr(p.amount)}</Button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">Refunding only marks the payment as refunded here — return the money in the payment gateway or bank.</p>
          </Section>

          <Section title="Support tickets" icon={<LifeBuoy className="h-4 w-4" />}>
            {d.tickets.length === 0 ? <p className="text-sm text-slate-500">No tickets.</p> : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {d.tickets.map((t) => (
                  <div key={t._id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{t.subject}</p>
                      <p className="text-xs text-slate-500">{fmtDate(t.createdAt)}{t.priority ? ` · ${t.priority} priority` : ''}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Audit trail (latest 30)" icon={<History className="h-4 w-4" />}
            action={<Link to={`/admin/audit?instituteId=${d.institute._id}`} className="text-xs font-semibold text-brand-600 hover:underline" onClick={onClose}>Full audit log</Link>}>
            {d.audit.length === 0 ? <p className="text-sm text-slate-500">No recorded actions.</p> : (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {d.audit.map((a) => (
                  <li key={a._id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-brand-700">{a.action}</span>
                      <span className="text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{a.userName || 'System'}{a.detail ? ` · ${a.detail}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}
