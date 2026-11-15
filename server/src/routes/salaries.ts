import { Router } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Salary, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { inr } from '../services/payments.js';
import {
  MONTH_RX, ensureSalaryRecords, monthLabel, monthOf, realignDueDates, runSalaryJob, salaryDueDate, salarySettings, shiftMonth,
} from '../services/salary.js';
import { parseDate, startOfDay } from '../utils/dates.js';
import { HttpError, ah, oid, str } from '../utils/http.js';
import { optStr } from '../utils/security.js';

const r = Router();
r.use(auth, allow('owner'));

const METHODS = ['cash', 'upi', 'bank', 'cheque'] as const;

const money = (v: unknown, label: string) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, `Enter a valid ${label}`);
  return Math.round(n);
};

const statusOf = (amount: number, paid: number) => (paid <= 0 ? 'pending' : paid >= amount ? 'paid' : 'partial');

/** Salary sheet for one month (default: last month — the one paid this month). */
r.get(
  '/',
  ah(async (req, res) => {
    const inst = req.institute!;
    const instituteId = tid(req);
    await ensureSalaryRecords(inst);
    let month = typeof req.query.month === 'string' && MONTH_RX.test(req.query.month) ? req.query.month : '';
    if (!month) {
      // Default: last month (paid this month); if that sheet doesn't exist yet, the current month.
      const last = shiftMonth(monthOf(), -1);
      month = (await Salary.exists({ instituteId, month: last })) ? last : monthOf();
    }
    const filter: Record<string, unknown> = { instituteId, month };
    const status = str(req.query.status);
    if (status === 'unpaid') filter.status = { $ne: 'paid' };
    else if (status === 'paid') filter.status = 'paid';

    const [items, all, outstanding, months] = await Promise.all([
      Salary.find(filter).sort({ status: 1, dueDate: 1, _id: 1 }).populate('teacherId', 'name email phone subjects active salary').lean(),
      Salary.find({ instituteId, month }).select('amount paidAmount status dueDate').lean(),
      // Everything unpaid across all months (for the "overdue" banner).
      Salary.find({ instituteId, status: { $ne: 'paid' } }).select('month amount paidAmount dueDate').lean(),
      Salary.distinct('month', { instituteId }),
    ]);
    const today = startOfDay();
    const overdue = outstanding.filter((s) => startOfDay(s.dueDate) < today);
    const cfg = salarySettings(inst);
    const missing = await User.countDocuments({ instituteId, role: 'teacher', active: true, $or: [{ salary: { $exists: false } }, { salary: null }, { salary: { $lte: 0 } }] });
    res.json({
      month,
      label: monthLabel(month),
      dueDate: salaryDueDate(month, cfg.payDay),
      items,
      summary: {
        count: all.length,
        total: all.reduce((a, s) => a + s.amount, 0),
        paid: all.reduce((a, s) => a + s.paidAmount, 0),
        pending: all.reduce((a, s) => a + Math.max(0, s.amount - s.paidAmount), 0),
        paidCount: all.filter((s) => s.status === 'paid').length,
      },
      overdue: {
        count: overdue.length,
        amount: overdue.reduce((a, s) => a + Math.max(0, s.amount - s.paidAmount), 0),
        months: [...new Set(overdue.map((s) => s.month))].sort(),
      },
      months: [...new Set([...months, month, shiftMonth(monthOf(), -1), monthOf()])].sort().reverse(),
      teachersWithoutSalary: missing,
      settings: cfg,
    });
  }),
);

/** Small summary for the owner dashboard. */
r.get(
  '/summary',
  ah(async (req, res) => {
    const instituteId = tid(req);
    await ensureSalaryRecords(req.institute!);
    const today = startOfDay();
    const open = await Salary.find({ instituteId, status: { $ne: 'paid' } }).select('amount paidAmount dueDate').sort({ dueDate: 1 }).lean();
    const overdue = open.filter((s) => startOfDay(s.dueDate) < today);
    const next = open.find((s) => startOfDay(s.dueDate) >= today);
    const nextDue = next ? startOfDay(next.dueDate).getTime() : null;
    const nextRows = nextDue ? open.filter((s) => startOfDay(s.dueDate).getTime() === nextDue) : [];
    res.json({
      overdue: { count: overdue.length, amount: overdue.reduce((a, s) => a + s.amount - s.paidAmount, 0) },
      next: next ? { dueDate: next.dueDate, count: nextRows.length, amount: nextRows.reduce((a, s) => a + s.amount - s.paidAmount, 0) } : null,
    });
  }),
);

/** Create the salary sheet for a month by hand (e.g. an older month, or after adding teachers). */
r.post(
  '/generate',
  ah(async (req, res) => {
    const month = String(req.body?.month ?? '');
    if (!MONTH_RX.test(month)) throw new HttpError(400, 'Pick a month');
    if (month > monthOf()) throw new HttpError(400, 'You can’t create salaries for a future month yet');
    const created = await ensureSalaryRecords(req.institute!, { months: [month], force: true });
    audit(req, 'salary.generate', 'Salary', undefined, `${monthLabel(month)} · ${created} new`);
    res.json({ created });
  }),
);

r.put(
  '/settings',
  ah(async (req, res) => {
    const inst = req.institute!;
    const b = req.body ?? {};
    const before = salarySettings(inst).payDay;
    if (typeof b.enabled === 'boolean') inst.set('settings.salary.enabled', b.enabled);
    if (typeof b.onDueDate === 'boolean') inst.set('settings.salary.onDueDate', b.onDueDate);
    const num = (k: 'payDay' | 'daysBefore' | 'daysAfter', min: number, max: number) => {
      if (b[k] === undefined) return;
      const n = Number(b[k]);
      if (!Number.isFinite(n)) throw new HttpError(400, 'Enter a number of days');
      inst.set(`settings.salary.${k}`, Math.max(min, Math.min(max, Math.round(n))));
    };
    num('payDay', 1, 28);
    num('daysBefore', 0, 15);
    num('daysAfter', 1, 15);
    await inst.save();
    if (salarySettings(inst).payDay !== before) await realignDueDates(inst);
    audit(req, 'salary.settings', 'Institute', inst._id, JSON.stringify(salarySettings(inst)));
    res.json(salarySettings(inst));
  }),
);

