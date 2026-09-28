import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { allow, assertStudentAccess, auth, requireFeature, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Institute, Invoice, Payment, Student, Test, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { getEffectivePlan } from '../services/plan.js';
import { inr, nextStudentCode } from '../services/payments.js';
import { disconnectUser } from '../services/realtime.js';
import { attendanceByStudent, feesByStudent, scoresByStudent } from '../services/stats.js';
import { bumpData } from '../utils/cache.js';
import { HttpError, ah, oid, required, str } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { EMAIL_RX, PHONE_RX, cleanName, escapeRegex, generatePassword, optStr } from '../utils/security.js';
import { addDays, addMonthsClamped, parseDate, ymd } from '../utils/dates.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const EDITABLE = ['name', 'phone', 'dob', 'gender', 'address', 'parentName', 'parentPhone', 'parentEmail', 'course', 'joiningDate', 'status'] as const;
const GENDERS = ['male', 'female', 'other'];

/**
 * Validates the editable student fields in a request body.
 *   set   — fields to write
 *   unset — fields the user cleared (so "remove the phone number" really removes it)
 */
function pick(body: Record<string, unknown>, { strict = true } = {}) {
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  for (const k of EDITABLE) {
    const raw = body[k];
    if (raw === undefined) continue;
    if (raw === null || raw === '') {
      if (k === 'name' || k === 'status') throw new HttpError(400, `${k === 'name' ? 'Name' : 'Status'} is required`);
      unset[k] = 1;
      continue;
    }
    switch (k) {
      case 'name':
        set.name = cleanName(raw, 'Student name');
        break;
      case 'phone':
      case 'parentPhone': {
        const v = optStr(raw, 20) ?? '';
        if (!v) {
          unset[k] = 1;
          break;
        }
        if (!PHONE_RX.test(v)) {
          if (strict) throw new HttpError(400, `Enter a valid ${k === 'phone' ? 'student' : 'parent'} phone number`);
          continue;
        }
        set[k] = v;
        break;
      }
      case 'parentEmail': {
        const v = (optStr(raw, 120) ?? '').toLowerCase();
        if (!v) {
          unset[k] = 1;
          break;
        }
        if (!EMAIL_RX.test(v)) {
          if (strict) throw new HttpError(400, 'Enter a valid parent email address');
          continue;
        }
        set[k] = v;
        break;
      }
      case 'dob':
      case 'joiningDate':
        try {
          set[k] = parseDate(raw, k === 'dob' ? 'Date of birth' : 'Joining date');
        } catch (e) {
          if (strict) throw e;
        }
        break;
      case 'gender': {
        const v = String(raw).toLowerCase().trim();
        const g = v === 'm' ? 'male' : v === 'f' ? 'female' : v;
        if (!GENDERS.includes(g)) {
          if (strict) throw new HttpError(400, 'Gender must be male, female or other');
          continue;
        }
        set.gender = g;
        break;
      }
      case 'status':
        if (raw !== 'active' && raw !== 'inactive') throw new HttpError(400, 'Status must be active or inactive');
        set.status = raw;
        break;
      default:
        set[k] = optStr(raw, k === 'address' ? 300 : 120);
    }
  }
  return { set, unset };
}

/** Next auto code that no student has yet (a manually typed code may already use it). */
async function freeStudentCode(instituteId: Types.ObjectId) {
  for (let i = 0; i < 20; i++) {
    const code = await nextStudentCode(instituteId);
    if (!(await Student.exists({ instituteId, studentCode: code }))) return code;
  }
  throw new HttpError(500, 'Could not allocate a student code. Please try again.');
}

async function checkStudentLimit(req: Request, adding = 1) {
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
  const step = Math.max(1, Math.min(12, Math.round(intervalMonths) || 3));
  const docs = Array.from({ length: n }, (_, i) => {
    const due = addMonthsClamped(firstDue, i * step);
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

async function listFilter(req: Request) {
  const instituteId = tid(req);
  const search = str(req.query.search);
  const batchId = str(req.query.batchId);
  const status = str(req.query.status);
  const scoped = await scopedBatchIds(req);
  const filter: Record<string, unknown> = { instituteId };
  if (status === 'active' || status === 'inactive') filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ name: rx }, { studentCode: rx }, { phone: rx }, { parentName: rx }, { parentPhone: rx }];
  }
  if (batchId) filter.batchIds = oid(batchId);
  if (scoped) filter.batchIds = batchId ? { $in: scoped.filter((b) => String(b) === batchId) } : { $in: scoped };
  return filter;
}

/** Students list — 20 per page. Attendance / score / fee figures are computed for that page only. */
r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const filter = await listFilter(req);
    const p = pageParams(req.query);
    const [students, total] = await Promise.all([
      Student.find(filter).select('-notes').populate('batchIds', 'name color').sort({ name: 1, _id: 1 }).skip(p.skip).limit(p.limit).lean(),
      Student.countDocuments(filter),
    ]);
    const ids = students.map((s) => s._id);
    const [att, scores, fees] = await Promise.all([
      attendanceByStudent(instituteId, ids),
      scoresByStudent(instituteId, ids),
      req.user.role === 'owner' ? feesByStudent(instituteId, ids) : Promise.resolve(new Map()),
    ]);
    res.json(
      paged(
        students.map((s) => ({
          ...s,
          batches: s.batchIds,
          attendancePct: att.get(String(s._id))?.pct ?? null,
          avgScore: scores.get(String(s._id))?.avg ?? null,
          fees: fees.get(String(s._id)) ?? null,
          hasPortal: !!s.parentUserId,
        })),
        total,
        p,
      ),
    );
  }),
);

