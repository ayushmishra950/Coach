import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Student } from '../models/index.js';
import { notify } from '../services/notify.js';
import { absenceStreaks, pct } from '../services/stats.js';
import { addDays, ymd } from '../utils/dates.js';
import { HttpError, ah, oid, required } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

r.get(
  '/sheet',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const date = isDate(req.query.date) ? req.query.date : ymd();
    const batch = await assertBatchAccess(req, oid(req.query.batchId));
    const students = await Student.find({ instituteId, batchIds: batch._id, status: 'active' }).select('name studentCode').sort({ name: 1 }).lean();
    const existing = await Attendance.findOne({ instituteId, batchId: batch._id, date }).lean();
    res.json({ batch, date, students, records: existing?.records ?? null, submittedAt: existing?.updatedAt ?? null });
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
    const valid = await Student.find({ instituteId, _id: { $in: records.map((x) => oid(x.studentId)) } }).lean();
    const clean = records
      .filter((x) => ['present', 'absent', 'late'].includes(x.status) && valid.some((s) => String(s._id) === x.studentId))
      .map((x) => ({ studentId: new Types.ObjectId(x.studentId), status: x.status }));

    const previous = await Attendance.findOne({ instituteId, batchId: batch._id, date }).lean();
    const doc = await Attendance.findOneAndUpdate(
      { instituteId, batchId: batch._id, date },
      { records: clean, markedBy: req.user.id },
      { upsert: true, new: true },
    );

    // Notify parents only for students newly marked absent (avoids duplicate messages on edits)
    const inst = req.institute!;
    let notified = 0;
    if (inst.settings?.notifyParentOnAbsence !== false && date === ymd()) {
      const wasAbsent = new Set(previous?.records.filter((x) => x.status === 'absent').map((x) => String(x.studentId)));
      for (const rec of clean.filter((x) => x.status === 'absent' && !wasAbsent.has(String(x.studentId)))) {
        const s = valid.find((v) => String(v._id) === String(rec.studentId))!;
        await notify({
          institute: inst,
          type: 'attendance',
          audience: 'parent',
          studentId: s._id,
          title: 'Absent today',
          message: `${s.name} was absent today from ${batch.name}.`,
          contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
        });
        notified++;
      }
    }

    // Smart alert for the owner when a student crosses the consecutive-absence threshold
    const threshold = inst.settings?.absentAlertAfter ?? 3;
    const streaks = await absenceStreaks(instituteId, threshold, [batch._id]);
    for (const st of streaks.filter((x) => x.count === threshold)) {
      const s = valid.find((v) => String(v._id) === st.studentId);
      if (s) {
        await notify({
          institute: inst,
          type: 'attendance',
          audience: 'owner',
          studentId: s._id,
          title: 'Attendance alert',
          message: `${s.name} has been absent for ${threshold} consecutive classes.`,
        });
      }
    }

    const present = clean.filter((x) => x.status !== 'absent').length;
    res.json({ ok: true, attendance: doc, present, total: clean.length, pct: pct(present, clean.length), notified });
  }),
);

/** Today's scheduled batches with marking status. */
r.get(
  '/overview',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const date = isDate(req.query.date) ? req.query.date : ymd();
    const scoped = await scopedBatchIds(req);
    const batches = await Batch.find({ instituteId, active: true, ...(scoped ? { _id: { $in: scoped } } : {}) })
      .populate('teacherId', 'name')
      .sort({ startTime: 1 })
      .lean();
    const docs = await Attendance.find({ instituteId, date, batchId: { $in: batches.map((b) => b._id) } }).lean();
    const counts = await Student.aggregate([
      { $match: { instituteId, status: 'active', batchIds: { $in: batches.map((b) => b._id) } } },
      { $unwind: '$batchIds' },
      { $group: { _id: '$batchIds', n: { $sum: 1 } } },
    ]);
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    res.json(
      batches.map((b) => {
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
    );
  }),
);

r.get(
  '/alerts',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const streaks = await absenceStreaks(instituteId, Number(req.query.threshold) || req.institute?.settings?.absentAlertAfter || 3, scoped);
    const students = await Student.find({ _id: { $in: streaks.map((s) => new Types.ObjectId(s.studentId)) }, status: 'active' })
      .select('name studentCode parentName parentPhone batchIds')
      .populate('batchIds', 'name')
      .lean();
    res.json(streaks.map((s) => ({ ...s, student: students.find((x) => String(x._id) === s.studentId) })).filter((x) => x.student));
  }),
);

/** Attendance register for a batch over a date range (default last 30 days). */
r.get(
  '/register',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const batch = await assertBatchAccess(req, oid(req.query.batchId));
    const to = isDate(req.query.to) ? req.query.to : ymd();
    const from = isDate(req.query.from) ? req.query.from : ymd(addDays(new Date(to), -30));
    const [docs, students] = await Promise.all([
      Attendance.find({ instituteId, batchId: batch._id, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
      Student.find({ instituteId, batchIds: batch._id }).select('name studentCode').sort({ name: 1 }).lean(),
    ]);
    res.json({
      batch: { _id: batch._id, name: batch.name },
      dates: docs.map((d) => d.date),
      students: students.map((s) => {
        const row = docs.map((d) => d.records.find((x) => String(x.studentId) === String(s._id))?.status ?? null);
        const marked = row.filter(Boolean);
        return { ...s, row, pct: pct(marked.filter((x) => x !== 'absent').length, marked.length) };
      }),
    });
  }),
);

export default r;
