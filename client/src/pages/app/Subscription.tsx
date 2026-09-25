import {
  ArrowDownRight, ArrowUpRight, CalendarClock, Check, CheckCircle2, Crown, CreditCard, GraduationCap, LifeBuoy, Lock, Plus, Receipt,
  ShieldCheck, Sparkles, UserSquare2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select, Skeleton,
  StatusBadge, Textarea, clsx,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { FEATURE_INFO } from '../../lib/features';
import { fmtDate, fmtDateTime, inr, timeAgo } from '../../lib/format';
import type { Plan, PlanKey } from '../../lib/types';

type Cycle = 'monthly' | 'yearly';
interface SubPayment { _id: string; plan: PlanKey; cycle: Cycle; amount: number; status: 'success' | 'failed' | 'refunded'; reference?: string; failureReason?: string; createdAt: string }
interface SubData {
  plan: PlanKey; effectivePlan: PlanKey; status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended'; billingCycle: Cycle;
  trialEndsAt?: string; trialDaysLeft: number | null; currentPeriodEnd?: string;
  usage: { students: number; teachers: number }; plans: Plan[]; history: SubPayment[];
}
interface Ticket { _id: string; subject: string; message: string; priority: 'low' | 'normal' | 'high'; status: 'open' | 'in_progress' | 'resolved'; replies: { by: string; text: string; at: string }[]; createdAt: string }

const PLAN_STYLE: Record<PlanKey, string> = {
  starter: 'from-slate-600 to-slate-800',
  growth: 'from-sky-500 to-brand-600',
  premium: 'from-brand-600 via-violet-600 to-fuchsia-600',
};

function UsageBar({ icon, label, used, limit }: { icon: ReactNode; label: string; used: number; limit: number }) {
  const pct = limit ? (used / limit) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-semibold text-white/90">{icon}{label}</span>
        <span className="font-bold text-white">{used} <span className="font-medium text-white/60">/ {limit}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/15">
        <div className={clsx('h-full rounded-full transition-all duration-700', pct >= 90 ? 'bg-rose-300' : pct >= 75 ? 'bg-amber-300' : 'bg-emerald-300')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {pct >= 90 && <p className="mt-1 text-[11px] font-semibold text-rose-200">Almost at your limit — consider upgrading</p>}
    </div>
  );
}

export default function Subscription() {
  const { refresh } = useAuth();
  const { data, loading, error, reload } = useApi<SubData>('/subscription');
  const tickets = useApi<Ticket[]>('/subscription/tickets');
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [checkout, setCheckout] = useState<Plan | null>(null);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<{ reference: string; amount: number; plan: string; currentPeriodEnd: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticket, setTicket] = useState({ subject: '', message: '', priority: 'normal' });
  const [savingTicket, setSavingTicket] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div>
        <PageHeader title="Subscription" subtitle="Your plan, billing and support" />
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div>
      </div>
    );
  }

  const activeCycle: Cycle = cycle ?? data.billingCycle;
  const current = data.plans.find((p) => p.key === data.plan);
  const currentIdx = data.plans.findIndex((p) => p.key === data.plan);
  const isTrial = data.status === 'trial';
  const isCancelled = data.status === 'cancelled';

  const openCheckout = (p: Plan) => { setSuccess(null); setCheckout(p); };
  const closeCheckout = () => { if (!paying) { setCheckout(null); setSuccess(null); } };

  const pay = async () => {
    if (!checkout) return;
    setPaying(true);
    try {
      const { data: res } = await api.post('/subscription/checkout', { plan: checkout.key, cycle: activeCycle });
      setSuccess(res);
      await Promise.all([refresh(), reload()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPaying(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.post('/subscription/cancel');
      toast.success('Subscription cancelled');
      setCancelOpen(false);
      await Promise.all([refresh(), reload()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCancelling(false);
    }
  };

  const submitTicket = async () => {
    if (!ticket.subject.trim() || !ticket.message.trim()) return toast.error('Please add a subject and message');
    setSavingTicket(true);
    try {
      await api.post('/subscription/tickets', ticket);
      toast.success('Ticket raised — our team will reply soon');
      setTicketOpen(false);
      setTicket({ subject: '', message: '', priority: 'normal' });
      tickets.reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSavingTicket(false);
    }
  };

  const price = (p: Plan) => (activeCycle === 'yearly' ? p.priceYearly : p.priceMonthly);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Subscription" subtitle="Manage your CoachFlow plan, billing and support"
        actions={<Button variant="secondary" icon={<LifeBuoy className="h-4 w-4" />} onClick={() => setTicketOpen(true)}>Get help</Button>} />

      {/* ── Current plan ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={clsx('relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-glow sm:p-7 lg:col-span-2', PLAN_STYLE[data.plan])}>
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative grid gap-6 md:grid-cols-2">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/70"><Crown className="h-4 w-4 text-amber-300" /> Current plan</p>
              <h2 className="mt-2 text-3xl font-extrabold">{current?.name ?? data.plan}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold capitalize ring-1 ring-white/20">{data.status.replace('_', ' ')}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold capitalize ring-1 ring-white/20">{data.billingCycle}</span>
              </div>
              {current && !isTrial && <p className="mt-4 text-2xl font-extrabold">{inr(data.billingCycle === 'yearly' ? current.priceYearly : current.priceMonthly)}<span className="text-sm font-medium text-white/70"> / {data.billingCycle === 'yearly' ? 'year' : 'month'}</span></p>}
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-sm ring-1 ring-white/15">
                <CalendarClock className="h-5 w-5 shrink-0 text-amber-200" />
                {isTrial ? (
                  <span><b>{data.trialDaysLeft ?? 0} days</b> left in your free trial{data.trialEndsAt && <> · ends {fmtDate(data.trialEndsAt)}</>}</span>
                ) : isCancelled ? (
                  <span>Cancelled — access until <b>{fmtDate(data.currentPeriodEnd)}</b></span>
                ) : (
                  <span>Renews on <b>{fmtDate(data.currentPeriodEnd)}</b></span>
                )}
              </div>
            </div>
            <div className="space-y-5 rounded-2xl bg-black/10 p-5 ring-1 ring-white/10">
              <p className="text-sm font-bold">Usage</p>
              <UsageBar icon={<GraduationCap className="h-4 w-4" />} label="Active students" used={data.usage.students} limit={current?.studentLimit ?? 0} />
              <UsageBar icon={<UserSquare2 className="h-4 w-4" />} label="Teachers" used={data.usage.teachers} limit={current?.teacherLimit ?? 0} />
              {current && current.whatsappLimit > 0 && <p className="text-xs text-white/70">Includes {current.whatsappLimit.toLocaleString('en-IN')} WhatsApp messages / month</p>}
            </div>
          </div>
        </div>

        <Card className="flex flex-col">
          <CardHeader title="Included in your plan" icon={<ShieldCheck className="h-5 w-5" />} />
          <ul className="flex-1 space-y-2 text-sm">
            {(Object.keys(FEATURE_INFO) as (keyof typeof FEATURE_INFO)[]).map((f) => {
              const has = current?.features.includes(f);
              return (
                <li key={f} className={clsx('flex items-center gap-2.5', has ? 'text-slate-700' : 'text-slate-400')}>
                  {has ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Lock className="h-4 w-4" />}
                  {FEATURE_INFO[f].label}
                </li>
              );
            })}
          </ul>
          {!isCancelled && !isTrial && (
            <button onClick={() => setCancelOpen(true)} className="mt-5 self-start text-xs font-semibold text-slate-400 hover:text-rose-600">Cancel subscription</button>
          )}
        </Card>
      </div>

      {/* ── Plans ── */}
      <div className="mt-10 flex flex-col items-center gap-4 text-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{isTrial ? 'Choose a plan to continue after your trial' : 'Change plan'}</h2>
          <p className="text-sm text-slate-500">Switch anytime. Yearly billing gives you ~2 months free.</p>
        </div>
        <div className="inline-flex rounded-full bg-white p-1 shadow-soft ring-1 ring-slate-200">
          {(['monthly', 'yearly'] as const).map((c) => (
            <button key={c} onClick={() => setCycle(c)}
              className={clsx('rounded-full px-5 py-2 text-sm font-bold capitalize transition', activeCycle === c ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800')}>
              {c}{c === 'yearly' && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Save 17%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {data.plans.map((p, i) => {
          const isCurrent = p.key === data.plan && activeCycle === data.billingCycle && !isTrial && !isCancelled;
          const isUp = i > currentIdx;
          const label = isCurrent ? 'Current plan' : isTrial || isCancelled ? `Choose ${p.name}` : p.key === data.plan ? `Switch to ${activeCycle}` : isUp ? `Upgrade to ${p.name}` : `Downgrade to ${p.name}`;
          const tooSmall = data.usage.students > p.studentLimit || data.usage.teachers > p.teacherLimit;
          return (
            <div key={p.key} className={clsx('relative flex flex-col rounded-3xl bg-white p-6 transition',
              p.popular ? 'ring-2 ring-violet-500 shadow-xl shadow-violet-500/10' : 'ring-1 ring-slate-200 hover:shadow-lg',
              p.key === data.plan && 'bg-gradient-to-b from-brand-50/60 to-white')}>
              {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-600 px-3 py-1 text-[11px] font-extrabold text-white shadow">⭐ POPULAR</span>}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-slate-900">{p.name}</h3>
                {p.key === data.plan && <Badge tone="brand">Your plan</Badge>}
              </div>
              <p className="text-sm text-slate-500">{p.tagline}</p>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">{inr(price(p))}<span className="text-sm font-medium text-slate-400"> / {activeCycle === 'yearly' ? 'year' : 'month'}</span></p>
              <p className="h-4 text-xs font-semibold text-emerald-600">{activeCycle === 'yearly' && `Save ${inr(p.priceMonthly * 12 - p.priceYearly)} vs monthly`}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-center text-xs text-slate-500">
                <div><p className="text-base font-extrabold text-slate-900">{p.studentLimit}</p>students</div>
                <div><p className="text-base font-extrabold text-slate-900">{p.teacherLimit}</p>teachers</div>
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                {p.features.length === 0 && <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500" /> Students, batches, attendance & basic fees</li>}
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{FEATURE_INFO[f]?.label ?? f}</li>)}
              </ul>
              {tooSmall && !isCurrent && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">Your current usage exceeds this plan's limits.</p>}
              <Button className="mt-5 w-full" disabled={isCurrent || tooSmall}
                variant={isCurrent ? 'secondary' : p.popular || isUp ? 'premium' : 'secondary'}
                icon={isCurrent ? <Check className="h-4 w-4" /> : isUp || isTrial ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                onClick={() => openCheckout(p)}>
                {label}
              </Button>
            </div>
          );
        })}
      </div>

      {/* ── Billing history & tickets ── */}
      <div className="mt-10 grid gap-6 xl:grid-cols-5">
        <Card pad={false} className="xl:col-span-3">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0"><CardHeader title="Billing history" subtitle="Your CoachFlow payments" icon={<Receipt className="h-5 w-5" />} /></div>
          {data.history.length === 0 ? (
            <EmptyState title="No payments yet" text="Your subscription payments will appear here." icon={<CreditCard className="h-7 w-7" />} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h._id}>
                      <td>{fmtDate(h.createdAt)}</td>
                      <td><span className="font-semibold capitalize text-slate-800">{h.plan}</span> <span className="text-xs capitalize text-slate-400">· {h.cycle}</span></td>
                      <td className="font-bold text-slate-900">{inr(h.amount)}</td>
                      <td><StatusBadge status={h.status} />{h.failureReason && <p className="mt-0.5 text-[11px] text-rose-500">{h.failureReason}</p>}</td>
                      <td className="font-mono text-xs text-slate-500">{h.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Support tickets" subtitle="We usually reply within a few hours" icon={<LifeBuoy className="h-5 w-5" />}
            action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTicketOpen(true)}>New ticket</Button>} />
          {tickets.loading ? (
            <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : !tickets.data?.length ? (
            <EmptyState title="No tickets" text="Stuck somewhere? Raise a ticket and our team will help." />
          ) : (
            <ul className="space-y-3">
              {tickets.data.map((t) => (
                <li key={t._id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-800">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.message}</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <Badge tone={t.priority === 'high' ? 'red' : t.priority === 'low' ? 'gray' : 'blue'} className="capitalize">{t.priority}</Badge>
                    <span>{timeAgo(t.createdAt)}</span>
                    {t.replies.length > 0 && <span>· {t.replies.length} repl{t.replies.length > 1 ? 'ies' : 'y'}</span>}
                  </div>
                  {t.replies.length > 0 && (
                    <div className="mt-2 rounded-lg bg-brand-50/60 p-2.5 text-xs text-slate-600">
                      <b className="text-brand-700">{t.replies[t.replies.length - 1].by}:</b> {t.replies[t.replies.length - 1].text}
                      <span className="ml-1 text-slate-400">· {fmtDateTime(t.replies[t.replies.length - 1].at)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Checkout modal ── */}
      <Modal open={!!checkout} onClose={closeCheckout} title={success ? 'All set!' : 'Confirm your plan'} size="sm"
        footer={success ? <Button onClick={closeCheckout}>Done</Button> : (
          <><Button variant="secondary" onClick={closeCheckout} disabled={paying}>Cancel</Button>
            <Button variant="premium" loading={paying} icon={<CreditCard className="h-4 w-4" />} onClick={pay}>Pay {checkout && inr(price(checkout))}</Button></>
        )}>
        {checkout && (success ? (
          <div className="py-4 text-center animate-fade-up">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50"><CheckCircle2 className="h-9 w-9" /></div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-900">Payment successful ✓</h3>
            <p className="mt-1 text-sm text-slate-500">You're now on <b className="capitalize text-slate-700">{success.plan}</b>. Valid until {fmtDate(success.currentPeriodEnd)}.</p>
            <div className="mt-5 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-left text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Amount paid</span><b>{inr(success.amount)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="font-mono text-xs">{success.reference}</span></div>
            </div>
          </div>
        ) : (
          <div>
            <div className={clsx('rounded-2xl bg-gradient-to-br p-5 text-white', PLAN_STYLE[checkout.key])}>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/70"><Sparkles className="h-3.5 w-3.5" /> CoachFlow {checkout.name}</p>
              <p className="mt-2 text-3xl font-extrabold">{inr(price(checkout))}<span className="text-sm font-medium text-white/70"> / {activeCycle === 'yearly' ? 'year' : 'month'}</span></p>
              <p className="mt-1 text-xs text-white/80">{checkout.studentLimit} students · {checkout.teacherLimit} teachers</p>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Billing cycle</span><span className="font-semibold capitalize">{activeCycle}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Starts</span><span className="font-semibold">Today</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><span className="font-semibold text-slate-700">Total due now</span><span className="font-extrabold text-slate-900">{inr(price(checkout))}</span></div>
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Demo mode: payment is simulated instantly. Connect Razorpay on the server for live payments.
            </p>
          </div>
        ))}
      </Modal>

      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} loading={cancelling} danger
        title="Cancel subscription?" confirmLabel="Yes, cancel"
        text={<>Your institute will keep access until <b>{fmtDate(data.currentPeriodEnd)}</b>. After that, automated reminders, parent notifications and premium features will stop.</>} />

      <Modal open={ticketOpen} onClose={() => setTicketOpen(false)} title="New support ticket" subtitle="Tell us what you need help with"
        footer={<><Button variant="secondary" onClick={() => setTicketOpen(false)}>Cancel</Button><Button loading={savingTicket} onClick={submitTicket}>Submit ticket</Button></>}>
        <div className="space-y-4">
          <Input label="Subject" placeholder="e.g. Need GST on fee receipts" value={ticket.subject} onChange={(e) => setTicket({ ...ticket, subject: e.target.value })} />
          <Textarea label="Message" placeholder="Describe the issue or request…" value={ticket.message} onChange={(e) => setTicket({ ...ticket, message: e.target.value })} />
          <Select label="Priority" value={ticket.priority} onChange={(e) => setTicket({ ...ticket, priority: e.target.value })}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </Select>
        </div>
      </Modal>
    </div>
  );
}
