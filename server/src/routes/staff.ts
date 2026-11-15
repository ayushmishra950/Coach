import { Router, type Request } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Salary, StaffAttendance, User, type InstituteDoc } from '../models/index.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { emitToInstituteRole } from '../services/realtime.js';
import { MONTH_RX, ensureSalaryRecords, monthLabel, monthOf, refreshLeaveDeductions } from '../services/salary.js';
import { localDayStart, ymd } from '../utils/dates.js';
import { HttpError, ah, oid } from '../utils/http.js';
import { optStr } from '../utils/security.js';

/**
 * Teacher check-in / check-out.
 *   Teacher: GET /me/today · POST /check-in · POST /check-out · GET /me?month= · GET /me/salaries
 *   Owner:   GET /day?date= · GET /month?month= · PUT /entry · DELETE /entry/:id · GET|PUT /settings
 * Times always come from the server clock, so a teacher can't check in "at 9:00" from home at 10.
 */
const r = Router();
r.use(auth);

const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export function staffSettings(inst: InstituteDoc) {
  const s = inst.settings?.staffAttendance;
  return {
    startTime: s?.startTime && TIME_RX.test(s.startTime) ? s.startTime : '09:00',
    endTime: s?.endTime && TIME_RX.test(s.endTime) ? s.endTime : '18:00',
    graceMins: s?.graceMins ?? 15,
    notifyLate: s?.notifyLate !== false,
    captureLocation: !!s?.captureLocation,
  };
}

