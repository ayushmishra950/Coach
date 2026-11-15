import { Types } from 'mongoose';
import { Institute, Lock, Salary, StaffAttendance, User, type InstituteDoc } from '../models/index.js';
import { addDays, startOfDay } from '../utils/dates.js';
import { notify } from './notify.js';
import { inr } from './payments.js';
import { runDailyDigest } from './digest.js';
import { acquireLock } from './reminders.js';

/** "2026-10" for a date (app time zone). */
export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  return monthOf(new Date(y, m - 1 + n, 1));
}

export const MONTH_RX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Salary for work month `month` is due on `payDay` of the following month. */
export function salaryDueDate(month: string, payDay: number) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(Math.max(1, payDay), last));
}

export const salarySettings = (inst: InstituteDoc) => {
  const s = inst.settings?.salary;
  return {
    enabled: s?.enabled !== false,
    payDay: s?.payDay ?? 1,
    daysBefore: s?.daysBefore ?? 1,
    onDueDate: s?.onDueDate !== false,
    daysAfter: s?.daysAfter ?? 1,
    trackFrom: s?.trackFrom ?? null,
  };
};

/** Base pay for a month: full salary, or pro-rated by days if the teacher joined during that month. */
function baseFor(salary: number, month: string, joiningDate?: Date | null) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  if (!joiningDate || joiningDate <= first) return Math.round(salary);
  const j = startOfDay(joiningDate);
  if (j.getFullYear() !== y || j.getMonth() !== m - 1) return Math.round(salary);
  const worked = days - j.getDate() + 1;
  return Math.round((salary * worked) / days);
}

/** A day of leave / absence costs one day's pay: monthly salary ÷ days in that month. Half day = half. */
const DAY_WEIGHT: Record<string, number> = { leave: 1, absent: 1, half_day: 0.5 };

/** Leave days per teacher for one month (from staff attendance marked by the owner). */
async function leaveDaysByTeacher(instituteId: Types.ObjectId, month: string, teacherIds?: Types.ObjectId[]) {
  const rows = await StaffAttendance.find({
    instituteId, date: { $gte: `${month}-01`, $lte: `${month}-31` }, status: { $in: Object.keys(DAY_WEIGHT) },
    ...(teacherIds && { teacherId: { $in: teacherIds } }),
  }).select('teacherId status').lean();
  const by = new Map<string, number>();
  for (const r of rows) by.set(String(r.teacherId), (by.get(String(r.teacherId)) ?? 0) + (DAY_WEIGHT[r.status ?? ''] ?? 0));
  return by;
}

export function leaveCut(monthlySalary: number, month: string, days: number, cap: number) {
  const [y, m] = month.split('-').map(Number);
  const perDay = monthlySalary / new Date(y, m, 0).getDate();
  return Math.min(cap, Math.round(perDay * days));
}

const statusFor = (amount: number, paid: number): 'paid' | 'partial' | 'pending' => (paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'pending');

/**
 * Re-applies leave deductions to unpaid salary records of `month` (all teachers, or some).
 * Called when the owner marks leave / absent / half day, and by the daily job.
 */