/**
 * Light list for pickers (search-as-you-type): max 20 matches, plus any `ids` asked for
 * explicitly so already-selected students always show.
 */
r.get(
  '/options',
  ah(async (req, res) => {
    const filter = await listFilter(req);
    const ids = typeof req.query.ids === 'string' && req.query.ids ? req.query.ids.split(',').slice(0, 200).map(oid) : [];
    // Explicitly requested ids still respect the teacher's batch scope.
    const scoped = await scopedBatchIds(req);
    const pickedFilter = { instituteId: tid(req), _id: { $in: ids }, ...(scoped && { batchIds: { $in: scoped } }) };
    const [matches, picked] = await Promise.all([
      Student.find(filter).select('name studentCode batchIds status').sort({ name: 1, _id: 1 }).limit(20).lean(),
      ids.length ? Student.find(pickedFilter).select('name studentCode batchIds status').lean() : Promise.resolve([]),
    ]);
    const seen = new Set(matches.map((m) => String(m._id)));
    res.json([...matches, ...picked.filter((x) => !seen.has(String(x._id)))]);
  }),
);

r.post(
  '/',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['name']);
    const { set } = pick(req.body);
    if (set.status === 'inactive') delete set.status;
    await checkStudentLimit(req);
    const { feeTotal, installments, firstDueDate, intervalMonths } = req.body;
    const fee = Number(feeTotal);
    if (feeTotal !== undefined && feeTotal !== '' && (!Number.isFinite(fee) || fee < 0 || fee > 10_000_000)) throw new HttpError(400, 'Enter a valid total fee');
    const firstDue = firstDueDate ? parseDate(firstDueDate, 'First due date') : new Date();

    const manualCode = optStr(req.body.studentCode, 30);
    if (manualCode && (await Student.exists({ instituteId, studentCode: manualCode }))) {
      throw new HttpError(409, `Student code ${manualCode} is already used by another student`);
    }
    const student = await Student.create({
      ...set,
      instituteId,
      studentCode: manualCode || (await freeStudentCode(instituteId)),
      batchIds: await validBatchIds(instituteId, req.body.batchIds),
    });
    if (fee > 0) {
      await createInstallments(instituteId, student._id, Math.round(fee), Number(installments) || 1, firstDue, Number(intervalMonths) || 3);
    }
    bumpData(instituteId);
    res.status(201).json(student);
  }),
);

