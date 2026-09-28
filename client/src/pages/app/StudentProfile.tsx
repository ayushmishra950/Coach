import {
  ArrowLeft, BookOpen, CalendarCheck, CalendarDays, Check, Copy, IndianRupee, KeyRound, Mail, MapPin, MessageCircle, MessageSquarePlus,
  Ban, Pencil, Phone, Plus, Power, Receipt, StickyNote, Trash2, TrendingUp, Trophy, User, UserX, Wallet,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Avatar, Badge, Button, Card, CardHeader, ChartTooltip, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageLoader, Progress,
  Select, StatCard, StatusBadge, Tabs, Textarea, Toggle, clsx,
} from '../../components/ui';
import { UpgradeCard } from '../../components/Upgrade';
import { useAuth } from '../../context/AuthContext';
import { Pager } from '../../components/Pager';
import { useApi, useClientPage } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtDateShort, fmtTime, inr, pctTone, timeAgo, ymd } from '../../lib/format';
import type { Invoice, Payment, Student } from '../../lib/types';
import { BatchChips, StudentFormModal } from './Students';

interface ProfileBatch { _id: string; name: string; subject?: string; days?: string[]; startTime?: string; endTime?: string; color?: string; teacherId?: { _id: string; name: string } | null }
interface ResultRow { testId: string; subject: string; topic?: string; date: string; maxMarks: number; marks?: number | null; absent?: boolean; pct: number | null; status: string }
interface ProfileData {
  student: Omit<Student, 'batches'> & { batches: ProfileBatch[] };
  attendance: { total: number; present: number; pct: number; history: { date: string; batch?: string; status?: 'present' | 'absent' | 'late' }[] };
  scores: { avg: number | null; results: ResultRow[]; bySubject: { subject: string; avg: number }[] };
  fees: { total: number; paid: number; pending: number; invoices: Invoice[]; payments: FeePayment[] } | null;
}
type FeePayment = Payment & { status?: 'valid' | 'void'; voidReason?: string; voidedAt?: string; balanceAfter?: number };
interface PortalResult { email: string; password?: string; linkedExisting?: boolean }

type TabKey = 'overview' | 'attendance' | 'tests' | 'fees' | 'notes';

const DOT: Record<string, string> = { present: 'bg-emerald-500', late: 'bg-amber-400', absent: 'bg-rose-500' };
/** Pager placed at the bottom of a padded Card (cancels the card padding so its top border spans the card). */
const CARD_PAGER = '-mx-5 -mb-5 mt-4 sm:-mx-6 sm:-mb-6';

const barColor = (v: number) => (v >= 85 ? '#10b981' : v >= 70 ? '#f59e0b' : '#f43f5e');