export async function refreshLeaveDeductions(instituteId: Types.ObjectId, month: string, teacherIds?: Types.ObjectId[]) {
  const recs = await Salary.find({ instituteId, month, status: { $ne: 'paid' }, ...(teacherIds && { teacherId: { $in: teacherIds } }) })
    .populate<{ teacherId: { _id: Types.ObjectId; salary?: number } | null }>('teacherId', 'salary')
    .lean();
  if (!recs.length) return;
  const days = await leaveDaysByTeacher(instituteId, month, recs.map((r) => r.teacherId?._id).filter((x): x is Types.ObjectId => !!x));
  const ops = [];
  for (const r of recs) {
    if (!r.teacherId) continue;
    const d = days.get(String(r.teacherId._id)) ?? 0;
    // Pay per day is based on the full monthly salary on the profile (or the record's base if that is missing).
    const monthly = r.teacherId.salary && r.teacherId.salary > 0 ? r.teacherId.salary : r.baseAmount;
    const before = r.baseAmount + (r.bonus ?? 0) - (r.deduction ?? 0);
    const cut = leaveCut(monthly, month, d, Math.max(0, before));
    if (cut === (r.leaveDeduction ?? 0) && d === (r.leaveDays ?? 0)) continue;
    const amount = Math.max(r.paidAmount, before - cut);
    ops.push({ updateOne: { filter: { _id: r._id, status: { $ne: 'paid' as const } }, update: { $set: { leaveDays: d, leaveDeduction: before - amount, amount, status: statusFor(amount, r.paidAmount) } } } });
  }
  if (ops.length) await Salary.bulkWrite(ops, { ordered: false });
}

/**
 * Makes sure every active teacher with a salary has a record for the months that matter now
 * (last month, whose pay day is this month, and the current month). Records are only made for
 * due dates on or after the day tracking started, so turning this on never floods the owner
 * with "overdue" alerts for salaries already paid outside the app.
 * `force` creates the given month even if it is older than trackFrom (owner clicked "Generate").
 */
export async function ensureSalaryRecords(inst: InstituteDoc, opts: { months?: string[]; force?: boolean } = {}) {
  const cfg = salarySettings(inst);
  let trackFrom = cfg.trackFrom ? startOfDay(cfg.trackFrom) : null;
  if (!trackFrom) {
    trackFrom = startOfDay();
    await Institute.updateOne({ _id: inst._id }, { $set: { 'settings.salary.trackFrom': trackFrom } });
    inst.set('settings.salary.trackFrom', trackFrom);
  }
  const now = monthOf();
  const months = opts.months ?? [shiftMonth(now, -1), now];
  const teachers = await User.find({ instituteId: inst._id, role: 'teacher', active: true, salary: { $gt: 0 } })
    .select('name salary joiningDate')
    .lean();
  let created = 0;
  for (const month of months) {
    const due = salaryDueDate(month, cfg.payDay);
    if (!opts.force && due < trackFrom) continue;
    const [y, m] = month.split('-').map(Number);
    const monthEnd = new Date(y, m, 0, 23, 59, 59);
    const ops = teachers
      .filter((t) => !t.joiningDate || t.joiningDate <= monthEnd)
      .map((t) => {
        const base = baseFor(t.salary ?? 0, month, t.joiningDate);
        return {
          updateOne: {
            filter: { instituteId: inst._id, teacherId: t._id, month },
            update: { $setOnInsert: { baseAmount: base, amount: base, dueDate: due, status: 'pending' as const, paidAmount: 0 } },
            upsert: true,
          },
        };
      });
    // A salary changed on the profile updates this month's record while nothing is paid or adjusted yet.
    const sync = teachers
      .filter((t) => !t.joiningDate || t.joiningDate <= monthEnd)
      .map((t) => {
        const base = baseFor(t.salary ?? 0, month, t.joiningDate);
        return {
          updateOne: {
            filter: { instituteId: inst._id, teacherId: t._id, month, paidAmount: 0, adjusted: { $ne: true }, baseAmount: { $ne: base } },
            update: { $set: { baseAmount: base, amount: base, leaveDays: 0, leaveDeduction: 0 } },
          },
        };
      });
    try {
      if (ops.length) created += (await Salary.bulkWrite(ops, { ordered: false })).upsertedCount;
    } catch (e) {
      // Two requests creating the same month at once: the other one already made the record.
      if ((e as { code?: number }).code !== 11000 && !String((e as Error).message).includes('E11000')) throw e;
    }
    if (sync.length) await Salary.bulkWrite(sync, { ordered: false });
    // Leave / absent days marked so far cut the pay of this month.
    await refreshLeaveDeductions(inst._id, month);
  }
  return created;
}