r.post(
  '/import',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const rows: Record<string, unknown>[] = Array.isArray(req.body?.students) ? req.body.students.slice(0, 2000) : [];
    // Keep each row's position in the file so error messages point at the right line.
    const valid = rows.map((r, i) => ({ r, line: i + 1 })).filter(({ r }) => r && typeof r.name === 'string' && r.name.trim());
    if (!valid.length) throw new HttpError(400, 'No valid rows found. Each row needs at least a name.');

    // Skip rows that are already in the institute (same name + parent phone), so running the
    // same file twice never creates duplicates.
    const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);
    const existing = await Student.find({ instituteId, name: { $in: valid.map(({ r }) => String(r.name).trim()) } })
      .collation({ locale: 'en', strength: 2 }) // same name in different letter case still counts
      .select('name parentPhone')
      .lean();
    const seen = new Set(existing.map((e) => `${norm(e.name)}|${digits(e.parentPhone)}`));

    // Batches by name, so a "batch" column in the sheet puts the student straight into it.
    const batches = await Batch.find({ instituteId }).select('name').lean();
    const batchByName = new Map(batches.map((b) => [norm(b.name), b._id]));

    const errors: { row: number; name: string; error: string }[] = [];
    const docs: Record<string, unknown>[] = [];
    const docLine: number[] = [];
    let duplicates = 0;
    valid.forEach(({ r: row, line }) => {
      const k = `${norm(row.name)}|${digits(row.parentPhone)}`;
      if (seen.has(k)) {
        duplicates++;
        return;
      }
      try {
        // Lenient: a badly typed phone / date / gender in one cell is dropped, not fatal.
        const { set } = pick(row, { strict: false });
        const b = batchByName.get(norm(row.batch));
        docs.push({ ...set, status: 'active', instituteId, ...(b && { batchIds: [b] }) });
        docLine.push(line);
        seen.add(k);
      } catch (e) {
        errors.push({ row: line, name: String(row.name), error: e instanceof Error ? e.message : 'Invalid row' });
      }
    });
    if (docs.length) await checkStudentLimit(req, docs.length);

    // Reserve a block of student codes in one step instead of one round-trip per student.
    if (docs.length) {
      const inst = await Institute.findByIdAndUpdate(instituteId, { $inc: { 'counters.student': docs.length } }, { new: true }).select('counters').lean();
      const last = inst?.counters?.student ?? docs.length;
      let codes = docs.map((_, i) => `STU-${String(last - docs.length + 1 + i).padStart(4, '0')}`);
      const taken = new Set((await Student.find({ instituteId, studentCode: { $in: codes } }).select('studentCode').lean()).map((x) => x.studentCode));
      if (taken.size) codes = await Promise.all(codes.map((c) => (taken.has(c) ? freeStudentCode(instituteId) : c)));
      docs.forEach((d, i) => (d.studentCode = codes[i]));
    }
    let imported = 0;
    if (docs.length) {
      try {
        imported = (await Student.insertMany(docs, { ordered: false })).length;
      } catch (e) {
        const err = e as { insertedDocs?: unknown[]; writeErrors?: { index: number; errmsg?: string }[] };
        imported = err.insertedDocs?.length ?? 0;
        for (const w of err.writeErrors ?? []) errors.push({ row: docLine[w.index] ?? w.index + 1, name: String(docs[w.index]?.name ?? ''), error: 'Could not be saved' });
      }
    }
    bumpData(instituteId);
    audit(req, 'students.import', 'Student', undefined, `${imported} imported, ${duplicates} duplicates skipped, ${errors.length} errors`);
    res.status(201).json({ imported, duplicates, skipped: rows.length - valid.length, errors: errors.slice(0, 50) });
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

    // Teachers see this student's history in their own batches only.
    const inScope = scoped ? { batchId: { $in: scoped } } : {};
    const [attMap, scoreMap, attDocs, tests, invoices, payments] = await Promise.all([
      attendanceByStudent(instituteId, [student._id]),
      scoresByStudent(instituteId, [student._id]),
      Attendance.find({ instituteId, 'records.studentId': student._id, ...inScope }).sort({ date: -1 }).limit(60).populate('batchId', 'name').lean(),
      Test.find({ instituteId, 'results.studentId': student._id, status: { $in: ['graded', 'published'] }, ...inScope })
        .select('subject topic date maxMarks status passPercent results')
        .sort({ date: -1 })
        .limit(100)
        .lean(),
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
    const current = await Student.findOne({ _id: oid(req.params.id), instituteId });
    if (!current) throw new HttpError(404, 'Student not found');
    // Only validate what actually changed — old records with oddly typed phones stay editable.
    const body: Record<string, unknown> = { ...(req.body ?? {}) };
    for (const k of EDITABLE) {
      const cur = (current as unknown as Record<string, unknown>)[k];
      if (cur instanceof Date || body[k] === undefined) continue; // dates are always re-validated (cheap)
      if ((cur == null ? '' : String(cur)) === (body[k] == null ? '' : String(body[k]))) delete body[k];
    }
    const { set, unset } = pick(body);
    if (req.body?.batchIds) set.batchIds = await validBatchIds(instituteId, req.body.batchIds);
    if (set.status === 'active' && current.status !== 'active') await checkStudentLimit(req);

    // Keep the parent's portal login email in step with the student record.
    if (current.parentUserId && typeof set.parentEmail === 'string' && set.parentEmail !== current.parentEmail) {
      const clash = await User.findOne({ email: set.parentEmail, _id: { $ne: current.parentUserId } }).select('_id').lean();
      if (clash) throw new HttpError(409, 'Another account already uses this parent email. Use a different email, or remove the portal login first.');
      await User.updateOne({ _id: current.parentUserId, role: 'parent', instituteId }, { $set: { email: set.parentEmail } });
    }

    const student = await Student.findOneAndUpdate(
      { _id: current._id, instituteId },
      { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
      { new: true, runValidators: true },
    );
    if (!student) throw new HttpError(404, 'Student not found');

    const leaving = set.status === 'inactive' && current.status === 'active';
    const notes: string[] = [];
    if (leaving) {
      notes.push(`Deactivated${req.body?.reason ? ` — ${String(req.body.reason).slice(0, 200)}` : ''}`);
      // Optionally write off what is still due, so it stops showing as pending.
      if (req.body?.waiveDues) {
        const open = await Invoice.find({ instituteId, studentId: student._id, status: { $ne: 'paid' } }).lean();
        let waived = 0;
        for (const inv of open) {
          waived += inv.amount - inv.paidAmount;
          await Invoice.updateOne({ _id: inv._id }, { $set: { amount: inv.paidAmount, status: 'paid', title: `${inv.title} (waived)` } });
        }
        if (waived) notes.push(`${inr(waived)} dues waived`);
      }
      if (req.body?.disablePortal && student.parentUserId) {
        await unlinkParent(instituteId, student._id, student.parentUserId);
        await Student.updateOne({ _id: student._id }, { $unset: { parentUserId: 1 } });
        notes.push('parent login removed');
      }
      await Student.updateOne({ _id: student._id }, { $push: { notes: { $each: [{ text: notes.join(' · '), by: req.user.name, at: new Date() }], $position: 0 } } });
      audit(req, 'student.deactivate', 'Student', student._id, `${student.name}: ${notes.join(' · ')}`);
    }
    bumpData(instituteId);
    res.json(student);
  }),
);

