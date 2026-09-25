import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Student, Test } from '../models/index.js';
import { notify } from '../services/notify.js';
import { hasFeature } from '../services/plan.js';
import { HttpError, ah, oid, required } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

type Result = { studentId: Types.ObjectId; marks?: number | null; absent?: boolean | null };
function stats(results: Result[], maxMarks: number) {
  const valid = results.filter((x) => !x.absent && typeof x.marks === 'number');
  if (!valid.length) return { avg: null, highest: null, lowest: null, passRate: null, entered: 0 };
  const pcts = valid.map((x) => ((x.marks as number) / maxMarks) * 100);
  return {
    avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    highest: Math.max(...valid.map((x) => x.marks as number)),
    lowest: Math.min(...valid.map((x) => x.marks as number)),
    passRate: Math.round((pcts.filter((p) => p >= 40).length / pcts.length) * 100),
    entered: results.filter((x) => x.absent || typeof x.marks === 'number').length,
  };
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const { batchId, status } = req.query as Record<string, string>;
    const q: Record<string, unknown> = { instituteId };
    if (scoped) q.batchId = { $in: scoped };
    if (batchId) q.batchId = scoped ? { $in: scoped.filter((b) => String(b) === batchId) } : oid(batchId);
    if (status && status !== 'all') q.status = status;
    const tests = await Test.find(q).populate('batchId', 'name color').sort({ date: -1 }).lean();
    const counts = await Student.aggregate([
      { $match: { instituteId, status: 'active' } },
      { $unwind: '$batchIds' },
      { $group: { _id: '$batchIds', n: { $sum: 1 } } },
    ]);
    res.json(
      tests.map((t) => ({
        ...t,
        batch: t.batchId,
        results: undefined,
        students: counts.find((c) => String(c._id) === String((t.batchId as unknown as { _id: unknown })?._id))?.n ?? 0,
        ...stats(t.results, t.maxMarks),
      })),
    );
  }),
);

r.post(
  '/',
  ah(async (req, res) => {
    required(req.body ?? {}, ['batchId', 'subject', 'maxMarks', 'date']);
    const batch = await assertBatchAccess(req, oid(req.body.batchId));
    const test = await Test.create({
      instituteId: tid(req),
      batchId: batch._id,
      subject: req.body.subject,
      topic: req.body.topic,
      maxMarks: Number(req.body.maxMarks),
      date: new Date(req.body.date),
      createdBy: req.user.id,
    });
    res.status(201).json(test);
  }),
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const test = await Test.findOne({ _id: oid(req.params.id), instituteId }).populate('batchId', 'name color').lean();
    if (!test) throw new HttpError(404, 'Test not found');
    await assertBatchAccess(req, (test.batchId as unknown as { _id: Types.ObjectId })._id);
    const students = await Student.find({ instituteId, batchIds: (test.batchId as unknown as { _id: Types.ObjectId })._id, status: 'active' })
      .select('name studentCode')
      .sort({ name: 1 })
      .lean();
    const rows = students.map((s) => {
      const x = test.results.find((y) => String(y.studentId) === String(s._id));
      return { student: s, marks: x?.marks ?? null, absent: x?.absent ?? false, remark: x?.remark ?? '' };
    });
    const advanced = await hasFeature(req.institute!, 'advancedTests');
    const valid = rows.filter((x) => !x.absent && typeof x.marks === 'number');
    const buckets = [
      { range: '0-39%', min: 0, max: 40 },
      { range: '40-59%', min: 40, max: 60 },
      { range: '60-74%', min: 60, max: 75 },
      { range: '75-89%', min: 75, max: 90 },
      { range: '90-100%', min: 90, max: 101 },
    ].map((b) => ({ range: b.range, count: valid.filter((x) => ((x.marks as number) / test.maxMarks) * 100 >= b.min && ((x.marks as number) / test.maxMarks) * 100 < b.max).length }));
    const ranked = [...valid].sort((a, b) => (b.marks as number) - (a.marks as number));
    res.json({
      test: { ...test, batch: test.batchId, results: undefined },
      rows,
      stats: stats(test.results, test.maxMarks),
      analytics: advanced
        ? { distribution: buckets, toppers: ranked.slice(0, 3).map((x) => ({ name: x.student.name, marks: x.marks })), needsHelp: ranked.filter((x) => ((x.marks as number) / test.maxMarks) * 100 < 40).map((x) => ({ name: x.student.name, marks: x.marks })) }
        : null,
    });
  }),
);

r.put(
  '/:id',
  ah(async (req, res) => {
    const test = await Test.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!test) throw new HttpError(404, 'Test not found');
    await assertBatchAccess(req, test.batchId);
    for (const k of ['subject', 'topic'] as const) if (req.body?.[k] !== undefined) test[k] = req.body[k];
    if (req.body?.maxMarks) test.maxMarks = Number(req.body.maxMarks);
    if (req.body?.date) test.date = new Date(req.body.date);
    await test.save();
    res.json(test);
  }),
);

r.put(
  '/:id/marks',
  ah(async (req, res) => {
    const test = await Test.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!test) throw new HttpError(404, 'Test not found');
    await assertBatchAccess(req, test.batchId);
    const input: { studentId: string; marks: unknown; absent?: boolean; remark?: string }[] = Array.isArray(req.body?.results) ? req.body.results : [];
    const results = [];
    for (const x of input) {
      const marks = x.marks === '' || x.marks == null ? null : Number(x.marks);
      if (marks != null && (Number.isNaN(marks) || marks < 0 || marks > test.maxMarks)) {
        throw new HttpError(400, `Marks must be between 0 and ${test.maxMarks}`);
      }
      if (marks == null && !x.absent) continue;
      results.push({ studentId: oid(x.studentId), marks: x.absent ? null : marks, absent: !!x.absent, remark: x.remark });
    }
    test.set('results', results);
    if (test.status === 'scheduled' && results.length) test.status = 'graded';
    await test.save();
    res.json({ ok: true, status: test.status, ...stats(test.results, test.maxMarks) });
  }),
);

r.post(
  '/:id/publish',
  ah(async (req, res) => {
    const test = await Test.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!test) throw new HttpError(404, 'Test not found');
    await assertBatchAccess(req, test.batchId);
    if (!test.results.length) throw new HttpError(400, 'Enter marks before publishing results');
    const firstPublish = test.status !== 'published';
    test.status = 'published';
    test.publishedAt = new Date();
    await test.save();
    if (firstPublish) {
      const students = await Student.find({ _id: { $in: test.results.map((x) => x.studentId) } }).lean();
      for (const x of test.results) {
        const s = students.find((y) => String(y._id) === String(x.studentId));
        if (!s) continue;
        await notify({
          institute: req.institute!,
          type: 'test',
          audience: 'parent',
          studentId: s._id,
          title: `${test.subject} result published`,
          message: x.absent
            ? `${s.name} was absent for the ${test.subject}${test.topic ? ` (${test.topic})` : ''} test.`
            : `${s.name} scored ${x.marks}/${test.maxMarks} in ${test.subject}${test.topic ? ` — ${test.topic}` : ''}.`,
          contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
        });
      }
    }
    res.json({ ok: true });
  }),
);

r.delete(
  '/:id',
  ah(async (req, res) => {
    const test = await Test.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!test) throw new HttpError(404, 'Test not found');
    await assertBatchAccess(req, test.batchId);
    await test.deleteOne();
    res.json({ ok: true });
  }),
);

export default r;
