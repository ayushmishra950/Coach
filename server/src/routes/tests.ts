import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Student, Test } from '../models/index.js';
import { audit } from '../services/audit.js';
import { notifyMany } from '../services/notify.js';
import { hasFeature } from '../services/plan.js';
import { bumpData } from '../utils/cache.js';
import { parseDate } from '../utils/dates.js';
import { HttpError, ah, oid, required, str } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

type Result = { studentId: Types.ObjectId; marks?: number | null; absent?: boolean | null };
function stats(results: Result[], maxMarks: number, passPercent = 40) {
  const valid = results.filter((x) => !x.absent && typeof x.marks === 'number');
  const entered = results.filter((x) => x.absent || typeof x.marks === 'number').length;
  if (!valid.length) return { avg: null, highest: null, lowest: null, passRate: null, entered };
  const pcts = valid.map((x) => ((x.marks as number) / maxMarks) * 100);
  return {
    avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    highest: Math.max(...valid.map((x) => x.marks as number)),
    lowest: Math.min(...valid.map((x) => x.marks as number)),
    passRate: Math.round((pcts.filter((p) => p >= passPercent).length / pcts.length) * 100),
    entered: results.filter((x) => x.absent || typeof x.marks === 'number').length,
  };
}

/** Validated test details (subject, topic, max marks, pass %, negative marking, date). */
function testFields(body: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};
  if (!partial || body.subject !== undefined) {
    const v = String(body.subject ?? '').trim().slice(0, 60);
    if (!v) throw new HttpError(400, 'Subject is required');
    out.subject = v;
  }
  if (body.topic !== undefined) out.topic = String(body.topic ?? '').trim().slice(0, 120) || undefined;
  if (!partial || body.maxMarks !== undefined) {
    const n = Number(body.maxMarks);
    if (!Number.isFinite(n) || n < 1 || n > 1000) throw new HttpError(400, 'Max marks must be between 1 and 1000');
    out.maxMarks = n;
  }
  if (body.passPercent !== undefined && body.passPercent !== '') {
    const n = Number(body.passPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Pass mark must be between 0% and 100%');
    out.passPercent = n;
  }
  if (body.negativeMarking !== undefined) out.negativeMarking = !!body.negativeMarking;
  if (!partial || body.date !== undefined) out.date = parseDate(body.date, 'Test date');
  return out;
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const batchId = str(req.query.batchId);
    const status = str(req.query.status);
    const q: Record<string, unknown> = { instituteId };
    if (scoped) q.batchId = { $in: scoped };
    if (batchId) q.batchId = scoped ? { $in: scoped.filter((b) => String(b) === batchId) } : oid(batchId);
    if (status === 'scheduled' || status === 'graded' || status === 'published') q.status = status;
    const p = pageParams(req.query);
    const [tests, total] = await Promise.all([
      Test.find(q)
        .select('batchId subject topic maxMarks passPercent negativeMarking date status publishedAt results.studentId results.marks results.absent')
        .populate('batchId', 'name color')
        .sort({ date: -1, _id: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .lean(),
      Test.countDocuments(q),
    ]);
    const pageBatchIds = tests.map((t) => (t.batchId as unknown as { _id: Types.ObjectId })?._id).filter(Boolean);
    const counts = await Student.aggregate([
      { $match: { instituteId, status: 'active', batchIds: { $in: pageBatchIds } } },
      { $unwind: '$batchIds' },
      { $group: { _id: '$batchIds', n: { $sum: 1 } } },
    ]);
    res.json(paged(
      tests.map((t) => ({
        ...t,
        batch: t.batchId,
        results: undefined,
        students: counts.find((c) => String(c._id) === String((t.batchId as unknown as { _id: unknown })?._id))?.n ?? 0,
        ...stats(t.results, t.maxMarks, t.passPercent ?? 40),
      })),
      total,
      p,
    ));
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
      ...testFields(req.body),
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
    if (!test.batchId) throw new HttpError(404, 'This test belonged to a batch that has been deleted.');
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
    const pass = test.passPercent ?? 40;
    const buckets = [
      { range: '0-39%', min: -Infinity, max: 40 },
      { range: '40-59%', min: 40, max: 60 },
      { range: '60-74%', min: 60, max: 75 },
      { range: '75-89%', min: 75, max: 90 },
      { range: '90-100%', min: 90, max: 101 },
    ].map((b) => ({ range: b.range, count: valid.filter((x) => ((x.marks as number) / test.maxMarks) * 100 >= b.min && ((x.marks as number) / test.maxMarks) * 100 < b.max).length }));
    const ranked = [...valid].sort((a, b) => (b.marks as number) - (a.marks as number));
    res.json({
      test: { ...test, batch: test.batchId, results: undefined },
      rows,
      stats: stats(test.results, test.maxMarks, pass),
      analytics: advanced
        ? { distribution: buckets, toppers: ranked.slice(0, 3).map((x) => ({ name: x.student.name, marks: x.marks })), needsHelp: ranked.filter((x) => ((x.marks as number) / test.maxMarks) * 100 < pass).map((x) => ({ name: x.student.name, marks: x.marks })) }
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
    const data = testFields(req.body ?? {}, true);
    const entered = test.results.filter((x) => typeof x.marks === 'number').map((x) => x.marks as number);
    if (data.maxMarks !== undefined && entered.length && Math.max(...entered) > (data.maxMarks as number)) {
      throw new HttpError(400, `Some students already have more than ${data.maxMarks} marks. Fix their marks first, or keep max marks at ${Math.max(...entered)} or more.`);
    }
    if (data.negativeMarking === false && entered.some((m) => m < 0)) throw new HttpError(400, 'Some marks are negative — fix them before turning off negative marking.');
    test.set(data);
    await test.save();
    bumpData(test.instituteId);
    if (test.status === 'published') audit(req, 'test.edit_after_publish', 'Test', test._id, `${test.subject}: ${Object.keys(data).join(', ')} changed`);
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
    // Only students of this institute who are in this test's batch can get marks.
    const allowed = new Set(
      // Active students only: the sheet shows only them, so inactive students' marks are kept as they are.
      (await Student.find({ instituteId: test.instituteId, batchIds: test.batchId, status: 'active' }).select('_id').lean()).map((x) => String(x._id)),
    );
    const results = [];
    const seen = new Set<string>();
    for (const x of input) {
      if (!allowed.has(String(x.studentId)) || seen.has(String(x.studentId))) continue;
      seen.add(String(x.studentId));
      const marks = x.marks === '' || x.marks == null ? null : Number(x.marks);
      const min = test.negativeMarking ? -test.maxMarks : 0;
      if (marks != null && (Number.isNaN(marks) || marks < min || marks > test.maxMarks)) {
        throw new HttpError(400, `Marks must be between ${min} and ${test.maxMarks}`);
      }
      if (marks == null && !x.absent) continue;
      results.push({ studentId: oid(x.studentId), marks: x.absent ? null : marks, absent: !!x.absent, remark: typeof x.remark === 'string' ? x.remark.slice(0, 200) : undefined });
    }
    // Keep marks of students who have since left the batch (they aren't in the sheet any more).
    const kept = test.results.filter((x) => !allowed.has(String(x.studentId)));
    // Marks changed after parents already saw them — keep a record of who changed what.
    let changed = 0;
    if (test.status === 'published') {
      const before = new Map(test.results.map((x) => [String(x.studentId), `${x.absent ? 'A' : x.marks}`]));
      changed = results.filter((x) => before.get(String(x.studentId)) !== `${x.absent ? 'A' : x.marks}`).length;
    }
    test.set('results', [...kept, ...results]);
    if (test.status === 'scheduled' && results.length) test.status = 'graded';
    await test.save();
    bumpData(test.instituteId);
    if (changed) audit(req, 'test.marks_after_publish', 'Test', test._id, `${test.subject}: marks changed for ${changed} student(s) after publishing`);
    res.json({ ok: true, status: test.status, changedAfterPublish: changed, ...stats(test.results, test.maxMarks, test.passPercent ?? 40) });
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
    bumpData(test.instituteId);
    if (firstPublish) {
      const students = await Student.find({ instituteId: test.instituteId, status: 'active', _id: { $in: test.results.map((x) => x.studentId) } })
        .select('name parentPhone parentEmail')
        .lean();
      const topic = test.topic ? ` — ${test.topic}` : '';
      // Sent in the background — publishing returns immediately.
      void notifyMany(
        test.results.flatMap((x) => {
          const s = students.find((y) => String(y._id) === String(x.studentId));
          if (!s) return [];
          return [{
            institute: req.institute!,
            type: 'test' as const,
            audience: 'parent' as const,
            studentId: s._id,
            title: `${test.subject} result published`,
            message: x.absent ? `${s.name} was absent for the ${test.subject}${topic} test.` : `${s.name} scored ${x.marks}/${test.maxMarks} in ${test.subject}${topic}.`,
            contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
          }];
        }),
      ).catch((e) => console.error('[publish notify]', (e as Error).message));
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
    bumpData(test.instituteId);
    audit(req, 'test.delete', 'Test', test._id, `${test.subject}${test.topic ? ` — ${test.topic}` : ''} (${test.status}, ${test.results.length} results)`);
    res.json({ ok: true });
  }),
);

export default r;
