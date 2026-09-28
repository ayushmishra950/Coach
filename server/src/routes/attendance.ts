import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Student } from '../models/index.js';
import { audit } from '../services/audit.js';
import { notify, notifyMany } from '../services/notify.js';
import { absenceStreaks, pct } from '../services/stats.js';
import { bumpData, instituteMemo } from '../utils/cache.js';
import { addDays, DAYS, ymd } from '../utils/dates.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { pageArray, pageParams, paged } from '../utils/paginate.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseYmd(s).getTime());
/** 'YYYY-MM-DD' → local midnight (never UTC, so the day never shifts). */
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
const holidayMap = (req: Parameters<typeof tid>[0]) =>
  new Map(((req.institute?.settings?.holidays ?? []) as { date: string; name?: string | null }[]).map((h) => [h.date, h.name || 'Holiday']));
// Absence streaks change only when attendance is saved (which bumps the data version).
const streakMemo = instituteMemo<Awaited<ReturnType<typeof absenceStreaks>>>(10 * 60_000);

r.get(
  '/sheet',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const date = isDate(req.query.date) ? req.query.date : ymd();
    const batch = await assertBatchAccess(req, oid(req.query.batchId));
    const students = await Student.find({ instituteId, batchIds: batch._id, status: 'active' }).select('name studentCode').sort({ name: 1 }).lean();
    const existing = await Attendance.findOne({ instituteId, batchId: batch._id, date }).lean();
    const editDays = req.institute?.settings?.attendanceEditDays ?? 7;
    const locked = req.user.role === 'teacher' && daysBetween(date, ymd()) > editDays;
    res.json({ batch, date, students, records: existing?.records ?? null, submittedAt: existing?.updatedAt ?? null, holiday: holidayMap(req).get(date) ?? null, locked, editDays });
  }),
);

r.post(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['batchId', 'date', 'records']);
    const { date, records } = req.body as { date: string; records: { studentId: string; status: string }[] };
    if (!isDate(date)) throw new HttpError(400, 'Invalid date');
    if (date > ymd()) throw new HttpError(400, 'Attendance cannot be marked for a future date');
    const batch = await assertBatchAccess(req, oid(req.body.batchId));
    if (!Array.isArray(records)) throw new HttpError(400, 'records must be a list');
    const editDays = req.institute?.settings?.attendanceEditDays ?? 7;
    if (req.user.role === 'teacher' && daysBetween(date, ymd()) > editDays) {
      throw new HttpError(403, `Attendance older than ${editDays} days can only be changed by the institute owner.`);
    }
    // Only students who belong to this batch can be marked in it.
    const valid = await Student.find({ instituteId, batchIds: batch._id, _id: { $in: records.map((x) => oid(x.studentId)) } })
      .select('name parentPhone parentEmail')
      .lean();
    const validIds = new Set(valid.map((s) => String(s._id)));
    const seen = new Set<string>();
    const clean = records
      .filter((x) => ['present', 'absent', 'late'].includes(x.status) && validIds.has(String(x.studentId)) && !seen.has(String(x.studentId)) && seen.add(String(x.studentId)))
      .map((x) => ({ studentId: new Types.ObjectId(x.studentId), status: x.status }));

    const previous = await Attendance.findOne({ instituteId, batchId: batch._id, date }).lean();
    const doc = await Attendance.findOneAndUpdate(
      { instituteId, batchId: batch._id, date },
      { records: clean, markedBy: req.user.id },
      { upsert: true, new: true },
    );
    bumpData(instituteId);
    // Changing attendance that was already saved (not the first marking) is kept on record.
    if (previous) {
      const before = new Map(previous.records.map((x) => [String(x.studentId), x.status]));
      const changed = clean.filter((x) => before.get(String(x.studentId)) !== x.status).length;
      if (changed) audit(req, 'attendance.edit', 'Attendance', doc._id, `${batch.name} · ${date}: ${changed} student(s) changed`);
    }

    // Notify parents only for students newly marked absent (avoids duplicate messages on edits)
    const inst = req.institute!;
    let notified = 0;
    const wasAbsent = new Set(previous?.records.filter((x) => x.status === 'absent').map((x) => String(x.studentId)));
    const newlyAbsent = clean.filter((x) => x.status === 'absent' && !wasAbsent.has(String(x.studentId)));
    if (inst.settings?.notifyParentOnAbsence !== false && date === ymd()) {
      notified = newlyAbsent.length;
      // Sent in the background so saving attendance is instant.
      void notifyMany(
        newlyAbsent.map((rec) => {
          const s = valid.find((v) => String(v._id) === String(rec.studentId))!;
          return {
            institute: inst,
            type: 'attendance' as const,
            audience: 'parent' as const,
            studentId: s._id,
            title: 'Absent today',
            message: `${s.name} was absent today from ${batch.name}.`,
            contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
          };
        }),
      ).catch((e) => console.error('[absence notify]', (e as Error).message));
    }

    // Smart alert for the owner when a student crosses the consecutive-absence threshold
    const threshold = inst.settings?.absentAlertAfter ?? 3;
    const streaks = await absenceStreaks(instituteId, threshold, [batch._id]);
    // Only alert when this save is what pushed the student over the threshold (edits don't re-alert).
    const justAbsent = new Set(newlyAbsent.map((x) => String(x.studentId)));
    for (const st of streaks.filter((x) => x.count === threshold && justAbsent.has(x.studentId))) {
      const s = valid.find((v) => String(v._id) === st.studentId);
      if (s) {
        const alert = { institute: inst, type: 'attendance' as const, studentId: s._id, title: 'Attendance alert', message: `${s.name} has been absent for ${threshold} consecutive classes.` };
        await notify({ ...alert, audience: 'owner' });
        // …and the batch's teachers, so they can follow up with the student.
        for (const t of [batch.teacherId, ...(batch.coTeacherIds ?? [])].filter(Boolean)) await notify({ ...alert, audience: 'staff', userId: t! });
      }
    }

    const present = clean.filter((x) => x.status !== 'absent').length;
    res.json({ ok: true, attendance: doc, present, total: clean.length, pct: pct(present, clean.length), notified });
  }),
);

