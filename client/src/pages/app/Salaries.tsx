import {
  AlertTriangle, Banknote, BellRing, CalendarClock, CheckCircle2, Download, Info, MoreVertical, Pencil, Plus, RotateCcw, Settings2, Trash2, Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, StatCard, Tabs, Toggle, clsx,
} from '../../components/ui';
import { useApi, useClientPage } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, inr, ymd } from '../../lib/format';
import { SALARY_METHODS, monthName, teacherName, type SalaryRow } from '../../lib/staff';

interface SalarySettings { enabled: boolean; payDay: number; daysBefore: number; onDueDate: boolean; daysAfter: number }
interface SheetResp {
  month: string; label: string; dueDate: string; items: SalaryRow[];
  summary: { count: number; total: number; paid: number; pending: number; paidCount: number };
  overdue: { count: number; amount: number; months: string[] };
  months: string[]; teachersWithoutSalary: number; settings: SalarySettings;
}
type Filter = 'all' | 'unpaid' | 'paid';

const daysUntil = (d: string) => {
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - t.getTime()) / 86400000);
};
function ordinal(n: number) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

export default function Salaries() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') && /^\d{4}-\d{2}$/.test(params.get('month')!) ? params.get('month')! : undefined;
  const filter = (['all', 'unpaid', 'paid'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as Filter;
  const setParam = (k: string, v?: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const { data, loading, error, reload } = useApi<SheetResp>('/salaries', { month, status: filter === 'all' ? undefined : filter });
  // 20 teachers per page (Previous / Next under the table).
  const salPage = useClientPage(data?.items, `${month}|${filter}`);
  const [pay, setPay] = useState<SalaryRow | null>(null);
  const [adjust, setAdjust] = useState<SalaryRow | null>(null);
  const [confirm, setConfirm] = useState<{ row: SalaryRow; kind: 'undo' | 'delete' } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const { data: r } = await api.post<{ created: number }>('/salaries/generate', { month: data.month });
      toast.success(r.created ? `Created ${r.created} salary record${r.created === 1 ? '' : 's'}` : 'All teachers already have a record for this month');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remindNow = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post<{ sent: number }>('/salaries/run-reminders');
      toast.success(r.sent ? `Reminder sent for ${r.sent} salar${r.sent === 1 ? 'y' : 'ies'}` : 'Nothing to remind about today');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'undo') await api.delete(`/salaries/${confirm.row._id}/payments/last`);
      else await api.delete(`/salaries/${confirm.row._id}`);
      toast.success(confirm.kind === 'undo' ? 'Payment undone' : 'Record removed');
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCSV(`salaries-${data.month}.csv`, data.items.map((s) => ({
      Teacher: teacherName(s.teacherId), Month: data.label, Base: s.baseAmount, Bonus: s.bonus ?? 0, Deduction: s.deduction ?? 0, 'Leave days': s.leaveDays ?? 0, 'Leave cut': s.leaveDeduction ?? 0,
      'Net salary': s.amount, Paid: s.paidAmount, Pending: s.amount - s.paidAmount, Status: s.status, 'Due date': ymd(new Date(s.dueDate)),
      'Paid on': s.paidAt ? ymd(new Date(s.paidAt)) : '', Methods: s.payments.map((p) => p.method).join(' + '), Note: s.note ?? '',
    })));
  };

  const due = data ? daysUntil(data.dueDate) : 0;
  const pct = data?.summary.total ? Math.round((data.summary.paid / data.summary.total) * 100) : 0;

  return (
    <div>
      <PageHeader title="Teacher salaries" subtitle="Monthly payroll with automatic reminders before, on and after pay day"
        actions={<>
          <Button variant="secondary" icon={<BellRing className="h-4 w-4" />} onClick={remindNow} disabled={busy}>Send reminders now</Button>
          <Button variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>Pay day & reminders</Button>
        </>} />

      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div>
      ) : (
        <>
          {data.overdue.count > 0 && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center">
              <AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" />
              <div className="flex-1">
                <p className="font-bold text-rose-800">{inr(data.overdue.amount)} in teacher salaries is overdue</p>
                <p className="text-sm text-rose-700">{data.overdue.count} unpaid salar{data.overdue.count === 1 ? 'y' : 'ies'} past pay day · {data.overdue.months.map(monthName).join(', ')}</p>
              </div>
              {data.overdue.months[0] !== data.month && (
                <Button variant="danger" size="sm" onClick={() => { setParam('month', data.overdue.months[0]); setParam('status', 'unpaid'); }}>View {monthName(data.overdue.months[0])}</Button>
              )}
            </div>
          )}
          {!data.settings.enabled && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              <Info className="h-5 w-5 shrink-0" /> Automatic salary reminders are off. <button className="font-semibold underline" onClick={() => setSettingsOpen(true)}>Turn them on</button>
            </div>
          )}

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={data.month} onChange={(e) => setParam('month', e.target.value)} className="sm:w-60" aria-label="Month">
              {data.months.map((m) => <option key={m} value={m}>Salary for {monthName(m)}</option>)}
            </Select>
            <Tabs<Filter> value={filter} onChange={(v) => setParam('status', v === 'all' ? undefined : v)} tabs={[
              { value: 'all', label: 'All', count: data.summary.count },
              { value: 'unpaid', label: 'Unpaid', count: data.summary.count - data.summary.paidCount },
              { value: 'paid', label: 'Paid', count: data.summary.paidCount },
            ]} />
            <Button className="sm:ml-auto" variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!data.items.length}>Export</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={`Payroll · ${data.label}`} value={inr(data.summary.total)} icon={<Banknote className="h-5 w-5" />} tone="brand" hint={`${data.summary.count} teacher${data.summary.count === 1 ? '' : 's'}`} />
            <StatCard label="Paid" value={inr(data.summary.paid)} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint={`${pct}% · ${data.summary.paidCount} of ${data.summary.count} done`} />
            <StatCard label="Pending" value={inr(data.summary.pending)} icon={<Wallet className="h-5 w-5" />} tone={data.summary.pending && due < 0 ? 'rose' : 'amber'} />
            <StatCard label="Pay day" value={fmtDate(data.dueDate, { day: 'numeric', month: 'short' })} icon={<CalendarClock className="h-5 w-5" />} tone="sky"
              hint={data.summary.pending ? (due > 0 ? `in ${due} day${due === 1 ? '' : 's'}` : due === 0 ? <span className="font-bold text-amber-600">Today</span> : <span className="font-bold text-rose-600">{-due} day{due === -1 ? '' : 's'} overdue</span>) : 'All paid ✓'} />
          </div>

          {data.teachersWithoutSalary > 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
              <Info className="h-4 w-4 shrink-0 text-slate-400" />
              {data.teachersWithoutSalary} active teacher{data.teachersWithoutSalary === 1 ? ' has' : 's have'} no monthly salary set, so no salary record is made for them.
              <Link to="/app/teachers" className="font-semibold text-brand-600 hover:underline">Set salary →</Link>
            </p>
          )}

          <Card pad={false} className="mt-6 overflow-hidden">
            {data.items.length === 0 ? (
              <EmptyState icon={<Banknote className="h-7 w-7" />} title={filter === 'all' ? `No salary sheet for ${data.label}` : 'Nothing here'}
                text={filter === 'all' ? 'Salary records are created automatically each month for teachers with a monthly salary. You can also create this month now.' : undefined}
                action={filter === 'all' && <Button icon={<Plus className="h-4 w-4" />} loading={busy} onClick={generate}>Create salary sheet</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Teacher</th>
                      <th className="px-3 py-3 text-right">Salary</th>
                      <th className="px-3 py-3 text-right">Bonus / Cut</th>
                      <th className="px-3 py-3 text-right">Net</th>
                      <th className="px-3 py-3 text-right">Paid</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-5 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salPage.items.map((s) => {
                      const name = teacherName(s.teacherId);
                      const left = s.amount - s.paidAmount;
                      const d = daysUntil(s.dueDate);
                      const inactive = typeof s.teacherId !== 'string' && s.teacherId?.active === false;
                      return (
                        <tr key={s._id} className={clsx('hover:bg-slate-50/60', loading && 'opacity-60')}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={name || '?'} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{name}{inactive && <Badge className="ml-2">Inactive</Badge>}</p>
                                <p className="truncate text-xs text-slate-400">
                                  {s.payments.length ? `Paid ${s.payments.map((p) => `${inr(p.amount)} by ${p.method} on ${fmtDate(p.paidAt, { day: 'numeric', month: 'short' })}`).join(' · ')}` : `Due ${fmtDate(s.dueDate, { day: 'numeric', month: 'short' })}`}
                                  {s.note && ` · ${s.note}`}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-slate-700">{inr(s.baseAmount)}</td>
                          <td className="px-3 py-3 text-right text-xs">
                            {s.bonus ? <span className="font-semibold text-emerald-600">+{inr(s.bonus)}</span> : null}
                            {s.bonus && s.deduction ? <br /> : null}
                            {s.deduction ? <span className="font-semibold text-rose-600">−{inr(s.deduction)}</span> : null}
                            {s.leaveDeduction ? <><br /><span className="font-semibold text-rose-600" title="Cut automatically for leave / absent days marked on Staff check-in">−{inr(s.leaveDeduction)} · {s.leaveDays} leave day{s.leaveDays === 1 ? '' : 's'}</span></> : null}
                            {!s.bonus && !s.deduction && !s.leaveDeduction && <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-slate-900">{inr(s.amount)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-emerald-700">{s.paidAmount ? inr(s.paidAmount) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-3">
                            {s.status === 'paid' ? <Badge tone="green">Paid</Badge>
                              : d < 0 ? <Badge tone="red">Overdue {-d}d</Badge>
                              : d === 0 ? <Badge tone="amber">Due today</Badge>
                              : <Badge tone={s.status === 'partial' ? 'amber' : 'gray'}>{s.status === 'partial' ? `${inr(left)} left` : `Due in ${d}d`}</Badge>}
                            {s.status === 'partial' && d < 0 && <p className="mt-0.5 text-[11px] text-slate-500">{inr(left)} left</p>}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {s.status !== 'paid' && <Button size="sm" variant="success" icon={<Wallet className="h-3.5 w-3.5" />} onClick={() => setPay(s)}>Pay</Button>}
                              <RowMenu items={[
                                { label: 'Bonus / deduction', icon: <Pencil className="h-4 w-4" />, onClick: () => setAdjust(s) },
                                ...(s.payments.length ? [{ label: 'Undo last payment', icon: <RotateCcw className="h-4 w-4" />, onClick: () => setConfirm({ row: s, kind: 'undo' as const }) }] : []),
                                ...(!s.paidAmount ? [{ label: 'Remove record', icon: <Trash2 className="h-4 w-4" />, onClick: () => setConfirm({ row: s, kind: 'delete' as const }), danger: true }] : []),
                              ]} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager {...salPage.pager} noun="salaries" />
          </Card>
          {data.items.length > 0 && filter === 'all' && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} loading={busy} onClick={generate}>Add missing teachers to this month</Button>
            </div>
          )}
        </>
      )}

      <PayModal row={pay} onClose={() => setPay(null)} onSaved={reload} />
      <AdjustModal row={adjust} onClose={() => setAdjust(null)} onSaved={reload} />
      <SettingsModal open={settingsOpen} current={data?.settings} onClose={() => setSettingsOpen(false)} onSaved={reload} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm} loading={busy} danger
        title={confirm?.kind === 'undo' ? 'Undo the last payment?' : 'Remove this salary record?'}
        confirmLabel={confirm?.kind === 'undo' ? 'Undo payment' : 'Remove'}
        text={confirm?.kind === 'undo'
          ? `The latest payment of ${inr(confirm.row.payments[confirm.row.payments.length - 1]?.amount)} to ${teacherName(confirm.row.teacherId)} will be removed and the salary will show as unpaid again.`
          : 'Use this for a teacher who should not be paid for this month (e.g. left before it). Reminders stop for this record.'} />
    </div>
  );
}

function RowMenu({ items }: { items: { label: string; icon: JSX.Element; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="More actions">
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 text-left shadow-lg">
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }}
              className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', it.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50')}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PayModal({ row, onClose, onSaved }: { row: SalaryRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: '', method: 'bank', paidAt: ymd(), reference: '', note: '' });
  const [saving, setSaving] = useState(false);
  const left = row ? row.amount - row.paidAmount : 0;
  useEffect(() => {
    if (row) setF({ amount: String(row.amount - row.paidAmount), method: 'bank', paidAt: ymd(), reference: '', note: '' });
  }, [row]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!row) return;
    const amount = Number(f.amount);
    if (!amount || amount <= 0) return toast.error('Enter the amount paid');
    if (amount > left) return toast.error(`Only ${inr(left)} is left to pay`);
    setSaving(true);
    try {
      await api.post(`/salaries/${row._id}/pay`, { ...f, amount });
      toast.success(amount >= left ? `${teacherName(row.teacherId)}'s salary marked as paid` : 'Part payment saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={row ? `Pay ${teacherName(row.teacherId)}` : ''} subtitle={row ? `Salary for ${monthName(row.month)} · ${inr(left)} to pay` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="salary-pay" variant="success" loading={saving}>Save payment</Button></>}>
      <form id="salary-pay" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Amount (₹) *" type="number" min={1} max={left} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus
          hint={Number(f.amount) < left ? `${inr(left - Number(f.amount || 0))} will stay pending` : 'Full salary'} />
        <Select label="Paid by" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          {SALARY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <Input label="Payment date" type="date" max={ymd()} value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} />
        <Input label="Reference / UTR" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Optional" maxLength={80} />
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" className="sm:col-span-2" maxLength={200} />
        <p className="text-xs text-slate-500 sm:col-span-2">The teacher gets an in-app notification that their salary was paid.</p>
      </form>
    </Modal>
  );
}