/** "Send reminders now". */
r.post(
  '/run-reminders',
  ah(async (req, res) => {
    const sent = await runSalaryJob(req.institute!);
    res.json({ sent });
  }),
);

/** Bonus / deduction / note. */
r.put(
  '/:id',
  ah(async (req, res) => {
    const s = await Salary.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!s) throw new HttpError(404, 'Salary record not found');
    const b = req.body ?? {};
    if (b.baseAmount !== undefined) s.baseAmount = money(b.baseAmount, 'salary');
    if (b.bonus !== undefined) s.bonus = money(b.bonus, 'bonus');
    if (b.deduction !== undefined) s.deduction = money(b.deduction, 'deduction');
    if (b.note !== undefined) s.note = optStr(b.note, 300) ?? undefined;
    if (b.dueDate !== undefined) s.dueDate = parseDate(b.dueDate, 'Due date');
    const gross = s.baseAmount + (s.bonus ?? 0) - (s.deduction ?? 0);
    if (gross < 0) throw new HttpError(400, 'Deduction can’t be more than the salary');
    // Leave cut stays as calculated from staff attendance (re-capped to what is left).
    s.leaveDeduction = Math.min(s.leaveDeduction ?? 0, gross);
    const amount = gross - s.leaveDeduction;
    if (amount < s.paidAmount) throw new HttpError(400, `Already paid ${inr(s.paidAmount)} — the total can’t go below that`);
    const old = s.amount;
    s.amount = amount;
    s.adjusted = true;
    s.status = statusOf(s.amount, s.paidAmount);
    if (s.status === 'paid' && !s.paidAt) s.paidAt = new Date();
    if (s.status !== 'paid') s.paidAt = undefined;
    await s.save();
    audit(req, 'salary.adjust', 'Salary', s._id, `${s.month} · ${inr(old)} → ${inr(amount)}`);
    res.json(await s.populate('teacherId', 'name email phone subjects active salary'));
  }),
);

/** Record a (full or part) salary payment. */
r.post(
  '/:id/pay',
  ah(async (req, res) => {
    const s = await Salary.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!s) throw new HttpError(404, 'Salary record not found');
    const due = s.amount - s.paidAmount;
    if (due <= 0) throw new HttpError(400, 'This salary is already fully paid');
    const amount = req.body?.amount === undefined || req.body?.amount === '' ? due : money(req.body.amount, 'amount');
    if (amount <= 0) throw new HttpError(400, 'Enter the amount paid');
    if (amount > due) throw new HttpError(400, `Only ${inr(due)} is left to pay`);
    const method = METHODS.includes(req.body?.method) ? req.body.method : 'bank';
    const paidAt = req.body?.paidAt ? parseDate(req.body.paidAt, 'Payment date') : new Date();
    if (paidAt.getTime() > Date.now() + 60_000) throw new HttpError(400, 'Payment date can’t be in the future');
    s.payments.push({ amount, method, reference: optStr(req.body?.reference, 80), note: optStr(req.body?.note, 200), paidAt, by: req.user.id });
    s.paidAmount += amount;
    s.status = statusOf(s.amount, s.paidAmount);
    if (s.status === 'paid') s.paidAt = paidAt;
    await s.save();
    audit(req, 'salary.pay', 'Salary', s._id, `${s.month} · ${inr(amount)} · ${method}`);
    const label = monthLabel(s.month);
    notify({
      institute: req.institute!, type: 'salary', audience: 'staff', userId: s.teacherId,
      title: s.status === 'paid' ? 'Salary paid' : 'Salary part-payment',
      message: s.status === 'paid'
        ? `Your salary for ${label} (${inr(s.amount)}) has been paid.`
        : `${inr(amount)} of your ${label} salary has been paid. ${inr(s.amount - s.paidAmount)} is still pending.`,
      href: '/app/my-attendance?tab=salary',
    }).catch(() => undefined);
    res.json(await s.populate('teacherId', 'name email phone subjects active salary'));
  }),
);

/** Undo the latest payment (entered by mistake). */
r.delete(
  '/:id/payments/last',
  ah(async (req, res) => {
    const s = await Salary.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!s) throw new HttpError(404, 'Salary record not found');
    const last = s.payments.pop();
    if (!last) throw new HttpError(400, 'No payment to undo');
    s.paidAmount = Math.max(0, s.paidAmount - last.amount);
    s.status = statusOf(s.amount, s.paidAmount);
    s.paidAt = s.status === 'paid' ? s.paidAt : undefined;
    await s.save();
    audit(req, 'salary.payment_undo', 'Salary', s._id, `${s.month} · ${inr(last.amount)}`);
    res.json(await s.populate('teacherId', 'name email phone subjects active salary'));
  }),
);

/** Remove a record with no payments (e.g. a teacher who left before that month). */
r.delete(
  '/:id',
  ah(async (req, res) => {
    const s = await Salary.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!s) throw new HttpError(404, 'Salary record not found');
    if (s.paidAmount > 0) throw new HttpError(400, 'Undo the payments first, then remove the record');
    await s.deleteOne();
    audit(req, 'salary.delete', 'Salary', s._id, s.month);
    res.json({ ok: true });
  }),
);

export default r;
