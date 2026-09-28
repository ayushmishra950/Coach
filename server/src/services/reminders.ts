import { randomUUID } from 'node:crypto';
import { Institute, Invoice, Lock, Student, type InstituteDoc } from '../models/index.js';
import { addDays, startOfDay } from '../utils/dates.js';
import { notify } from './notify.js';
import { inr } from './payments.js';
import { hasFeature } from './plan.js';

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

/** Sends before-due / on-due / overdue reminders according to the institute's rules. */
export async function runReminders(institute: InstituteDoc) {
  const rules = institute.settings?.reminders;
  const today = startOfDay();
  // Only invoices that could need a reminder today: due within the "days before" window (or
  // already past due) and not reminded yet today.
  const horizon = addDays(today, (rules?.daysBefore ?? 3) + 1);
  const invoices = await Invoice.find({
    instituteId: institute._id,
    status: { $ne: 'paid' },
    dueDate: { $lt: horizon },
    $or: [{ lastReminderAt: { $exists: false } }, { lastReminderAt: null }, { lastReminderAt: { $lt: today } }],
  })
    .select('studentId title amount paidAmount dueDate lastReminderAt reminderCount')
    .lean();
  const students = await Student.find({ _id: { $in: [...new Set(invoices.map((i) => String(i.studentId)))] }, instituteId: institute._id, status: 'active' })
    .select('name parentPhone parentEmail status')
    .lean();
  const studentBy = new Map(students.map((s) => [String(s._id), s]));
  const done: { id: unknown; count: number }[] = [];
  let sent = 0;
  const flush = async () => {
    if (!done.length) return;
    const at = new Date();
    const batch = done.splice(0);
    await Invoice.bulkWrite(batch.map((d) => ({ updateOne: { filter: { _id: d.id }, update: { $set: { lastReminderAt: at, reminderCount: d.count } } } })));
  };

  for (const inv of invoices) {
    const due = startOfDay(inv.dueDate);
    const daysToDue = Math.round((due.getTime() - today.getTime()) / 86400000);
    const last = inv.lastReminderAt ? startOfDay(inv.lastReminderAt) : null;
    if (last && last.getTime() === today.getTime()) continue; // one reminder per day max

    let kind: 'before' | 'today' | 'after' | null = null;
    if (daysToDue > 0 && daysToDue <= (rules?.daysBefore ?? 3) && !last) kind = 'before';
    else if (daysToDue === 0 && rules?.onDueDate !== false) kind = 'today';
    else if (daysToDue < 0 && -daysToDue >= (rules?.daysAfter ?? 3)) {
      const gap = last ? (today.getTime() - last.getTime()) / 86400000 : Infinity;
      if (gap >= (rules?.daysAfter ?? 3)) kind = 'after';
    }
    if (!kind) continue;

    const student = studentBy.get(String(inv.studentId));
    if (!student) continue;
    const outstanding = inv.amount - inv.paidAmount;
    const message =
      kind === 'before'
        ? `Reminder: ${student.name}'s fee installment of ${inr(outstanding)} is due on ${fmt(inv.dueDate)}.`
        : kind === 'today'
          ? `${student.name}'s fee installment of ${inr(outstanding)} is due today.`
          : `${student.name}'s fee installment of ${inr(outstanding)} was due on ${fmt(inv.dueDate)} and is now overdue. Please pay at the earliest.`;

    try {
      await notify({
      institute,
      type: 'fee',
      audience: 'parent',
      studentId: student._id,
      title: kind === 'after' ? 'Fee overdue' : 'Fee reminder',
      message,
      contact: { phone: student.parentPhone ?? undefined, email: student.parentEmail ?? undefined },
    });
    } catch (e) {
      console.error('[reminder]', (e as Error).message);
      continue;
    }
    done.push({ id: inv._id, count: (inv.reminderCount ?? 0) + 1 });
    sent++;
    // Record progress every 50 reminders, so a crash mid-run never re-sends the ones already out.
    if (done.length >= 50) await flush();
  }
  await flush();
  return sent;
}

/** Manual "send reminders now": shares a per-institute lock with the scheduler. Null = busy. */
export async function runRemindersLocked(institute: InstituteDoc) {
  const key = `fee-reminders:${String(institute._id)}`;
  if (!(await acquireLock(key, 10 * 60_000))) return null;
  try {
    return await runReminders(institute);
  } finally {
    await Lock.deleteOne({ key, owner: INSTANCE }).catch(() => {});
  }
}

const INSTANCE = randomUUID();

/**
 * Takes a named lock for `ttlMs`. Returns false when another server already holds it, so a
 * job never runs twice when the API is scaled to more than one instance.
 */
export async function acquireLock(key: string, ttlMs: number) {
  const now = new Date();
  try {
    await Lock.findOneAndUpdate(
      { key, until: { $lt: now } },
      { $set: { until: new Date(now.getTime() + ttlMs), owner: INSTANCE } },
      { upsert: true },
    );
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false; // lock is held and not expired
    throw e;
  }
}

/** Background job: runs automatic reminders for every eligible institute. */
export function startReminderScheduler() {
  const tick = async () => {
    // Lock lasts almost the whole interval, so only one server runs each 6-hour round.
    if (!(await acquireLock('fee-reminders', 5.5 * 60 * 60 * 1000))) return;
    const institutes = await Institute.find({ status: { $in: ['trial', 'active', 'past_due'] }, 'settings.reminders.enabled': true });
    // A few institutes at a time, each under its own lock (shared with the manual button).
    const queue = [...institutes];
    const worker = async () => {
      for (let inst = queue.shift(); inst; inst = queue.shift()) {
        if (!(await hasFeature(inst, 'feeReminders'))) continue;
        const n = await runRemindersLocked(inst).catch(() => 0);
        if (n) console.log(`⏰ Sent ${n} fee reminders for ${inst.name}`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  };
  setTimeout(() => tick().catch(console.error), 15_000);
  setInterval(() => tick().catch(console.error), 6 * 60 * 60 * 1000);
}
