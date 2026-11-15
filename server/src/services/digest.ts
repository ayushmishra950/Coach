import { Lead, LeaveRequest, type InstituteDoc } from '../models/index.js';
import { addDays, startOfDay, ymd } from '../utils/dates.js';
import { notify } from './notify.js';
import { acquireLock } from './reminders.js';

/**
 * Once a day (after 8 AM) the owner gets one summary: enquiries to follow up today, demo classes
 * today and leave requests still waiting. Nothing is sent when there is nothing to do.
 */
export async function runDailyDigest(inst: InstituteDoc) {
  if (new Date().getHours() < 8) return false;
  // One per institute per day, even with several servers: the lock lasts until tomorrow.
  const tomorrow = addDays(startOfDay(), 1);
  if (!(await acquireLock(`digest:${String(inst._id)}:${ymd()}`, tomorrow.getTime() - Date.now()))) return false;
  const today = startOfDay();
  const open = { $nin: ['converted', 'lost'] };
  const [followUps, demos, fresh, leaves] = await Promise.all([
    Lead.countDocuments({ instituteId: inst._id, status: open, followUpAt: { $lt: tomorrow } }),
    Lead.countDocuments({ instituteId: inst._id, status: 'demo_scheduled', demoAt: { $gte: today, $lt: tomorrow } }),
    Lead.countDocuments({ instituteId: inst._id, status: 'new' }),
    LeaveRequest.countDocuments({ instituteId: inst._id, status: 'pending' }),
  ]);
  const parts = [
    followUps && `${followUps} enquir${followUps === 1 ? 'y' : 'ies'} to follow up`,
    demos && `${demos} demo class${demos === 1 ? '' : 'es'} today`,
    fresh && `${fresh} new enquir${fresh === 1 ? 'y' : 'ies'} not contacted yet`,
    leaves && `${leaves} leave request${leaves === 1 ? '' : 's'} waiting`,
  ].filter(Boolean);
  if (!parts.length) return false;
  await notify({
    institute: inst, type: 'lead', audience: 'owner',
    title: "Today's to-do", message: `${parts.join(' · ')}.`, href: followUps || demos || fresh ? '/app/leads?status=followup' : '/app/leaves',
  });
  return true;
}