/**
 * Batches for the chosen day with marking status — 20 per page, today's scheduled classes
 * first. `summary` counts across all batches so the header stays correct on every page.
 */
r.get(
  '/overview',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const date = isDate(req.query.date) ? req.query.date : ymd();
    const scoped = await scopedBatchIds(req);
    const dayName = DAYS[parseYmd(date).getDay()];
    const all = await Batch.find({ instituteId, active: true, ...(scoped ? { _id: { $in: scoped } } : {}) })
      .select('name days startTime')
      .sort({ startTime: 1, name: 1, _id: 1 })
      .lean();
    const ordered = [...all].sort((a, b) => Number(b.days.includes(dayName as never)) - Number(a.days.includes(dayName as never)));
    const pp = pageParams(req.query);
    const pg = pageArray(ordered, pp);
    const pageIds = pg.items.map((b) => b._id);

    const [batches, docs, counts, markedCount] = await Promise.all([
      Batch.find({ _id: { $in: pageIds } }).populate('teacherId', 'name').lean(),
      Attendance.find({ instituteId, date, batchId: { $in: pageIds } }).lean(),
      Student.aggregate([
        { $match: { instituteId, status: 'active', batchIds: { $in: pageIds } } },
        { $unwind: '$batchIds' },
        { $group: { _id: '$batchIds', n: { $sum: 1 } } },
      ]),
      Attendance.countDocuments({ instituteId, date, batchId: { $in: all.map((b) => b._id) } }),
    ]);
    const byId = new Map(batches.map((b) => [String(b._id), b]));
    const holiday = holidayMap(req).get(date) ?? null;
    res.json({
      holiday,
      ...paged(
        pg.items.map((row) => {
          const b = byId.get(String(row._id))!;
          const d = docs.find((x) => String(x.batchId) === String(b._id));
          const present = d?.records.filter((x) => x.status !== 'absent').length ?? 0;
          return {
            _id: b._id,
            name: b.name,
            subject: b.subject,
            color: b.color,
            startTime: b.startTime,
            endTime: b.endTime,
            teacher: (b.teacherId as unknown as { name?: string })?.name,
            scheduledToday: b.days.includes(dayName as never),
            students: counts.find((c) => String(c._id) === String(b._id))?.n ?? 0,
            marked: !!d,
            present,
            total: d?.records.length ?? 0,
            pct: d ? pct(present, d.records.length) : null,
          };
        }),
        pg.total,
        pp,
      ),
      summary: { total: all.length, scheduled: all.filter((b) => b.days.includes(dayName as never)).length, marked: markedCount },
    });
  }),
);

