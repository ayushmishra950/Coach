import {
  Bell, BookOpen, CalendarCheck, CalendarClock, CheckCircle2, ClipboardList, Clock, CreditCard, IndianRupee, LogOut, Megaphone, Phone, Receipt, ShieldCheck, User,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Logo } from '../../components/Logo';
import { NOTIF_ICON, NotificationBell } from '../../components/NotificationBell';
import { Badge, Button, EmptyState, ErrorState, Modal, PageLoader, StatusBadge, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtDateShort, fmtTime, inr, pctTone, timeAgo, ymd } from '../../lib/format';
import type { Announcement, Invoice, Notification, Payment } from '../../lib/types';

interface Child {
  student: { _id: string; name: string; studentCode: string; course?: string };
  batches: { _id: string; name: string; subject?: string; days: string[]; startTime: string; endTime: string; teacher?: string }[];
  attendance: { pct: number; total: number; present: number; recent: { date: string; batch?: string; status?: 'present' | 'absent' | 'late' }[] };
  results: { _id: string; subject: string; topic?: string; date: string; maxMarks: number; marks: number | null; absent: boolean; pct: number | null }[];
  latestResult: Child['results'][number] | null;
  fees: { total: number; paid: number; pending: number; invoices: Invoice[]; payments: Payment[] };
  nextClass: { at: string; batch: string; subject?: string } | null;
}
interface Overview {
  institute: { name: string; phone?: string; brandColor?: string };
  children: Child[];
  announcements: Omit<Announcement, 'batchIds'>[];
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return fmtTime(`${d.getHours()}:${d.getMinutes()}`);
};
const isOverdue = (i: Invoice) => i.status !== 'paid' && new Date(i.dueDate) < new Date();