/** Date for HH:mm on a YYYY-MM-DD day (app time zone). */
function at(date: string, hhmm: string) {
  const d = localDayStart(date);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmtClock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase();

function lateness(inst: InstituteDoc, date: string, checkIn: Date) {
  const cfg = staffSettings(inst);
  const start = at(date, cfg.startTime);
  const mins = Math.floor((checkIn.getTime() - start.getTime()) / 60000);
  return mins > cfg.graceMins ? { late: true, lateBy: mins } : { late: false, lateBy: 0 };
}

function earlyLeave(inst: InstituteDoc, date: string, checkOut: Date) {
  return checkOut.getTime() < at(date, staffSettings(inst).endTime).getTime();
}

function geoOf(v: unknown) {
  if (!v || typeof v !== 'object') return undefined;
  const g = v as Record<string, unknown>;
  const lat = Number(g.lat);
  const lng = Number(g.lng);
  const accuracy = Number(g.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, ...(Number.isFinite(accuracy) && { accuracy: Math.round(accuracy) }) };
}

const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

/** Live update for owners watching the staff screen. */
function pushLive(req: Request, row: unknown) {
  emitToInstituteRole(tid(req), 'owner', 'staff:attendance', row);
}

/* ─────────────────────────── Teacher ─────────────────────────── */

r.get(
  '/me/today',
  allow('teacher'),
  ah(async (req, res) => {
    const date = ymd();
    const [row, open] = await Promise.all([
      StaffAttendance.findOne({ instituteId: tid(req), teacherId: req.user.id, date }).lean(),
      // A check-in from an earlier day that was never closed.
      StaffAttendance.findOne({ instituteId: tid(req), teacherId: req.user.id, date: { $lt: date }, checkIn: { $ne: null }, checkOut: null })
        .sort({ date: -1 }).select('date checkIn').lean(),
    ]);
    res.json({ date, row, missedCheckout: open ?? null, settings: staffSettings(req.institute!), serverTime: new Date() });
  }),
);

r.post(
  '/check-in',
  allow('teacher'),
  ah(async (req, res) => {
    const inst = req.institute!;
    const instituteId = tid(req);
    const date = ymd();
    const now = new Date();
    const existing = await StaffAttendance.findOne({ instituteId, teacherId: req.user.id, date });
    if (existing?.checkIn) throw new HttpError(409, `You already checked in today at ${fmtClock(existing.checkIn)}`);
    const { late, lateBy } = lateness(inst, date, now);
    const set = {
      checkIn: now, status: 'present', late, lateBy,
      checkInNote: optStr(req.body?.note, 200), checkInGeo: geoOf(req.body?.geo), checkInIp: req.ip,
    };
    let row;
    try {
      row = await StaffAttendance.findOneAndUpdate(
        { instituteId, teacherId: req.user.id, date, checkIn: null },
        { $set: set, $setOnInsert: { instituteId, teacherId: req.user.id, date } },
        { upsert: true, new: true },
      );
    } catch (e) {
      // Two taps at once: the second one hits the unique index.
      if ((e as { code?: number }).code === 11000) throw new HttpError(409, 'You are already checked in');
      throw e;
    }
    const populated = await row!.populate('teacherId', 'name');
    pushLive(req, populated);
    if (late && staffSettings(inst).notifyLate) {
      notify({
        institute: inst, type: 'staff', audience: 'owner',
        title: 'Late check-in',
        message: `${req.user.name} checked in at ${fmtClock(now)} — ${lateBy} min after ${staffSettings(inst).startTime}.`,
        href: `/app/staff?date=${date}`,
      }).catch(() => undefined);
    }
    res.status(201).json(row);
  }),
);

r.post(
  '/check-out',
  allow('teacher'),
  ah(async (req, res) => {
    const inst = req.institute!;
    const instituteId = tid(req);
    const date = ymd();
    const row = await StaffAttendance.findOne({ instituteId, teacherId: req.user.id, date });
    if (!row?.checkIn) throw new HttpError(400, 'You haven’t checked in today');
    if (row.checkOut) throw new HttpError(409, `You already checked out at ${fmtClock(row.checkOut)}`);
    const now = new Date();
    row.checkOut = now;
    row.minutes = minutesBetween(row.checkIn, now);
    row.earlyLeave = earlyLeave(inst, date, now);
    row.checkOutNote = optStr(req.body?.note, 200);
    row.set('checkOutGeo', geoOf(req.body?.geo));
    row.checkOutIp = req.ip;
    await row.save();
    pushLive(req, await row.populate('teacherId', 'name'));
    res.json(row);
  }),
);

/** The teacher's own month: daily rows + totals. */
r.get(
  '/me',
  allow('teacher'),
  ah(async (req, res) => {
    const month = typeof req.query.month === 'string' && MONTH_RX.test(req.query.month) ? req.query.month : monthOf();
    const rows = await StaffAttendance.find({ instituteId: tid(req), teacherId: req.user.id, date: { $gte: `${month}-01`, $lte: `${month}-31` } })
      .sort({ date: -1 })
      .lean();
    res.json({ month, label: monthLabel(month), rows, totals: totalsOf(rows), settings: staffSettings(req.institute!) });
  }),
);

/** The teacher's own salary records (amounts and payments, nothing about other teachers). */
r.get(
  '/me/salaries',
  allow('teacher'),
  ah(async (req, res) => {
    await ensureSalaryRecords(req.institute!).catch(() => undefined);
    const rows = await Salary.find({ instituteId: tid(req), teacherId: req.user.id })
      .select('month baseAmount bonus deduction leaveDays leaveDeduction amount paidAmount dueDate status payments.amount payments.method payments.paidAt paidAt note')
      .sort({ month: -1 })
      .limit(24)
      .lean();
    res.json(rows.map((s) => ({ ...s, label: monthLabel(s.month) })));
  }),
);

/* ─────────────────────────── Owner ─────────────────────────── */

type Row = { date: string; status?: string | null; checkIn?: Date | null; checkOut?: Date | null; minutes?: number | null; late?: boolean | null; earlyLeave?: boolean | null };

function totalsOf(rows: Row[]) {
  const today = ymd();
  const present = rows.filter((x) => x.status === 'present' || x.status === 'half_day');
  const minutes = present.reduce((a, x) => a + (x.minutes ?? 0), 0);
  const closed = present.filter((x) => x.checkOut).length;
  return {
    present: present.length,
    halfDays: rows.filter((x) => x.status === 'half_day').length,
    leave: rows.filter((x) => x.status === 'leave').length,
    absent: rows.filter((x) => x.status === 'absent').length,
    late: rows.filter((x) => x.late).length,
    earlyLeave: rows.filter((x) => x.earlyLeave).length,
    missedCheckout: rows.filter((x) => x.checkIn && !x.checkOut && x.date < today).length,
    minutes,
    avgMinutes: closed ? Math.round(minutes / closed) : 0,
  };
}

/** One day: every active teacher with their check-in state. */
r.get(
  '/day',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const date = typeof req.query.date === 'string' && DATE_RX.test(req.query.date) ? req.query.date : ymd();
    const [teachers, rows] = await Promise.all([
      User.find({ instituteId, role: 'teacher', active: true }).select('name phone subjects').sort({ name: 1 }).lean(),
      StaffAttendance.find({ instituteId, date }).lean(),
    ]);
    const byTeacher = new Map(rows.map((x) => [String(x.teacherId), x]));
    // Rows of teachers who were deactivated since still show up for that day.
    const extraIds = rows.filter((x) => !teachers.some((t) => String(t._id) === String(x.teacherId))).map((x) => x.teacherId);
    const extra = extraIds.length ? await User.find({ _id: { $in: extraIds } }).select('name phone subjects').lean() : [];
    const list = [...teachers, ...extra].map((t) => ({ teacher: t, row: byTeacher.get(String(t._id)) ?? null }));
    const isToday = date === ymd();
    const now = Date.now();
    res.json({
      date,
      isToday,
      settings: staffSettings(req.institute!),
      items: list.map((x) => ({
        ...x,
        // Still in the building: minutes so far (for today's open check-ins).
        liveMinutes: isToday && x.row?.checkIn && !x.row.checkOut ? minutesBetween(x.row.checkIn, new Date(now)) : null,
      })),
      summary: {
        total: teachers.length,
        checkedIn: rows.filter((x) => x.checkIn).length,
        working: rows.filter((x) => x.checkIn && !x.checkOut).length,
        checkedOut: rows.filter((x) => x.checkOut).length,
        late: rows.filter((x) => x.late).length,
        leave: rows.filter((x) => x.status === 'leave').length,
        notIn: teachers.filter((t) => !byTeacher.get(String(t._id))).length,
      },
    });
  }),
);