/** Local YYYY-MM-DD of a stored due date, compared with today's local date. */
const dueDay = (inv: Invoice) => ymd(new Date(inv.dueDate));
/** Overdue = the due date is before today. On the due date itself it is "Due today". */
function isOverdue(inv: Invoice) {
  return inv.status !== 'paid' && dueDay(inv) < ymd();
}
const isDueToday = (inv: Invoice) => inv.status !== 'paid' && dueDay(inv) === ymd();
/** Earliest payment date the server accepts (one year back). */
function yearAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return ymd(d);
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate font-mono text-sm font-semibold text-slate-900">{value}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={copy} icon={done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}>
        {done ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <span className="text-slate-400">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

/* ---------------- Fee modals ---------------- */

function PaymentModal({ invoice, onClose, onDone }: { invoice: Invoice | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(ymd());
  const [saving, setSaving] = useState(false);
  const due = invoice ? invoice.amount - invoice.paidAmount : 0;
  useEffect(() => {
    if (invoice) { setAmount(String(due)); setMethod('cash'); setReference(''); setNote(''); setPaidAt(ymd()); }
  }, [invoice, due]);

  const submit = async () => {
    if (!invoice) return;
    const n = Number(amount);
    if (!(n > 0)) return toast.error('Enter a valid amount');
    if (!paidAt) return toast.error('Choose the payment date');
    if (paidAt > ymd()) return toast.error('Payment date cannot be in the future');
    setSaving(true);
    try {
      await api.post('/fees/payments', { invoiceId: invoice._id, amount: n, method, reference, note, paidAt });
      toast.success(`Payment of ${inr(n)} recorded`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!invoice} onClose={onClose} title="Record payment" subtitle={invoice ? `${invoice.title} · ${inr(due)} due` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" loading={saving} onClick={submit} icon={<Check className="h-4 w-4" />}>Record payment</Button></>}>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount (₹)" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Payment date" type="date" value={paidAt} max={ymd()} min={yearAgo()} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div>
          <span className="label">Method</span>
          <div className="grid grid-cols-4 gap-2">
            {(['cash', 'upi', 'bank', 'card'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={clsx('rounded-xl border px-3 py-2 text-sm font-semibold uppercase transition',
                  method === m ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <Input label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI txn ID / cheque no." />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Mirrors the server's createInstallments: day-clamped due dates (Jan 31 + 1 month = Feb 28/29) and floor split, last installment absorbs the remainder. */
function previewInstallments(totalRaw: number, countRaw: number, firstDue: string, intervalRaw: number) {
  const total = Math.round(totalRaw);
  const n = Math.max(1, Math.min(12, Math.round(countRaw) || 1));
  if (!(total > 0)) return [];
  const step = Math.max(1, Math.min(12, Math.round(intervalRaw) || 3));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstDue);
  const start = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + i * step);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return { i: i + 1, due: d, amount: i === n - 1 ? total - base * (n - 1) : base };
  });
}

function StructureModal({ open, onClose, studentId, onDone }: { open: boolean; onClose: () => void; studentId: string; onDone: () => void }) {
  const [total, setTotal] = useState('');
  const [inst, setInst] = useState('3');
  const [first, setFirst] = useState(ymd());
  const [interval, setIntervalM] = useState('3');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setTotal(''); setInst('3'); setFirst(ymd()); setIntervalM('3'); }
  }, [open]);
  const n = Math.max(1, Math.min(12, Math.round(Number(inst)) || 1));
  const preview = previewInstallments(Number(total), n, first || ymd(), Number(interval) || 3);

  const submit = async () => {
    if (!(Number(total) > 0)) return toast.error('Enter the total fee');
    setSaving(true);
    try {
      await api.post('/fees/structure', { studentId, totalAmount: Number(total), installments: n, firstDueDate: first, intervalMonths: Number(interval) || 3 });
      toast.success('Fee structure created');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Set fee structure" subtitle="Split the course fee into installments."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit}>Create installments</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Total fee (₹)" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="e.g. 24000" autoFocus />
        <Input label="Installments" type="number" min={1} max={12} value={inst} onChange={(e) => setInst(e.target.value)} />
        <Input label="First due date" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
        <Select label="Interval" value={interval} onChange={(e) => setIntervalM(e.target.value)}>
          <option value="1">Every month</option><option value="2">Every 2 months</option><option value="3">Every 3 months</option><option value="6">Every 6 months</option>
        </Select>
      </div>
      {preview.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {preview.map((p) => (
            <div key={p.i} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-slate-600">Installment {p.i} · <span className="text-slate-400">{fmtDate(p.due)}</span></span>
              <b className="text-slate-900">{inr(p.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function InvoiceEditModal({ invoice, onClose, onDone }: { invoice: Invoice | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (invoice) { setTitle(invoice.title); setAmount(String(invoice.amount)); setDueDate(dueDay(invoice)); setReason(''); }
  }, [invoice]);
  const amountChanged = !!invoice && Number(amount) !== invoice.amount;

  const submit = async () => {
    if (!invoice) return;
    if (!title.trim()) return toast.error('Enter a title');
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0 || amount === '') return toast.error('Enter a valid amount');
    if (n < invoice.paidAmount) return toast.error(`Amount cannot be less than what is already paid (${inr(invoice.paidAmount)})`);
    if (!dueDate) return toast.error('Choose a due date');
    setSaving(true);
    try {
      await api.put(`/fees/invoices/${invoice._id}`, { title: title.trim(), amount: n, dueDate, ...(amountChanged && reason.trim() && { reason: reason.trim() }) });
      toast.success('Installment updated');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!invoice} onClose={onClose} title="Edit installment" subtitle={invoice && invoice.paidAmount > 0 ? `${inr(invoice.paidAmount)} already paid` : 'Change the title, amount or due date.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit}>Save changes</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="sm:col-span-2" />
        <Input label="Amount (₹)" type="number" min={invoice?.paidAmount ?? 0} value={amount} onChange={(e) => setAmount(e.target.value)}
          hint="Lower the amount to give a discount." />
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        {amountChanged && (
          <Input label="Reason for change (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120}
            placeholder="e.g. Sibling discount" className="sm:col-span-2" />
        )}
      </div>
    </Modal>
  );
}

function ChargeModal({ open, onClose, studentId, onDone }: { open: boolean; onClose: () => void; studentId: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(ymd());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setTitle(''); setAmount(''); setDueDate(ymd()); } }, [open]);

  const submit = async () => {
    if (!title.trim()) return toast.error('Enter a title, e.g. "Books fee"');
    if (!(Number(amount) > 0)) return toast.error('Enter a valid amount');
    if (!dueDate) return toast.error('Choose a due date');
    setSaving(true);
    try {
      await api.post('/fees/invoices', { studentId, title: title.trim(), amount: Number(amount), dueDate });
      toast.success('Charge added');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add charge" subtitle="A one-off fee such as books, exam or transport."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit} icon={<Plus className="h-4 w-4" />}>Add charge</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Books fee" autoFocus className="sm:col-span-2" />
        <Input label="Amount (₹)" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
    </Modal>
  );
}

function VoidModal({ payment, onClose, onDone }: { payment: FeePayment | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (payment) setReason(''); }, [payment]);

  const submit = async () => {
    if (!payment) return;
    if (reason.trim().length < 3) return toast.error('Enter a reason (at least 3 characters)');
    setSaving(true);
    try {
      await api.post(`/fees/payments/${payment._id}/void`, { reason: reason.trim() });
      toast.success(`Receipt ${payment.receiptNo} cancelled`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!payment} onClose={onClose} size="sm" title="Cancel receipt"
      subtitle={payment ? `${payment.receiptNo} · ${inr(payment.amount)}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Keep receipt</Button><Button variant="danger" loading={saving} disabled={reason.trim().length < 3} onClick={submit}>Cancel receipt</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">The amount is taken back off the installment. The receipt stays on record, marked as cancelled.</p>
        <Textarea label="Reason *" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong amount entered, duplicate entry" autoFocus />
      </div>
    </Modal>
  );
}

function DeactivateModal({ open, onClose, student, pending, onDone }: {
  open: boolean; onClose: () => void; student: { _id: string; name: string; hasPortal?: boolean }; pending: number; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [waiveDues, setWaiveDues] = useState(false);
  const [disablePortal, setDisablePortal] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setReason(''); setWaiveDues(false); setDisablePortal(false); } }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      await api.put(`/students/${student._id}`, { status: 'inactive', reason: reason.trim() || undefined, waiveDues, disablePortal });
      toast.success(`${student.name} deactivated`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Deactivate student" subtitle={`${student.name} will no longer appear in active lists, attendance or reminders.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={saving} onClick={submit} icon={<Power className="h-4 w-4" />}>Deactivate</Button></>}>
      <div className="space-y-4">
        <Textarea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
          placeholder="e.g. Course completed, moved to another city" />
        <Toggle checked={waiveDues} onChange={setWaiveDues} label="Write off unpaid fees"
          description={pending > 0 ? `${inr(pending)} still due will be marked as waived and stop showing as pending.` : 'Nothing is pending right now.'}
          disabled={pending <= 0} />
        <Toggle checked={disablePortal} onChange={setDisablePortal} label="Remove parent login"
          description={student.hasPortal ? 'The parent can no longer see this student in the portal.' : 'This student has no parent login.'}
          disabled={!student.hasPortal} />
        <p className="text-xs text-slate-400">Attendance, marks and receipts are kept. You can re-activate the student any time.</p>
      </div>
    </Modal>
  );
}

/* ---------------- Page ---------------- */

export default function StudentProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const { session, hasFeature } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const { data, loading, error, reload, setData } = useApi<ProfileData>(`/students/${id}`);
  const [tab, setTab] = useState<TabKey>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [creds, setCreds] = useState<PortalResult | null>(null);
  const [deactOpen, setDeactOpen] = useState(false);
  const [confirmPortalRemove, setConfirmPortalRemove] = useState(false);
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [delInv, setDelInv] = useState<Invoice | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [voidFor, setVoidFor] = useState<FeePayment | null>(null);
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalEmail, setPortalEmail] = useState('');
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [structOpen, setStructOpen] = useState(false);
  const [note, setNote] = useState('');
  // Client-side paging (20 per page) for the long lists; charts/summaries keep using the full data.
  const attPage = useClientPage(data?.attendance.history, id);
  const testPage = useClientPage(data?.scores.results, id);
  const invPage = useClientPage(data?.fees?.invoices, id);
  const payPage = useClientPage(data?.fees?.payments, id);
  const notePage = useClientPage(data?.student.notes, id);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState message={error ?? 'Student not found'} onRetry={reload} />;

  const { student: s, attendance, scores, fees } = data;

  const toggleStatus = async () => {
    if (s.status === 'active') return setDeactOpen(true);
    setBusy('status');
    try {
      await api.put(`/students/${s._id}`, { status: 'active' });
      toast.success('Student re-activated');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await api.delete(`/students/${s._id}`);
      toast.success(`${s.name} deleted`);
      nav('/app/students', { replace: true });
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(null);
    }
  };

  const createPortal = async () => {
    setBusy('portal');
    try {
      const { data: c } = await api.post<PortalResult>(`/students/${s._id}/portal`, portalEmail ? { email: portalEmail } : {});
      setPortalOpen(false);
      setCreds(c);
      toast.success(c.linkedExisting ? 'Linked to the existing parent login' : 'Parent portal access ready');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const removePortal = async () => {
    setBusy('portal-remove');
    try {
      await api.delete(`/students/${s._id}/portal`);
      toast.success('Parent portal access removed');
      setConfirmPortalRemove(false);
      setPortalOpen(false);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const deleteInvoice = async () => {
    if (!delInv) return;
    setBusy('inv-delete');
    try {
      await api.delete(`/fees/invoices/${delInv._id}`);
      toast.success(`${delInv.title} deleted`);
      setDelInv(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy('note');
    try {
      const { data: notes } = await api.post<Student['notes']>(`/students/${s._id}/notes`, { text: note.trim() });
      setData({ ...data, student: { ...s, notes } });
      setNote('');
      toast.success('Note added');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'attendance', label: 'Attendance', count: attendance.history.length },
    { value: 'tests', label: 'Tests', count: scores.results.length },
    ...(isOwner ? [{ value: 'fees' as const, label: 'Fees' }] : []),
    { value: 'notes', label: 'Notes', count: s.notes?.length ?? 0 },
  ];
  const overdueAmt = fees?.invoices.filter(isOverdue).reduce((a, i) => a + i.amount - i.paidAmount, 0) ?? 0;
  const heat = [...attendance.history].reverse();

  return (
    <div>
      <Link to="/app/students" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>

      {/* Header card */}
      <div className="card relative mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 sm:h-28">
          <div className="h-full w-full grid-bg opacity-30" />
        </div>
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-col gap-4 sm:-mt-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-end gap-4">
              <div className="rounded-full ring-4 ring-white"><Avatar name={s.name} size="lg" /></div>
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{s.name}</h1>
                  <StatusBadge status={s.status} />
                  {s.hasPortal && <Badge tone="violet">Portal active</Badge>}
                </div>
                <p className="text-sm text-slate-500">{s.studentCode}{s.course && ` · ${s.course}`}{s.joiningDate && ` · Joined ${fmtDate(s.joiningDate)}`}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.parentUserId && hasFeature('parentPortal') && (
                <Link to={`/app/messages?to=${s.parentUserId}`} className="btn-primary btn-sm">
                  <MessageCircle className="h-3.5 w-3.5" /> Message parent
                </Link>
              )}
              {isOwner && (<>
                <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>Edit</Button>
                <Button variant="secondary" size="sm" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => { setPortalEmail(s.parentEmail ?? ''); setPortalOpen(true); }}>
                  {s.hasPortal ? 'Reset portal login' : 'Parent portal access'}
                </Button>
                <Button variant="secondary" size="sm" loading={busy === 'status'} icon={<Power className="h-3.5 w-3.5" />} onClick={toggleStatus}>
                  {s.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDel(true)}>Delete</Button>
              </>)}
            </div>
          </div>

          <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 md:grid-cols-3">
            <div className="space-y-2">
              <p className="label">Student</p>
              <InfoLine icon={<Phone className="h-4 w-4" />}>{s.phone || '—'}</InfoLine>
              <InfoLine icon={<CalendarDays className="h-4 w-4" />}>{s.dob ? fmtDate(s.dob) : '—'}{s.gender && <span className="capitalize"> · {s.gender}</span>}</InfoLine>
              <InfoLine icon={<MapPin className="h-4 w-4" />}>{s.address || '—'}</InfoLine>
            </div>
            <div className="space-y-2">
              <p className="label">Parent</p>
              <InfoLine icon={<User className="h-4 w-4" />}>{s.parentName || '—'}</InfoLine>
              <InfoLine icon={<Phone className="h-4 w-4" />}>{s.parentPhone ? <a className="hover:text-brand-700" href={`tel:${s.parentPhone}`}>{s.parentPhone}</a> : '—'}</InfoLine>
              <InfoLine icon={<Mail className="h-4 w-4" />}>{s.parentEmail || '—'}</InfoLine>
            </div>
            <div className="space-y-2">
              <p className="label">Batches</p>
              <BatchChips batches={s.batches} max={6} size="md" />
              <div className="space-y-1 pt-1">
                {s.batches.map((b) => (
                  <p key={b._id} className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">{b.subject ?? b.name}</span>
                    {b.days?.length ? ` · ${b.days.join('/')}` : ''}{b.startTime ? ` · ${fmtTime(b.startTime)}` : ''}{b.teacherId?.name ? ` · ${b.teacherId.name}` : ''}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className={clsx('mb-6 grid gap-4 sm:grid-cols-2', isOwner ? 'xl:grid-cols-4' : 'xl:grid-cols-2')}>
        <StatCard label="Attendance" value={<span className={pctTone(attendance.total ? attendance.pct : null)}>{attendance.total ? `${attendance.pct}%` : '—'}</span>}
          icon={<CalendarCheck className="h-5 w-5" />} tone="green" hint={`${attendance.present} of ${attendance.total} classes attended`} />
        <StatCard label="Average score" value={<span className={pctTone(scores.avg)}>{scores.avg != null ? `${scores.avg}%` : '—'}</span>}
          icon={<Trophy className="h-5 w-5" />} tone="brand" hint={`${scores.results.length} tests graded`} />
        {isOwner && fees && <>
          <StatCard label="Fees paid" value={inr(fees.paid)} icon={<Wallet className="h-5 w-5" />} tone="sky"
            hint={fees.total ? <Progress value={(fees.paid / fees.total) * 100} tone="brand" /> : 'No fee structure'} />
          <StatCard label="Fees pending" value={<span className={overdueAmt > 0 ? 'text-rose-600' : ''}>{inr(fees.pending)}</span>} icon={<IndianRupee className="h-5 w-5" />}
            tone={overdueAmt > 0 ? 'rose' : 'amber'} hint={overdueAmt > 0 ? <span className="text-rose-600">{inr(overdueAmt)} overdue</span> : `of ${inr(fees.total)} total`} />
        </>}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={tabs} className="mb-5" />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title="Subject-wise performance" subtitle="Average % across graded tests" icon={<TrendingUp className="h-5 w-5" />} />
            {scores.bySubject.length === 0 ? <EmptyState title="No graded tests yet" text="Scores will appear once tests are graded." /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scores.bySubject} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="subject" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip format={(v) => `${v}%`} />} />
                    <Bar dataKey="avg" name="Average" radius={[8, 8, 0, 0]} maxBarSize={56}>
                      {scores.bySubject.map((x) => <Cell key={x.subject} fill={barColor(x.avg)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Recent tests" icon={<BookOpen className="h-5 w-5" />}
              action={scores.results.length > 5 && <button className="text-sm font-semibold text-brand-700" onClick={() => setTab('tests')}>View all</button>} />
            {scores.results.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No results yet</p> : (
              <div className="space-y-3">
                {scores.results.slice(0, 5).map((r) => (
                  <Link key={r.testId} to={`/app/tests/${r.testId}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{r.subject}{r.topic && <span className="font-normal text-slate-500"> · {r.topic}</span>}</p>
                      <p className="text-xs text-slate-400">{fmtDate(r.date)}</p>
                    </div>
                    <div className="text-right">
                      {r.absent ? <Badge tone="red">Absent</Badge> : <>
                        <p className={clsx('text-sm font-bold', pctTone(r.pct))}>{r.pct}%</p>
                        <p className="text-xs text-slate-400">{r.marks}/{r.maxMarks}</p>
                      </>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Attendance history" subtitle={`Last ${heat.length} classes`} icon={<CalendarCheck className="h-5 w-5" />}
              action={<div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                {(['present', 'late', 'absent'] as const).map((k) => <span key={k} className="flex items-center gap-1.5 capitalize"><span className={clsx('h-2.5 w-2.5 rounded-sm', DOT[k])} />{k}</span>)}
              </div>} />
            {heat.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No attendance recorded yet</p> : (
              <div className="flex flex-wrap gap-1.5">
                {heat.map((h, i) => (
                  <div key={i} title={`${fmtDate(h.date)} · ${h.batch ?? ''} · ${h.status ?? '—'}`}
                    className={clsx('h-5 w-5 rounded-md transition hover:scale-125 sm:h-6 sm:w-6', DOT[h.status ?? ''] ?? 'bg-slate-200')} />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card pad={false}>
          {attendance.history.length === 0 ? <EmptyState title="No attendance yet" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Batch</th><th>Status</th></tr></thead>
                <tbody>
                  {attPage.items.map((h, i) => (
                    <tr key={attPage.offset + i}>
                      <td className="font-medium text-slate-800">{fmtDate(h.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="text-slate-600">{h.batch ?? '—'}</td>
                      <td><StatusBadge status={h.status ?? 'skipped'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager {...attPage.pager} noun="classes" />
        </Card>
      )}

      {tab === 'tests' && (
        <Card pad={false}>
          {scores.results.length === 0 ? <EmptyState title="No test results yet" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Test</th><th>Date</th><th>Marks</th><th>Score</th></tr></thead>
                <tbody>
                  {testPage.items.map((r) => (
                    <tr key={r.testId} className="cursor-pointer" onClick={() => nav(`/app/tests/${r.testId}`)}>
                      <td><p className="font-semibold text-slate-800">{r.subject}</p><p className="text-xs text-slate-400">{r.topic || '—'}</p></td>
                      <td className="text-slate-600">{fmtDate(r.date)}</td>
                      <td>{r.absent ? <Badge tone="red">Absent</Badge> : <span className="font-medium">{r.marks ?? '—'} / {r.maxMarks}</span>}</td>
                      <td>
                        {r.pct == null ? <span className="text-slate-400">—</span> : (
                          <div className="flex items-center gap-3">
                            <Progress value={r.pct} className="w-24" />
                            <span className={clsx('font-bold', pctTone(r.pct))}>{r.pct}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager {...testPage.pager} noun="results" />
        </Card>
      )}

      {tab === 'fees' && isOwner && fees && (
        fees.invoices.length === 0 ? (
          <Card>
            <EmptyState icon={<IndianRupee className="h-7 w-7" />} title="No fee structure yet" text="Set a total fee and split it into installments to start tracking payments."
              action={<div className="flex flex-wrap justify-center gap-2">
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setStructOpen(true)}>Set fee structure</Button>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setChargeOpen(true)}>Add charge</Button>
              </div>} />
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <Card pad={false} className="lg:col-span-3">
              <div className="p-5 pb-0"><CardHeader title="Installments" subtitle={`${inr(fees.paid)} of ${inr(fees.total)} collected`} icon={<IndianRupee className="h-5 w-5" />}
                action={<Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setChargeOpen(true)}>Add charge</Button>} /></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Installment</th><th>Due</th><th>Amount</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {invPage.items.map((inv) => {
                      const od = isOverdue(inv);
                      const today = isDueToday(inv);
                      return (
                        <tr key={inv._id}>
                          <td className="font-semibold text-slate-800">{inv.title}</td>
                          <td className={od ? 'font-semibold text-rose-600' : today ? 'font-semibold text-amber-600' : 'text-slate-600'}>
                            {fmtDate(inv.dueDate)}
                            {today && <p className="text-[11px] font-semibold text-amber-600">Due today</p>}
                          </td>
                          <td>
                            <p className="font-semibold">{inr(inv.amount)}</p>
                            {inv.paidAmount > 0 && inv.paidAmount < inv.amount && <p className="text-xs text-slate-400">{inr(inv.paidAmount)} paid</p>}
                          </td>
                          <td><StatusBadge status={od ? 'overdue' : inv.status} /></td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {inv.status !== 'paid' && <Button size="sm" variant="success" onClick={() => setPayFor(inv)}>Record payment</Button>}
                              <button type="button" onClick={() => setEditInv(inv)} title="Edit installment" aria-label={`Edit ${inv.title}`}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                              {inv.paidAmount === 0 && (
                                <button type="button" onClick={() => setDelInv(inv)} title="Delete installment" aria-label={`Delete ${inv.title}`}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...invPage.pager} noun="installments" />
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Payments" icon={<Receipt className="h-5 w-5" />} />
              {fees.payments.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No payments yet</p> : (
                <div className="space-y-2">
                  {payPage.items.map((p) => {
                    const isVoid = p.status === 'void';
                    return (
                      <div key={p._id} className={clsx('flex items-center gap-3 rounded-xl border p-3 transition', isVoid ? 'border-slate-100 bg-slate-50/60' : 'border-slate-100 hover:border-brand-200 hover:bg-brand-50/30')}>
                        <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', isVoid ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600')}>
                          {isVoid ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </div>
                        <Link to={`/app/fees/receipt/${p._id}`} className="min-w-0 flex-1" title={isVoid && p.voidReason ? `Cancelled: ${p.voidReason}` : undefined}>
                          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <span className={clsx(isVoid && 'text-slate-400 line-through')}>{inr(p.amount)}</span>
                            {isVoid && <Badge tone="red">Cancelled</Badge>}
                          </p>
                          <p className="truncate text-xs text-slate-400">{p.receiptNo} · {fmtDateShort(p.paidAt)} · <span className="uppercase">{p.method}</span></p>
                          {isVoid && p.voidReason && <p className="truncate text-xs text-rose-500">{p.voidReason}</p>}
                        </Link>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Link to={`/app/fees/receipt/${p._id}`} className="text-xs font-semibold text-brand-700">Receipt →</Link>
                          {!isVoid && (
                            <button type="button" onClick={() => setVoidFor(p)} className="text-xs font-semibold text-rose-600 hover:underline">Cancel receipt</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Pager {...payPage.pager} noun="payments" className={CARD_PAGER} />
            </Card>
          </div>
        )
      )}

      {tab === 'notes' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Add a note" icon={<MessageSquarePlus className="h-5 w-5" />} />
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Needs extra practice in algebra; spoke to parent on call." />
            <Button className="mt-3 w-full" loading={busy === 'note'} disabled={!note.trim()} onClick={addNote}>Save note</Button>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Notes" subtitle="Private to staff" icon={<StickyNote className="h-5 w-5" />} />
            {!s.notes?.length ? <p className="py-8 text-center text-sm text-slate-400">No notes yet</p> : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {notePage.items.map((n, i) => (
                  <li key={notePage.offset + i} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{n.text}</p>
                    <p className="mt-1 text-xs text-slate-400">{n.by} · {timeAgo(n.at)}</p>
                  </li>
                ))}
              </ol>
            )}
            <Pager {...notePage.pager} noun="notes" className={CARD_PAGER} />
          </Card>
        </div>
      )}

      {/* Modals */}
      {isOwner && <>
        <StudentFormModal open={editOpen} onClose={() => setEditOpen(false)} student={s as unknown as Student} onSaved={() => reload()} />
        <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={remove} danger loading={busy === 'delete'}
          title="Delete student?" confirmLabel="Delete permanently"
          text={<>This permanently removes <b>{s.name}</b> with their attendance, test records and unpaid invoices. Students with fee payments on record can’t be deleted — deactivate them instead so receipts stay in your accounts.</>} />
        <PaymentModal invoice={payFor} onClose={() => setPayFor(null)} onDone={reload} />
        <StructureModal open={structOpen} onClose={() => setStructOpen(false)} studentId={s._id} onDone={reload} />
        <InvoiceEditModal invoice={editInv} onClose={() => setEditInv(null)} onDone={reload} />
        <ChargeModal open={chargeOpen} onClose={() => setChargeOpen(false)} studentId={s._id} onDone={reload} />
        <VoidModal payment={voidFor} onClose={() => setVoidFor(null)} onDone={reload} />
        <DeactivateModal open={deactOpen} onClose={() => setDeactOpen(false)} student={s} pending={fees?.pending ?? 0} onDone={reload} />
        <ConfirmDialog open={!!delInv} onClose={() => setDelInv(null)} onConfirm={deleteInvoice} danger loading={busy === 'inv-delete'}
          title="Delete installment?" confirmLabel="Delete"
          text={delInv ? <>This removes <b>{delInv.title}</b> ({inr(delInv.amount)}). Only installments with nothing paid can be deleted.</> : undefined} />
        <ConfirmDialog open={confirmPortalRemove} onClose={() => setConfirmPortalRemove(false)} onConfirm={removePortal} danger loading={busy === 'portal-remove'}
          title="Remove parent access?" confirmLabel="Remove access"
          text={<>The parent will no longer see <b>{s.name}</b> in their portal. If they have other children here, their login keeps working for them.</>} />

        <Modal open={portalOpen} onClose={() => setPortalOpen(false)} title="Parent portal access"
          subtitle="Parents can see attendance, marks, fees and receipts."
          footer={hasFeature('parentPortal') ? <>
            {s.hasPortal && (
              <Button variant="ghost" className="mr-auto text-rose-600 hover:bg-rose-50" icon={<UserX className="h-4 w-4" />} onClick={() => setConfirmPortalRemove(true)}>Remove access</Button>
            )}
            <Button variant="secondary" onClick={() => setPortalOpen(false)}>Cancel</Button>
            <Button loading={busy === 'portal'} onClick={createPortal} icon={<KeyRound className="h-4 w-4" />}>{s.hasPortal ? 'Reset password' : 'Create login'}</Button>
          </> : undefined}>
          {hasFeature('parentPortal') ? (
            <div className="space-y-3">
              <Input label="Parent email" type="email" value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} placeholder="parent@example.com" />
              <p className="text-xs text-slate-500">{s.hasPortal
                ? 'A new password will be generated. The old one stops working and the parent is signed out everywhere.'
                : 'A login with a random password will be generated. If this email already has a parent login (for a sibling), the student is added to it and the password stays the same.'}</p>
            </div>
          ) : (
            <UpgradeCard emoji="👨‍👩‍👧" title="Give parents their own portal" text="Parents track attendance, marks and pay fees online — fewer calls to your office." compact />
          )}
        </Modal>

        <Modal open={!!creds} onClose={() => setCreds(null)}
          title={creds?.linkedExisting || !creds?.password ? 'Linked to existing parent login' : 'Parent login ready'}
          subtitle={creds?.linkedExisting || !creds?.password ? undefined : 'Share these credentials with the parent.'}
          footer={<Button onClick={() => setCreds(null)}>Done</Button>}>
          {creds && (creds.linkedExisting || !creds.password ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {s.name} was added to the existing parent login <b>{creds.email}</b> (a sibling already uses it). Their password is unchanged — the parent will see this child after signing in.
              </p>
              <CopyRow label="Email" value={creds.email} />
            </div>
          ) : (
            <div className="space-y-3">
              <CopyRow label="Email" value={creds.email} />
              <CopyRow label="Password" value={creds.password} />
              <CopyRow label="Share message" value={`Login at ${location.origin}/login — Email: ${creds.email} · Password: ${creds.password}`} />
              <p className="text-xs text-amber-600">This password is shown only once.</p>
            </div>
          ))}
        </Modal>
      </>}
    </div>
  );
}