function AdjustModal({ row, onClose, onSaved }: { row: SalaryRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ baseAmount: '', bonus: '', deduction: '', note: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (row) setF({ baseAmount: String(row.baseAmount), bonus: row.bonus ? String(row.bonus) : '', deduction: row.deduction ? String(row.deduction) : '', note: row.note ?? '' });
  }, [row]);
  const leaveCut = row?.leaveDeduction ?? 0;
  const net = Number(f.baseAmount || 0) + Number(f.bonus || 0) - Number(f.deduction || 0) - leaveCut;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    try {
      await api.put(`/salaries/${row._id}`, { baseAmount: f.baseAmount, bonus: f.bonus || 0, deduction: f.deduction || 0, note: f.note });
      toast.success('Salary updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={row ? `Adjust ${teacherName(row.teacherId)}'s salary` : ''} subtitle={row ? monthName(row.month) : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="salary-adjust" loading={saving}>Save</Button></>}>
      <form id="salary-adjust" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Input label="Salary (₹)" type="number" min={0} value={f.baseAmount} onChange={(e) => setF({ ...f, baseAmount: e.target.value })} />
        <Input label="Bonus (₹)" type="number" min={0} value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} placeholder="0" />
        <Input label="Deduction (₹)" type="number" min={0} value={f.deduction} onChange={(e) => setF({ ...f, deduction: e.target.value })} placeholder="0" hint="Advance, fine… (leave is cut automatically)" />
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. 2 days unpaid leave" className="sm:col-span-3" maxLength={300} />
        {leaveCut > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 sm:col-span-3">
            <span>Leave cut · {row?.leaveDays} day{row?.leaveDays === 1 ? '' : 's'} (from Staff check-in)</span><b>−{inr(leaveCut)}</b>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 sm:col-span-3">
          <span className="text-sm font-semibold text-slate-600">Net salary</span>
          <span className={clsx('text-lg font-extrabold', net < 0 ? 'text-rose-600' : 'text-slate-900')}>{inr(net)}</span>
        </div>
        <p className="text-xs text-slate-500 sm:col-span-3">Only this month changes. To change the salary for every month, edit the teacher's profile.</p>
      </form>
    </Modal>
  );
}

function SettingsModal({ open, current, onClose, onSaved }: { open: boolean; current?: SalarySettings; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<SalarySettings>({ enabled: true, payDay: 1, daysBefore: 1, onDueDate: true, daysAfter: 1 });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && current) setF(current); }, [open, current]);
  const num = (k: keyof SalarySettings, min: number, max: number) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))) });

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/salaries/settings', f);
      toast.success('Salary settings saved');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const pd = f.payDay;
  const preview = [
    f.daysBefore > 0 && (pd - f.daysBefore >= 1 ? `${ordinal(pd - f.daysBefore)}: "due ${f.daysBefore === 1 ? 'tomorrow' : `in ${f.daysBefore} days`}"` : `${f.daysBefore} day${f.daysBefore === 1 ? '' : 's'} before: heads-up`),
    f.onDueDate && `${ordinal(pd)}: "due today"`,
    `${ordinal(pd + f.daysAfter)}${f.daysAfter > 1 ? ` and every ${f.daysAfter} days` : ' and every day'} until paid: "overdue"`,
  ].filter(Boolean).join('  →  ');

  return (
    <Modal open={open} onClose={onClose} title="Pay day & reminders" subtitle="Reminders come to you (the owner) in the app — the bell and Notifications"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-5">
        <Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Track teacher salaries & remind me" description="Creates each month's salary sheet automatically and reminds you until it's paid" />
        <div className={clsx('grid gap-4 sm:grid-cols-3', !f.enabled && 'pointer-events-none opacity-50')}>
          <Input label="Pay day (each month)" type="number" min={1} max={28} value={f.payDay} onChange={num('payDay', 1, 28)}
            hint={`October's salary is due on ${ordinal(pd)} November`} className="sm:col-span-3" />
          <Input label="Remind days before" type="number" min={0} max={15} value={f.daysBefore} onChange={num('daysBefore', 0, 15)} hint="0 = no early reminder" />
          <div className="pt-6"><Toggle checked={f.onDueDate} onChange={(v) => setF({ ...f, onDueDate: v })} label="On pay day" /></div>
          <Input label="Overdue: repeat every (days)" type="number" min={1} max={15} value={f.daysAfter} onChange={num('daysAfter', 1, 15)} />
        </div>
        {f.enabled && <p className="rounded-xl bg-brand-50 px-4 py-3 text-xs font-medium text-brand-800">{preview}</p>}
        <p className="text-xs text-slate-500">On pay day each teacher also gets a short in-app note, and when you record a payment they're told it's been paid.</p>
      </div>
    </Modal>
  );
}