r.delete(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await Student.findOne({ _id: oid(req.params.id), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    // Fee receipts are financial records — never delete them silently with the student.
    if (await Payment.exists({ instituteId, studentId: student._id })) {
      throw new HttpError(400, `${student.name} has fee payments on record, so they can't be deleted. Deactivate the student instead — their receipts stay in your accounts.`);
    }
    await student.deleteOne();
    // Only touch the documents that actually mention this student.
    const parents = await User.find({ instituteId, role: 'parent', studentIds: student._id }).select('_id').lean();
    await Promise.all([
      Invoice.deleteMany({ instituteId, studentId: student._id }),
      Attendance.updateMany({ instituteId, 'records.studentId': student._id }, { $pull: { records: { studentId: student._id } } }),
      Test.updateMany({ instituteId, 'results.studentId': student._id }, { $pull: { results: { studentId: student._id } } }),
      ...parents.map((p) => unlinkParent(instituteId, student._id, p._id)),
    ]);
    bumpData(instituteId);
    audit(req, 'student.delete', 'Student', student._id, `${student.name} (${student.studentCode})`);
    res.json({ ok: true });
  }),
);

r.post(
  '/:id/notes',
  ah(async (req, res) => {
    required(req.body ?? {}, ['text']);
    const text = String(req.body.text).trim().slice(0, 1000);
    if (!text) throw new HttpError(400, 'Note cannot be empty');
    await assertStudentAccess(req, oid(req.params.id));
    const student = await Student.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId: tid(req) },
      { $push: { notes: { $each: [{ text, by: req.user.name, at: new Date() }], $position: 0 } } },
      { new: true },
    );
    if (!student) throw new HttpError(404, 'Student not found');
    res.json(student.notes);
  }),
);

