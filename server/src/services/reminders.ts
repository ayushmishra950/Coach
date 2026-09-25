import { Institute, Invoice, Student, type InstituteDoc } from '../models/index.js';
import { addDays, startOfDay } from '../utils/dates.js';
import { notify } from './notify.js';
import { inr } from './payments.js';
import { hasFeature } from './plan.js';

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

/** Sends before-due / on-due / overdue reminders according to the institute's rules. */
export async function runReminders(institute: InstituteDoc) {
  const rules = institute.settings?.reminders;
  const today = startOfDay();
  const invoices = await Invoice.find({ instituteId: institute._id, status: { $ne: 'paid' } });
  let sent = 0;

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

    const student = await Student.findById(inv.studentId).lean();
    if (!student || student.status !== 'active') continue;
    const outstanding = inv.amount - inv.paidAmount;
    const message =
      kind === 'before'
        ? `Reminder: ${student.name}'s fee installment of ${inr(outstanding)} is due on ${fmt(inv.dueDate)}.`
        : kind === 'today'
          ? `${student.name}'s fee installment of ${inr(outstanding)} is due today.`
          : `${student.name}'s fee installment of ${inr(outstanding)} was due on ${fmt(inv.dueDate)} and is now overdue. Please pay at the earliest.`;

    await notify({
      institute,
      type: 'fee',
      audience: 'parent',
      studentId: student._id,
      title: kind === 'after' ? 'Fee overdue' : 'Fee reminder',
      message,
      contact: { phone: student.parentPhone ?? undefined, email: student.parentEmail ?? undefined },
    });
    inv.lastReminderAt = new Date();
    inv.reminderCount = (inv.reminderCount ?? 0) + 1;
    await inv.save();
    sent++;
  }
  return sent;
}

/** Background job: runs automatic reminders for every eligible institute. */
export function startReminderScheduler() {
  const tick = async () => {
    const institutes = await Institute.find({ status: { $in: ['trial', 'active'] }, 'settings.reminders.enabled': true });
    for (const inst of institutes) {
      if (await hasFeature(inst, 'feeReminders')) {
        const n = await runReminders(inst).catch(() => 0);
        if (n) console.log(`⏰ Sent ${n} fee reminders for ${inst.name}`);
      }
    }
  };
  setTimeout(() => tick().catch(console.error), 15_000);
  setInterval(() => tick().catch(console.error), 6 * 60 * 60 * 1000);
}