/** Month report: per-teacher totals + a day-by-day grid. */
r.get(
  '/month',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const month = typeof req.query.month === 'string' && MONTH_RX.test(req.query.month) ? req.query.month : monthOf();
    const [teachers, rows] = await Promise.all([
      User.find({ instituteId, role: 'teacher', active: true }).select('name salary').sort({ name: 1 }).lean(),
      StaffAttendance.find({ instituteId, date: { $gte: `${month}-01`, $lte: `${month}-31` } })
        .select('teacherId date status checkIn checkOut minutes late lateBy earlyLeave')
        .lean(),
    ]);
    const extraIds = [...new Set(rows.map((x) => String(x.teacherId)))].filter((id) => !teachers.some((t) => String(t._id) === id));
    const extra = extraIds.length ? await User.find({ _id: { $in: extraIds } }).select('name salary').lean() : [];
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    res.json({
      month,
      label: monthLabel(month),
      days,
      holidays: (req.institute!.settings?.holidays ?? []).filter((h) => h.date.startsWith(month)),
      teachers: [...teachers, ...extra].map((t) => {
        const mine = rows.filter((x) => String(x.teacherId) === String(t._id));
        return {
          teacher: { _id: t._id, name: t.name },
          totals: totalsOf(mine),
          days: Object.fromEntries(mine.map((x) => [x.date, {
            status: x.status, late: x.late, earlyLeave: x.earlyLeave, minutes: x.minutes,
            in: x.checkIn ? hhmm(x.checkIn) : null, out: x.checkOut ? hhmm(x.checkOut) : null,
          }])),
        };
      }),
    });
  }),
);

