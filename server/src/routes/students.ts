import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, auth, requireFeature, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Invoice, Payment, Student, Test, User } from '../models/index.js';
import { getEffectivePlan } from '../services/plan.js';
import { nextStudentCode } from '../services/payments.js';
import { attendanceByStudent, feesByStudent, scoresByStudent } from '../services/stats.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { addDays } from '../utils/dates.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const EDITABLE = ['name', 'phone', 'dob', 'gender', 'address', 'parentName', 'parentPhone', 'parentEmail', 'course', 'joiningDate', 'status'] as const;

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (body[k] !== undefined) out[k] = body[k] === '' ? undefined : body[k];
  return out;
}

async function checkStudentLimit(req: Parameters<typeof tid>[0], adding = 1) {
  const plan = await getEffectivePlan(req.institute!);
  const count = await Student.countDocuments({ instituteId: tid(req), status: 'active' });
  if (plan && count + adding > plan.studentLimit) {
    throw new HttpError(402, `Your ${plan.name} plan allows up to ${plan.studentLimit} active students. Upgrade to add more.`, 'UPGRADE_REQUIRED', {
      feature: 'studentLimit',
    });
  }
}

async function validBatchIds(instituteId: Types.ObjectId, ids: unknown) {
  if (!Array.isArray(ids)) return [];
  const found = await Batch.find({ instituteId, _id: { $in: ids.map(oid) } }).select('_id').lean();
  return found.map((b) => b._id);
}

/** Creates N equal installments (last one absorbs rounding). */
export async function createInstallments(instituteId: Types.ObjectId, studentId: Types.ObjectId, total: number, count: number, firstDue: Date, intervalMonths = 3) {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  const base = Math.floor(total / n);
  const docs = Array.from({ length: n }, (_, i) => {
    const due = new Date(firstDue);
    due.setMonth(due.getMonth() + i * intervalMonths);
    return {
      instituteId,
      studentId,
      title: n === 1 ? 'Course Fee' : `Installment ${i + 1}`,
      installmentNo: i + 1,
      amount: i === n - 1 ? total - base * (n - 1) : base,
      dueDate: due,
    };
  });
  return Invoice.insertMany(docs);
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const { search, batchId, status } = req.query as Record<string, string>;
    const scoped = await scopedBatchIds(req);
    const filter: Record<string, unknown> = { instituteId };
    if (status && status !== 'all') filter.status = status;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { studentCode: rx }, { phone: rx }, { parentName: rx }, { parentPhone: rx }];
    }
    if (batchId) filter.batchIds = oid(batchId);
    if (scoped) filter.batchIds = batchId ? { $in: scoped.filter((b) => String(b) === batchId) } : { $in: scoped };

    const students = await Student.find(filter).populate('batchIds', 'name color').sort({ name: 1 }).lean();
    const ids = students.map((s) => s._id);
    const [att, scores, fees] = await Promise.all([
      attendanceByStudent(instituteId, ids),
      scoresByStudent(instituteId, ids),
      req.user.role === 'owner' ? feesByStudent(instituteId, ids) : Promise.resolve(new Map()),
    ]);
    res.json(
      students.map((s) => ({
        ...s,
        batches: s.batchIds,
        attendancePct: att.get(String(s._id))?.pct ?? null,
        avgScore: scores.get(String(s._id))?.avg ?? null,
        fees: fees.get(String(s._id)) ?? null,
        hasPortal: !!s.parentUserId,
      })),
    );
  }),
);

r.post(
  '/',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['name']);
    await checkStudentLimit(req);
    const { feeTotal, installments, firstDueDate, intervalMonths } = req.body;
    const student = await Student.create({
      ...pick(req.body),
      instituteId,
      studentCode: req.body.studentCode || (await nextStudentCode(instituteId)),
      batchIds: await validBatchIds(instituteId, req.body.batchIds),
    });
    if (Number(feeTotal) > 0) {
      await createInstallments(instituteId, student._id, Number(feeTotal), Number(installments) || 1, firstDueDate ? new Date(firstDueDate) : new Date(), Number(intervalMonths) || 3);
    }
    res.status(201).json(student);
  }),
);