/** Pay day changed in settings → move the due date of every unpaid record. */
export async function realignDueDates(inst: InstituteDoc) {
  const { payDay } = salarySettings(inst);
  const open = await Salary.find({ instituteId: inst._id, status: { $ne: 'paid' } }).select('month').lean();
  if (!open.length) return;
  await Salary.bulkWrite(open.map((s) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { dueDate: salaryDueDate(s.month, payDay) } } } })));
}

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

/**
 * Owner reminders for teacher salaries: N days before the pay day, on the pay day and every
 * N days after it while anything is unpaid. One grouped notification per kind per day,
 * e.g. "3 salaries due tomorrow — ₹72,000: Neha, Rohit, Aman".
 */
export async function runSalaryReminders(inst: InstituteDoc) {
  const cfg = salarySettings(inst);
  if (!cfg.enabled) return 0;
  const today = startOfDay();
  const horizon = addDays(today, cfg.daysBefore + 1);
  const rows = await Salary.find({
    instituteId: inst._id,
    status: { $ne: 'paid' },
    dueDate: { $lt: horizon },
    $or: [{ lastReminderAt: { $exists: false } }, { lastReminderAt: null }, { lastReminderAt: { $lt: today } }],
  })
    .populate<{ teacherId: { _id: Types.ObjectId; name: string } | null }>('teacherId', 'name')
    .lean();

  type Row = (typeof rows)[number];
  const groups: Record<'before' | 'today' | 'after', Row[]> = { before: [], today: [], after: [] };
  for (const s of rows) {
    if (!s.teacherId) continue;
    const due = startOfDay(s.dueDate);
    const daysToDue = Math.round((due.getTime() - today.getTime()) / 86400000);
    const last = s.lastReminderAt ? startOfDay(s.lastReminderAt) : null;
    if (last && last.getTime() === today.getTime()) continue;
    if (daysToDue > 0 && daysToDue <= cfg.daysBefore && !last) groups.before.push(s);
    else if (daysToDue === 0 && cfg.onDueDate) groups.today.push(s);
    else if (daysToDue < 0) {
      const every = Math.max(1, cfg.daysAfter);
      const lastAfterDue = last && last.getTime() > due.getTime() ? last : null;
      const gap = lastAfterDue ? (today.getTime() - lastAfterDue.getTime()) / 86400000 : Infinity;
      if (-daysToDue >= every && gap >= every) groups.after.push(s);
    }
  }

  let sent = 0;
  const at = new Date();
  for (const kind of ['before', 'today', 'after'] as const) {
    const list = groups[kind];
    if (!list.length) continue;
    const total = list.reduce((a, s) => a + (s.amount - s.paidAmount), 0);
    const names = list.map((s) => `${s.teacherId!.name} (${inr(s.amount - s.paidAmount)})`);
    const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ` +${names.length - 6} more` : '');
    const n = list.length;
    const plural = n === 1 ? 'salary' : 'salaries';
    let title: string;
    let message: string;
    if (kind === 'before') {
      const d = list[0].dueDate;
      const days = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
      title = `Teacher ${plural} due ${days === 1 ? 'tomorrow' : `in ${days} days`}`;
      message = `${n} teacher ${plural} totalling ${inr(total)} ${n === 1 ? 'is' : 'are'} due on ${fmt(d)}: ${shown}.`;
    } else if (kind === 'today') {
      title = `Teacher ${plural} due today`;
      message = `Pay ${n} teacher ${plural} today — ${inr(total)} in total: ${shown}.`;
    } else {
      title = `Teacher ${plural} overdue`;
      message = `${n} teacher ${plural} (${inr(total)}) ${n === 1 ? 'is' : 'are'} past the pay day and still unpaid: ${shown}.`;
    }
    try {
      await notify({ institute: inst, type: 'salary', audience: 'owner', title, message, href: '/app/salaries?status=unpaid' });
    } catch (e) {
      console.error('[salary-reminder]', (e as Error).message);
      continue;
    }
    await Salary.bulkWrite(list.map((s) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { lastReminderAt: at }, $inc: { reminderCount: 1 } } } })));
    sent += list.length;
  }
  await notifyTeachersOfPayDay(inst);
  return sent;
}