export default function ParentPortal() {
  const { session, logout } = useAuth();
  const { data, loading, error, status, reload } = useApi<Overview>('/parent/overview');
  const [idx, setIdx] = useState(0);
  const child = data?.children[Math.min(idx, (data?.children.length ?? 1) - 1)];

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/70 via-slate-50 to-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo to="/portal" className="shrink-0 [&>span]:hidden sm:[&>span]:inline" />
            {data?.institute.name && (
              <span className="hidden truncate border-l border-slate-200 pl-3 text-sm font-semibold text-slate-600 sm:block">{data.institute.name}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell allHref="#notifications" />
            <div className="ml-1 hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 sm:flex">
              <User className="h-4 w-4 text-slate-400" /> {session?.user.name}
            </div>
            <button onClick={logout} className="rounded-xl p-2.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Log out" aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5 sm:pt-8">
        {loading && !data ? (
          <PageLoader />
        ) : status === 402 ? (
          <div className="card card-pad mx-auto mt-10 max-w-md text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-3xl">🏫</div>
            <h2 className="mt-4 text-xl font-extrabold text-slate-900">Parent portal not available yet</h2>
            <p className="mt-2 text-sm text-slate-500">Your institute's plan doesn't include the parent portal yet. Please contact the institute for updates about your child.</p>
            <Button variant="secondary" className="mt-6" icon={<LogOut className="h-4 w-4" />} onClick={logout}>Log out</Button>
          </div>
        ) : error || !data ? (
          <ErrorState message={error ?? 'Could not load your portal'} onRetry={reload} />
        ) : !child ? (
          <div className="card"><EmptyState title="No students linked" text="Your account isn't linked to any student yet. Please contact the institute." /></div>
        ) : (
          <>
            <div className="mb-5">
              <p className="text-sm text-slate-500">Namaste, {session?.user.name?.split(' ')[0]} 👋</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Here's how {child.student.name.split(' ')[0]} is doing</h1>
            </div>

            {data.children.length > 1 && (
              <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {data.children.map((c, i) => (
                  <button key={c.student._id} onClick={() => setIdx(i)}
                    className={clsx('whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition',
                      i === idx ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300')}>
                    {c.student.name}
                  </button>
                ))}
              </div>
            )}

            <ChildView key={child.student._id} child={child} announcements={data.announcements} institute={data.institute} onReload={reload} />
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Ring({ value }: { value: number }) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  const color = v >= 85 ? '#10b981' : v >= 70 ? '#f59e0b' : '#f43f5e';
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#f1f5f9" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-all duration-700" />
    </svg>
  );
}

function Tile({ label, icon, children, tone }: { label: string; icon: ReactNode; children: ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-slate-800 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className={clsx('grid h-7 w-7 place-items-center rounded-lg', tone)}>{icon}</span>
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Section({ id, title, icon, children, action }: { id?: string; title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="card card-pad scroll-mt-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChildView({ child, announcements, institute, onReload }: { child: Child; announcements: Overview['announcements']; institute: Overview['institute']; onReload: () => void }) {
  const { student, attendance, latestResult, fees, nextClass } = child;
  const cls = student.course || child.batches[0]?.name;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-glow sm:p-7">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 text-lg font-extrabold">{student.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>
            <div>
              <h2 className="text-xl font-extrabold sm:text-2xl">{student.name}{cls ? ` · ${cls}` : ''}</h2>
              <p className="text-sm text-white/75">{student.studentCode} · {institute.name}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Attendance" icon={<CalendarCheck className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Ring value={attendance.pct} />
                  <span className={clsx('absolute inset-0 grid place-items-center text-sm font-extrabold', pctTone(attendance.pct))}>{attendance.pct}%</span>
                </div>
                <p className="text-xs text-slate-500">{attendance.present} of {attendance.total} classes</p>
              </div>
            </Tile>
            <Tile label="Latest result" icon={<ClipboardList className="h-4 w-4" />} tone="bg-violet-50 text-violet-600">
              {latestResult ? (
                <>
                  <p className="truncate text-sm font-semibold text-slate-600">{latestResult.subject}</p>
                  <p className="text-2xl font-extrabold text-slate-900">
                    {latestResult.absent ? 'Absent' : <>{latestResult.marks}<span className="text-base font-bold text-slate-400"> / {latestResult.maxMarks}</span></>}
                  </p>
                  <p className="text-xs text-slate-400">{fmtDate(latestResult.date)}</p>
                </>
              ) : <p className="text-sm text-slate-400">No results yet</p>}
            </Tile>
            <Tile label="Fees" icon={<IndianRupee className="h-4 w-4" />} tone="bg-amber-50 text-amber-600">
              {fees.pending > 0 ? (
                <>
                  <p className="text-2xl font-extrabold text-slate-900">{inr(fees.pending)}</p>
                  <p className="text-sm font-semibold text-amber-600">Pending</p>
                  <a href="#fees" className="text-xs font-semibold text-brand-600">Pay now →</a>
                </>
              ) : (
                <>
                  <p className="text-2xl font-extrabold text-emerald-600">All clear ✓</p>
                  <p className="text-xs text-slate-400">{inr(fees.paid)} paid</p>
                </>
              )}
            </Tile>
            <Tile label="Next class" icon={<CalendarClock className="h-4 w-4" />} tone="bg-sky-50 text-sky-600">
              {nextClass ? (
                <>
                  <p className="text-lg font-extrabold leading-tight text-slate-900">{fmtDate(nextClass.at, { day: 'numeric', month: 'short' })}</p>
                  <p className="text-lg font-extrabold leading-tight text-brand-600">{timeOf(nextClass.at)}</p>
                  <p className="truncate text-xs text-slate-400">{nextClass.subject || nextClass.batch}</p>
                </>
              ) : <p className="text-sm text-slate-400">No upcoming class</p>}
            </Tile>
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {[['fees', 'Fees'], ['results', 'Results'], ['attendance', 'Attendance'], ['schedule', 'Schedule'], ['announcements', 'Announcements'], ['notifications', 'Notifications']].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-brand-700 hover:ring-brand-300">{l}</a>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-2">
        <FeesSection fees={fees} onReload={onReload} />
        <ResultsSection results={child.results} />
        <AttendanceSection attendance={attendance} />
        <ScheduleSection batches={child.batches} />
        <AnnouncementsSection items={announcements} />
        <NotificationsSection />
      </div>

      {institute.phone && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200 sm:flex-row">
          <p className="flex items-center gap-2 text-slate-600"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Questions? Reach {institute.name} anytime.</p>
          <a href={`tel:${institute.phone}`} className="btn-secondary btn-sm"><Phone className="h-3.5 w-3.5" /> {institute.phone}</a>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FeesSection({ fees, onReload }: { fees: Child['fees']; onReload: () => void }) {
  const navigate = useNavigate();
  const [payInv, setPayInv] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<Payment | null>(null);
  const paidPct = fees.total ? Math.round((fees.paid / fees.total) * 100) : 0;

  const pay = async () => {
    if (!payInv) return;
    setPaying(true);
    try {
      const { data } = await api.post<{ ok: boolean; payment: Payment }>('/parent/pay', { invoiceId: payInv._id });
      setPayInv(null);
      setDone(data.payment);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 402) toast.error('Online payment is not enabled by your institute — please pay at the centre');
      else toast.error(errMsg(e));
      setPayInv(null);
    } finally {
      setPaying(false);
    }
  };

  const closeDone = () => {
    setDone(null);
    onReload();
  };

  return (
    <Section id="fees" title="Fees" icon={<IndianRupee className="h-4 w-4" />}>
      <div className="mb-4 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-end justify-between text-sm">
          <div><p className="text-xs text-slate-500">Paid</p><p className="text-lg font-extrabold text-emerald-600">{inr(fees.paid)}</p></div>
          <div className="text-right"><p className="text-xs text-slate-500">Total</p><p className="text-lg font-extrabold text-slate-900">{inr(fees.total)}</p></div>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${paidPct}%` }} />
        </div>
      </div>
      {fees.invoices.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No fee installments yet.</p> : (
        <ul className="space-y-2.5">
          {fees.invoices.map((inv) => {
            const due = inv.amount - inv.paidAmount;
            const overdue = isOverdue(inv);
            return (
              <li key={inv._id} className={clsx('flex items-center justify-between gap-3 rounded-2xl border p-3.5', overdue ? 'border-rose-200 bg-rose-50/50' : 'border-slate-100')}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">{inv.title}</p>
                  <p className="text-xs text-slate-500">{inr(inv.amount)} · due {fmtDate(inv.dueDate)}</p>
                  <div className="mt-1"><StatusBadge status={overdue ? 'overdue' : inv.status} /></div>
                </div>
                {inv.status === 'paid' ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                ) : (
                  <Button size="sm" variant="premium" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => setPayInv(inv)}>PAY {inr(due)}</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {fees.payments.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Receipts</p>
          <ul className="space-y-1">
            {fees.payments.slice(0, 5).map((p) => (
              <li key={p._id}>
                <button onClick={() => navigate(`/portal/receipt/${p._id}`)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-slate-600"><Receipt className="h-4 w-4 text-slate-400" /> #{p.receiptNo} · {fmtDateShort(p.paidAt)}</span>
                  <b className="text-slate-800">{inr(p.amount)}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={!!payInv} onClose={() => !paying && setPayInv(null)} title="Pay fees online" size="sm"
        footer={<><Button variant="secondary" onClick={() => setPayInv(null)} disabled={paying}>Cancel</Button><Button variant="premium" loading={paying} onClick={pay} icon={<CreditCard className="h-4 w-4" />}>PAY NOW</Button></>}>
        {payInv && (
          <div className="text-center">
            <p className="text-sm text-slate-500">{payInv.title}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Outstanding Amount</p>
            <p className="mt-1 text-4xl font-extrabold text-slate-900">{inr(payInv.amount - payInv.paidAmount)}</p>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Secure payment · receipt issued instantly</p>
          </div>
        )}
      </Modal>

      <Modal open={!!done} onClose={closeDone} title="Payment Successful" size="sm"
        footer={<><Button variant="secondary" onClick={closeDone}>Done</Button><Button onClick={() => done && navigate(`/portal/receipt/${done._id}`)} icon={<Receipt className="h-4 w-4" />}>View receipt</Button></>}>
        {done && (
          <div className="py-2 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></div>
            <p className="mt-4 text-lg font-extrabold text-slate-900">Payment Successful ✓</p>
            <p className="mt-1 text-sm text-slate-500">Amount</p>
            <p className="text-3xl font-extrabold text-emerald-600">{inr(done.amount)}</p>
            <p className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Receipt #{done.receiptNo}</p>
          </div>
        )}
      </Modal>
    </Section>
  );
}

function ResultsSection({ results }: { results: Child['results'] }) {
  return (
    <Section id="results" title="Results" icon={<ClipboardList className="h-4 w-4" />}>
      {results.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No published results yet.</p> : (
        <ul className="space-y-3">
          {results.slice(0, 8).map((r) => (
            <li key={r._id}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{r.subject}{r.topic ? <span className="font-normal text-slate-400"> · {r.topic}</span> : null}</p>
                  <p className="text-xs text-slate-400">{fmtDate(r.date)}</p>
                </div>
                <p className="shrink-0 text-sm font-extrabold text-slate-900">
                  {r.absent ? <Badge tone="red">Absent</Badge> : <>{r.marks}/{r.maxMarks} <span className={clsx('ml-1', pctTone(r.pct))}>{r.pct}%</span></>}
                </p>
              </div>
              {!r.absent && r.pct != null && (
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={clsx('h-full rounded-full', r.pct >= 85 ? 'bg-emerald-500' : r.pct >= 70 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${r.pct}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AttendanceSection({ attendance }: { attendance: Child['attendance'] }) {
  const byDate = new Map<string, string>();
  for (const r of attendance.recent) {
    const prev = byDate.get(r.date);
    if (!prev || r.status === 'absent' || (r.status === 'late' && prev === 'present')) byDate.set(r.date, r.status ?? 'present');
  }
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return { key: ymd(d), d, status: byDate.get(ymd(d)) };
  });
  const dot = (s?: string) => (s === 'present' ? 'bg-emerald-500 text-white' : s === 'absent' ? 'bg-rose-500 text-white' : s === 'late' ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-400');

  return (
    <Section id="attendance" title="Attendance" icon={<CalendarCheck className="h-4 w-4" />} action={<span className={clsx('text-lg font-extrabold', pctTone(attendance.pct))}>{attendance.pct}%</span>}>
      <p className="mb-2 text-xs font-semibold text-slate-400">Last 30 days</p>
      <div className="grid grid-cols-10 gap-1.5">
        {days.map((x) => (
          <div key={x.key} title={`${fmtDate(x.d)}${x.status ? ` — ${x.status}` : ''}`}
            className={clsx('grid aspect-square place-items-center rounded-lg text-[10px] font-bold', dot(x.status))}>
            {x.d.getDate()}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Present</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Late</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Absent</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /> No class</span>
      </div>
      {attendance.recent.length > 0 && (
        <ul className="mt-4 max-h-56 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 scrollbar-thin">
          {attendance.recent.slice(0, 15).map((r, i) => (
            <li key={`${r.date}-${i}`} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-700">{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <p className="truncate text-xs text-slate-400">{r.batch}</p>
              </div>
              {r.status && <StatusBadge status={r.status} />}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ScheduleSection({ batches }: { batches: Child['batches'] }) {
  return (
    <Section id="schedule" title="Schedule" icon={<Clock className="h-4 w-4" />}>
      {batches.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Not enrolled in any batch yet.</p> : (
        <ul className="space-y-3">
          {batches.map((b) => (
            <li key={b._id} className="rounded-2xl border border-slate-100 p-3.5">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><BookOpen className="h-4 w-4 text-brand-500" /> {b.name}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {b.days.map((d) => <span key={d} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{d}</span>)}
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtTime(b.startTime)} – {fmtTime(b.endTime)}</span>
                {b.teacher && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {b.teacher}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AnnouncementsSection({ items }: { items: Overview['announcements'] }) {
  return (
    <Section id="announcements" title="Announcements" icon={<Megaphone className="h-4 w-4" />}>
      {items.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No announcements right now.</p> : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a._id} className={clsx('rounded-2xl p-3.5', a.pinned ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50')}>
              <p className="text-sm font-bold text-slate-800">{a.pinned && '📌 '}{a.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
              <p className="mt-1.5 text-xs text-slate-400">{a.createdByName ? `${a.createdByName} · ` : ''}{timeAgo(a.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function NotificationsSection() {
  const { data, loading } = useApi<{ items: Notification[]; unread: number }>('/notifications', { limit: 20 });
  return (
    <Section id="notifications" title="Notifications" icon={<Bell className="h-4 w-4" />}
      action={data?.unread ? <Badge tone="brand">{data.unread} new</Badge> : undefined}>
      {loading && !data ? <p className="py-6 text-center text-sm text-slate-400">Loading…</p> : !data?.items.length ? (
        <p className="py-6 text-center text-sm text-slate-400">You're all caught up 🎉</p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin">
          {data.items.map((n) => {
            const I = NOTIF_ICON[n.type] ?? NOTIF_ICON.system;
            return (
              <li key={n._id} className={clsx('flex gap-3 rounded-xl p-2.5', !n.read && 'bg-brand-50/50')}>
                <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', I.cls)}><I.icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