r.post(
  '/import',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const rows: Record<string, unknown>[] = Array.isArray(req.body?.students) ? req.body.students : [];
    const valid = rows.filter((r) => typeof r.name === 'string' && r.name.trim());
    if (!valid.length) throw new HttpError(400, 'No valid rows found. Each row needs at least a name.');
    await checkStudentLimit(req, valid.length);
    const created = [];
    for (const row of valid) {
      created.push(await Student.create({ ...pick(row), instituteId, studentCode: await nextStudentCode(instituteId) }));
    }
    res.status(201).json({ imported: created.length, skipped: rows.length - valid.length });
  }),
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await Student.findOne({ _id: oid(req.params.id), instituteId })
      .populate({ path: 'batchIds', select: 'name subject days startTime endTime color teacherId', populate: { path: 'teacherId', select: 'name' } })
      .lean();
    if (!student) throw new HttpError(404, 'Student not found');
    const scoped = await scopedBatchIds(req);
    if (scoped && !student.batchIds.some((b) => scoped.some((s) => String(s) === String((b as { _id: unknown })._id)))) {
      throw new HttpError(403, 'This student is not in your batches');
    }

    const [attMap, scoreMap, attDocs, tests, invoices, payments] = await Promise.all([
      attendanceByStudent(instituteId, [student._id]),
      scoresByStudent(instituteId, [student._id]),
      Attendance.find({ instituteId, 'records.studentId': student._id }).sort({ date: -1 }).limit(60).populate('batchId', 'name').lean(),
      Test.find({ instituteId, 'results.studentId': student._id, status: { $in: ['graded', 'published'] } }).sort({ date: -1 }).lean(),
      req.user.role === 'owner' ? Invoice.find({ instituteId, studentId: student._id }).sort({ dueDate: 1 }).lean() : [],
      req.user.role === 'owner' ? Payment.find({ instituteId, studentId: student._id }).sort({ paidAt: -1 }).lean() : [],
    ]);

    const results = tests.map((t) => {
      const res = t.results.find((x) => String(x.studentId) === String(student._id))!;
      return {
        testId: t._id,
        subject: t.subject,
        topic: t.topic,
        date: t.date,
        maxMarks: t.maxMarks,
        marks: res.marks,
        absent: res.absent,
        pct: res.absent || res.marks == null ? null : Math.round((res.marks / t.maxMarks) * 100),
        status: t.status,
      };
    });
    const bySubject: Record<string, { sum: number; n: number }> = {};
    for (const x of results) {
      if (x.pct == null) continue;
      bySubject[x.subject] ??= { sum: 0, n: 0 };
      bySubject[x.subject].sum += x.pct;
      bySubject[x.subject].n++;
    }
    const total = invoices.reduce((s, i) => s + i.amount, 0);
    const paid = invoices.reduce((s, i) => s + i.paidAmount, 0);

    res.json({
      student: { ...student, batches: student.batchIds, hasPortal: !!student.parentUserId },
      attendance: {
        ...(attMap.get(String(student._id)) ?? { total: 0, present: 0, pct: 0 }),
        history: attDocs.map((a) => ({
          date: a.date,
          batch: (a.batchId as unknown as { name: string })?.name,
          status: a.records.find((x) => String(x.studentId) === String(student._id))?.status,
        })),
      },
      scores: {
        avg: scoreMap.get(String(student._id))?.avg ?? null,
        results,
        bySubject: Object.entries(bySubject).map(([subject, v]) => ({ subject, avg: Math.round(v.sum / v.n) })),
      },
      fees: req.user.role === 'owner' ? { total, paid, pending: total - paid, invoices, payments } : null,
    });
  }),
);

r.put(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const update: Record<string, unknown> = pick(req.body ?? {});
    if (req.body?.batchIds) update.batchIds = await validBatchIds(instituteId, req.body.batchIds);
    if (update.status === 'active') {
      const current = await Student.findOne({ _id: oid(req.params.id), instituteId }).lean();
      if (current?.status !== 'active') await checkStudentLimit(req);
    }
    const student = await Student.findOneAndUpdate({ _id: oid(req.params.id), instituteId }, update, { new: true, runValidators: true });
    if (!student) throw new HttpError(404, 'Student not found');
    res.json(student);
  }),
);

r.delete(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await Student.findOneAndDelete({ _id: oid(req.params.id), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    await Promise.all([
      Invoice.deleteMany({ instituteId, studentId: student._id }),
      Payment.deleteMany({ instituteId, studentId: student._id }),
      Attendance.updateMany({ instituteId }, { $pull: { records: { studentId: student._id } } }),
      Test.updateMany({ instituteId }, { $pull: { results: { studentId: student._id } } }),
      User.updateMany({ instituteId, role: 'parent' }, { $pull: { studentIds: student._id } }),
    ]);
    res.json({ ok: true });
  }),
);

r.post(
  '/:id/notes',
  ah(async (req, res) => {
    required(req.body ?? {}, ['text']);
    const student = await Student.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId: tid(req) },
      { $push: { notes: { $each: [{ text: req.body.text, by: req.user.name, at: new Date() }], $position: 0 } } },
      { new: true },
    );
    if (!student) throw new HttpError(404, 'Student not found');
    res.json(student.notes);
  }),
);

/** Creates (or resets) the parent portal login for a student. */
r.post(
  '/:id/portal',
  allow('owner'),
  requireFeature('parentPortal'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await Student.findOne({ _id: oid(req.params.id), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    const email = (req.body?.email || student.parentEmail || '').toLowerCase().trim();
    if (!email) throw new HttpError(400, "Add the parent's email address first");
    const password = crypto.randomBytes(4).toString('hex');
    const hash = await bcrypt.hash(password, 10);

    let parent = await User.findOne({ email });
    if (parent && (parent.role !== 'parent' || String(parent.instituteId) !== String(instituteId))) {
      throw new HttpError(409, 'This email is already used by another account');
    }
    if (parent) {
      parent.password = hash;
      if (!parent.studentIds.some((s) => String(s) === String(student._id))) parent.studentIds.push(student._id);
      await parent.save();
    } else {
      parent = await User.create({
        name: student.parentName || `Parent of ${student.name}`,
        email,
        phone: student.parentPhone,
        password: hash,
        role: 'parent',
        instituteId,
        studentIds: [student._id],
      });
    }
    student.parentUserId = parent._id;
    student.parentEmail = email;
    await student.save();
    res.json({ email, password });
  }),
);

r.get(
  '/:id/attendance-calendar',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const since = addDays(new Date(), -90).toISOString().slice(0, 10);
    const docs = await Attendance.find({ instituteId, 'records.studentId': oid(req.params.id), date: { $gte: since } }).lean();
    res.json(docs.map((d) => ({ date: d.date, status: d.records.find((x) => String(x.studentId) === req.params.id)?.status })));
  }),
);

export default r;