r.get(
  '/alerts',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const threshold = Number(req.query.threshold) || req.institute?.settings?.absentAlertAfter || 3;
    const streaks = await streakMemo(instituteId, `${ymd()}|${threshold}|${scoped ? scoped.map(String).sort().join(',') : 'all'}`, () =>
      absenceStreaks(instituteId, threshold, scoped),
    );
    // Only active students count; then page 20 at a time.
    const active = new Set(
      (await Student.find({ instituteId, _id: { $in: streaks.map((s) => new Types.ObjectId(s.studentId)) }, status: 'active' }).select('_id').lean()).map((x) => String(x._id)),
    );
    const pg = pageArray(streaks.filter((s) => active.has(s.studentId)), pageParams(req.query));
    const students = await Student.find({ instituteId, _id: { $in: pg.items.map((s) => new Types.ObjectId(s.studentId)) } })
      .select('name studentCode parentName parentPhone batchIds')
      .populate('batchIds', 'name')
      .lean();
    res.json({ ...pg, items: pg.items.map((s) => ({ ...s, student: students.find((x) => String(x._id) === s.studentId)! })) });
  }),
);

/**
 * Attendance register for a batch over a date range (default: last 30 days, max 93 days).
 * Returns EVERY calendar day in the range — not only the days attendance was saved — so a
 * teacher can see class days, days attendance was never marked, and days with no class.
 */
r.get(
  '/register',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const batch = await assertBatchAccess(req, oid(req.query.batchId));
    let to = isDate(req.query.to) ? req.query.to : ymd();
    let from = isDate(req.query.from) ? req.query.from : ymd(addDays(parseYmd(to), -29));
    if (from > to) [from, to] = [to, from];
    const MAX_DAYS = 93;
    if (daysBetween(from, to) >= MAX_DAYS) from = ymd(addDays(parseYmd(to), -(MAX_DAYS - 1)));

    const [docs, students, first] = await Promise.all([
      Attendance.find({ instituteId, batchId: batch._id, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
      // Current members plus anyone marked in this range who has since left the batch.
      Attendance.distinct('records.studentId', { instituteId, batchId: batch._id, date: { $gte: from, $lte: to } }).then((ids) =>
        Student.find({ instituteId, $or: [{ batchIds: batch._id }, { _id: { $in: ids } }] }).select('name studentCode status batchIds').sort({ name: 1, _id: 1 }).lean(),
      ),
      Attendance.findOne({ instituteId, batchId: batch._id }).sort({ date: 1 }).select('date').lean(),
    ]);

    const today = ymd();
    const byDate = new Map(docs.map((d) => [d.date, d]));
    // date → (studentId → status), so building the grid is a lookup, not a search.
    const statusBy = new Map(docs.map((d) => [d.date, new Map(d.records.map((x) => [String(x.studentId), x.status]))]));
    const holidays = holidayMap(req);
    const days: { date: string; weekday: string; scheduled: boolean; marked: boolean; future: boolean; holiday: string | null }[] = [];
    for (let d = parseYmd(from); ymd(d) <= to; d = addDays(d, 1)) {
      const date = ymd(d);
      const weekday = DAYS[d.getDay()];
      const holiday = holidays.get(date) ?? null;
      days.push({ date, weekday, scheduled: !holiday && batch.days.includes(weekday as never), marked: byDate.has(date), future: date > today, holiday });
    }

    res.json({
      batch: { _id: batch._id, name: batch.name, days: batch.days },
      from,
      to,
      firstRecord: first?.date ?? null,
      days,
      // kept for older clients / CSV: only the days that have saved attendance
      dates: docs.map((d) => d.date),
      summary: {
        classDays: days.filter((d) => d.scheduled && !d.future).length,
        marked: days.filter((d) => d.marked).length,
        notMarked: days.filter((d) => d.scheduled && !d.marked && !d.future && d.date >= (first?.date ?? '9999')).length,
      },
      // Student rows are paged 20 at a time (?page=); `all=1` returns every row for the CSV export.
      ...(() => {
        const rows = students
          .map((s) => {
            const row = days.map((day) => statusBy.get(day.date)?.get(String(s._id)) ?? null);
            const marked = row.filter(Boolean);
            return { _id: s._id, name: s.name, studentCode: s.studentCode, status: s.status, row, marked: marked.length, pct: pct(marked.filter((x) => x !== 'absent').length, marked.length) };
          })
          // hide students who left the batch before this range and have nothing in it
          .filter((s) => s.status === 'active' || s.marked > 0);
        if (req.query.all === '1') return { students: rows, studentPage: { page: 1, pages: 1, total: rows.length, limit: rows.length } };
        const pg = pageArray(rows, pageParams(req.query));
        return { students: pg.items, studentPage: { page: pg.page, pages: pg.pages, total: pg.total, limit: pg.limit } };
      })(),
    });
  }),
);

export default r;