/**
 * Removes one child from a parent login. A parent left with no children is switched off and
 * signed out everywhere, so they stop seeing the child's data immediately.
 */
async function unlinkParent(instituteId: Types.ObjectId, studentId: Types.ObjectId, parentId: Types.ObjectId) {
  const p = await User.findOneAndUpdate(
    { _id: parentId, instituteId, role: 'parent' },
    { $pull: { studentIds: studentId }, $inc: { tokenVersion: 1 } },
    { new: true },
  );
  if (p && !p.studentIds.length) await User.updateOne({ _id: p._id }, { $set: { active: false } });
  disconnectUser(parentId);
}

/**
 * Parent portal login for a student:
 *  - no login yet            → creates one (or links the family's existing login, e.g. a sibling's)
 *  - same parent, again      → resets their password (signs them out everywhere)
 *  - a different email       → moves the child to the new login and removes the old parent's access
 */
r.post(
  '/:id/portal',
  allow('owner'),
  requireFeature('parentPortal'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await Student.findOne({ _id: oid(req.params.id), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    const email = String(req.body?.email || student.parentEmail || '').toLowerCase().trim();
    if (!email) throw new HttpError(400, "Add the parent's email address first");
    if (!EMAIL_RX.test(email)) throw new HttpError(400, 'Enter a valid parent email address');

    let parent = await User.findOne({ email });
    if (parent && (parent.role !== 'parent' || String(parent.instituteId) !== String(instituteId))) {
      throw new HttpError(409, 'This email is already used by another account');
    }
    // The child was linked to someone else before — take that access away.
    if (student.parentUserId && (!parent || String(parent._id) !== String(student.parentUserId))) {
      await unlinkParent(instituteId, student._id, student.parentUserId);
    }

    let password: string | undefined;
    let linkedExisting = false;
    if (parent) {
      const alreadyLinked = parent.studentIds.some((s) => String(s) === String(student._id)) && parent.active;
      if (alreadyLinked || !parent.active) {
        // Same parent again (or a switched-off login being revived) → fresh password.
        password = generatePassword();
        parent.password = await bcrypt.hash(password, 10);
        parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;
      } else {
        linkedExisting = true; // a sibling's parent: keep their current password
      }
      parent.active = true;
      if (!parent.studentIds.some((s) => String(s) === String(student._id))) parent.studentIds.push(student._id);
      await parent.save();
      disconnectUser(parent._id); // re-join rooms with the updated children list
    } else {
      password = generatePassword();
      parent = await User.create({
        name: student.parentName || `Parent of ${student.name}`,
        email,
        phone: student.parentPhone,
        password: await bcrypt.hash(password, 10),
        role: 'parent',
        instituteId,
        studentIds: [student._id],
      });
    }
    student.parentUserId = parent._id;
    student.parentEmail = email;
    await student.save();
    audit(req, linkedExisting ? 'portal.link' : 'portal.password', 'Student', student._id, `${student.name} → ${email}`);
    res.json({ email, password, linkedExisting });
  }),
);

/** Removes the parent's portal access to this student. */
r.delete(
  '/:id/portal',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await Student.findOne({ _id: oid(req.params.id), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    if (student.parentUserId) {
      await unlinkParent(instituteId, student._id, student.parentUserId);
      await Student.updateOne({ _id: student._id }, { $unset: { parentUserId: 1 } });
      audit(req, 'portal.remove', 'Student', student._id, student.name);
    }
    res.json({ ok: true });
  }),
);

r.get(
  '/:id/attendance-calendar',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const student = await assertStudentAccess(req, oid(req.params.id));
    const since = ymd(addDays(new Date(), -90));
    const scoped = await scopedBatchIds(req); // teachers: their own batches only
    const docs = await Attendance.find({ instituteId, 'records.studentId': student._id, date: { $gte: since }, ...(scoped && { batchId: { $in: scoped } }) }).lean();
    res.json(docs.map((d) => ({ date: d.date, status: d.records.find((x) => String(x.studentId) === String(student._id))?.status })));
  }),
);

export default r;