/**
 * Each teacher hears about their own salary the day before the pay day and on the pay day
 * (amount after leave cuts). Tracked per record, so a notice is never sent twice.
 */
async function notifyTeachersOfPayDay(inst: InstituteDoc) {
  const today = startOfDay();
  const rows = await Salary.find({ instituteId: inst._id, status: { $ne: 'paid' }, dueDate: { $gte: today, $lt: addDays(today, 2) } })
    .populate<{ teacherId: { _id: Types.ObjectId; name: string; active?: boolean } | null }>('teacherId', 'name active')
    .lean();
  for (const s of rows) {
    if (!s.teacherId || s.teacherId.active === false) continue;
    const days = Math.round((startOfDay(s.dueDate).getTime() - today.getTime()) / 86400000);
    const key = days === 0 ? `today:${s.dueDate.toISOString().slice(0, 10)}` : days === 1 ? `before:${s.dueDate.toISOString().slice(0, 10)}` : null;
    if (!key || (s.teacherNotices ?? []).includes(key)) continue;
    // Claim the notice first so two servers can't both send it.
    const claimed = await Salary.updateOne({ _id: s._id, teacherNotices: { $ne: key } }, { $addToSet: { teacherNotices: key } });
    if (!claimed.modifiedCount) continue;
    const due = s.amount - s.paidAmount;
    const leave = s.leaveDays ? ` Leave: ${s.leaveDays} day${s.leaveDays === 1 ? '' : 's'} (−${inr(s.leaveDeduction ?? 0)}).` : '';
    await notify({
      institute: inst, type: 'salary', audience: 'staff', userId: s.teacherId._id,
      title: days === 0 ? 'Salary due today' : 'Salary due tomorrow',
      message: `Your salary for ${monthLabel(s.month)} — ${inr(due)} — is due ${days === 0 ? 'today' : `tomorrow, ${fmt(s.dueDate)}`}.${leave}`,
      href: '/app/my-attendance?tab=salary',
    }).catch(() => undefined);
  }
}

/** Runs record creation + reminders for one institute under a per-institute lock. */
export async function runSalaryJob(inst: InstituteDoc) {
  const key = `salary:${String(inst._id)}`;
  if (!(await acquireLock(key, 10 * 60_000))) return 0;
  try {
    if (!salarySettings(inst).enabled) return 0;
    await ensureSalaryRecords(inst);
    return await runSalaryReminders(inst);
  } finally {
    await Lock.updateOne({ key }, { $set: { until: new Date(0) } }).catch(() => undefined);
  }
}

/** Background job: every 3 hours, for every live institute. */
export function startSalaryScheduler() {
  const tick = async () => {
    if (!(await acquireLock('salary-reminders', 2.5 * 60 * 60 * 1000))) return;
    // Every live institute: salary reminders (if switched on) + the owner's daily to-do digest.
    const institutes = await Institute.find({ status: { $in: ['trial', 'active', 'past_due'] } });
    for (const inst of institutes) {
      const n = await runSalaryJob(inst).catch((e) => {
        console.error('[salary]', (e as Error).message);
        return 0;
      });
      if (n) console.log(`💼 Sent salary reminders (${n} salaries) for ${inst.name}`);
      await runDailyDigest(inst).catch((e) => console.error('[digest]', (e as Error).message));
    }
    await Lock.updateOne({ key: 'salary-reminders' }, { $set: { until: new Date(Date.now() + 20 * 60 * 1000) } }).catch(() => undefined);
  };
  setTimeout(() => tick().catch(console.error), 20_000);
  setInterval(() => tick().catch(console.error), 3 * 60 * 60 * 1000);
}