/** Owner adds or corrects a day: times (HH:mm), or marks leave / absent / half day. */
r.put(
  '/entry',
  allow('owner'),
  ah(async (req, res) => {
    const inst = req.institute!;
    const instituteId = tid(req);
    const b = req.body ?? {};
    const teacherId = oid(String(b.teacherId ?? ''));
    const teacher = await User.findOne({ _id: teacherId, instituteId, role: 'teacher' }).select('name');
    if (!teacher) throw new HttpError(404, 'Teacher not found');
    const date = String(b.date ?? '');
    if (!DATE_RX.test(date)) throw new HttpError(400, 'Pick a date');
    if (date > ymd()) throw new HttpError(400, 'You can’t mark a future date');
    const status = ['present', 'leave', 'absent', 'half_day'].includes(b.status) ? b.status : 'present';

    const set: Record<string, unknown> = { status, editedBy: req.user.id, editedAt: new Date(), ownerNote: optStr(b.ownerNote, 200) };
    const unset: Record<string, 1> = {};
    if (status === 'present' || status === 'half_day') {
      if (!b.checkIn || !TIME_RX.test(b.checkIn)) throw new HttpError(400, 'Enter the check-in time');
      const checkIn = at(date, b.checkIn);
      set.checkIn = checkIn;
      Object.assign(set, lateness(inst, date, checkIn));
      if (b.checkOut) {
        if (!TIME_RX.test(b.checkOut)) throw new HttpError(400, 'Enter a valid check-out time');
        const checkOut = at(date, b.checkOut);
        if (checkOut <= checkIn) throw new HttpError(400, 'Check-out must be after check-in');
        if (checkOut.getTime() > Date.now() + 60_000) throw new HttpError(400, 'Check-out can’t be in the future');
        set.checkOut = checkOut;
        set.minutes = minutesBetween(checkIn, checkOut);
        set.earlyLeave = earlyLeave(inst, date, checkOut);
      } else {
        unset.checkOut = 1;
        set.minutes = 0;
        set.earlyLeave = false;
      }
    } else {
      Object.assign(unset, { checkIn: 1, checkOut: 1 });
      Object.assign(set, { minutes: 0, late: false, lateBy: 0, earlyLeave: false });
    }
    const row = await StaffAttendance.findOneAndUpdate(
      { instituteId, teacherId, date },
      { $set: set, ...(Object.keys(unset).length && { $unset: unset }), $setOnInsert: { instituteId, teacherId, date } },
      { upsert: true, new: true },
    ).populate('teacherId', 'name');
    audit(req, 'staff_attendance.edit', 'StaffAttendance', row!._id, `${teacher.name} · ${date} · ${status}${b.checkIn ? ` ${b.checkIn}` : ''}${b.checkOut ? `–${b.checkOut}` : ''}`);
    pushLive(req, row);
    // Leave / absent / half day changes this month's salary (per-day cut).
    await refreshLeaveDeductions(instituteId, date.slice(0, 7), [teacherId]).catch((e) => console.error('[salary-leave]', (e as Error).message));
    res.json(row);
  }),
);

r.delete(
  '/entry/:id',
  allow('owner'),
  ah(async (req, res) => {
    const row = await StaffAttendance.findOneAndDelete({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!row) throw new HttpError(404, 'Entry not found');
    audit(req, 'staff_attendance.delete', 'StaffAttendance', row._id, row.date);
    pushLive(req, { _id: row._id, teacherId: row.teacherId, date: row.date, deleted: true });
    await refreshLeaveDeductions(tid(req), row.date.slice(0, 7), [row.teacherId]).catch((e) => console.error('[salary-leave]', (e as Error).message));
    res.json({ ok: true });
  }),
);

r.get('/settings', allow('owner'), ah(async (req, res) => res.json(staffSettings(req.institute!))));

r.put(
  '/settings',
  allow('owner'),
  ah(async (req, res) => {
    const inst = req.institute!;
    const b = req.body ?? {};
    for (const k of ['startTime', 'endTime'] as const) {
      if (b[k] === undefined) continue;
      if (typeof b[k] !== 'string' || !TIME_RX.test(b[k])) throw new HttpError(400, 'Use a time like 09:00');
      inst.set(`settings.staffAttendance.${k}`, b[k]);
    }
    if (b.graceMins !== undefined) {
      const n = Number(b.graceMins);
      if (!Number.isFinite(n)) throw new HttpError(400, 'Grace time must be a number of minutes');
      inst.set('settings.staffAttendance.graceMins', Math.max(0, Math.min(180, Math.round(n))));
    }
    for (const k of ['notifyLate', 'captureLocation'] as const) if (typeof b[k] === 'boolean') inst.set(`settings.staffAttendance.${k}`, b[k]);
    const cfg = staffSettings(inst);
    if (cfg.endTime <= cfg.startTime) throw new HttpError(400, 'End time must be after the start time');
    await inst.save();
    audit(req, 'staff_attendance.settings', 'Institute', inst._id, `${cfg.startTime}–${cfg.endTime} · grace ${cfg.graceMins}m`);
    res.json(cfg);
  }),
);

export default r;
