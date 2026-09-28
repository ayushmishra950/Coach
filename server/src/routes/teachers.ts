import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Batch, Student, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { getEffectivePlan } from '../services/plan.js';
import { disconnectUser } from '../services/realtime.js';
import { parseDate } from '../utils/dates.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { EMAIL_RX, PHONE_RX, assertPassword, cleanName, escapeRegex, generatePassword, optStr } from '../utils/security.js';

const r = Router();
r.use(auth, allow('owner'));

/** Validated teacher profile fields from a request body ({ set, unset }). */
function teacherFields(body: Record<string, unknown>) {
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  const clear = (k: string) => (unset[k] = 1);
  if (body.name !== undefined) set.name = cleanName(body.name, 'Teacher name');
  if (body.phone !== undefined) {
    const v = optStr(body.phone, 20);
    if (v && !PHONE_RX.test(v)) throw new HttpError(400, 'Enter a valid phone number');
    if (v) set.phone = v;
    else clear('phone');
  }
  if (body.subjects !== undefined) {
    const list = Array.isArray(body.subjects) ? body.subjects : String(body.subjects ?? '').split(',');
    set.subjects = list.map((x) => String(x).trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 40));
  }
  if (body.qualification !== undefined) {
    const v = optStr(body.qualification, 120);
    if (v) set.qualification = v;
    else clear('qualification');
  }
  if (body.salary !== undefined) {
    if (body.salary === '' || body.salary === null) clear('salary');
    else {
      const n = Number(body.salary);
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, 'Enter a valid salary');
      set.salary = Math.round(n);
    }
  }
  if (body.joiningDate !== undefined) {
    if (body.joiningDate === '' || body.joiningDate === null) clear('joiningDate');
    else set.joiningDate = parseDate(body.joiningDate, 'Joining date');
  }
  return { set, unset };
}

async function assertTeacherSeat(req: Request) {
  const plan = await getEffectivePlan(req.institute!);
  const count = await User.countDocuments({ instituteId: tid(req), role: 'teacher', active: true });
  if (plan && count >= plan.teacherLimit) {
    throw new HttpError(402, `Your ${plan.name} plan allows up to ${plan.teacherLimit} active teachers. Upgrade to add more.`, 'UPGRADE_REQUIRED', { feature: 'teacherLimit' });
  }
}

/** Takes a teacher off every batch (lead and co-teacher). Returns the batch names affected. */
async function unassignTeacher(req: Request, teacherId: unknown) {
  const instituteId = tid(req);
  const tidObj = oid(String(teacherId));
  const affected = await Batch.find({ instituteId, $or: [{ teacherId: tidObj }, { coTeacherIds: tidObj }] }).select('name').lean();
  await Promise.all([
    Batch.updateMany({ instituteId, teacherId: tidObj }, { $unset: { teacherId: 1 } }),
    Batch.updateMany({ instituteId, coTeacherIds: tidObj }, { $pull: { coTeacherIds: tidObj } }),
  ]);
  return affected.map((b) => b.name);
}

/** Teachers list — 20 per page (active first). */
r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const p = pageParams(req.query);
    const filter: Record<string, unknown> = { instituteId, role: 'teacher' };
    if (req.query.status === 'active') filter.active = true;
    if (req.query.status === 'inactive') filter.active = false;
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { subjects: rx }];
    }
    const [teachers, total, activeCount, allCount] = await Promise.all([
      User.find(filter).sort({ active: -1, name: 1, _id: 1 }).skip(p.skip).limit(p.limit).lean(),
      User.countDocuments(filter),
      User.countDocuments({ instituteId, role: 'teacher', active: true }),
      User.countDocuments({ instituteId, role: 'teacher' }),
    ]);
    const tIds = teachers.map((t) => t._id);
    const batches = await Batch.find({ instituteId, active: true, $or: [{ teacherId: { $in: tIds } }, { coTeacherIds: { $in: tIds } }] })
      .select('name teacherId coTeacherIds color')
      .lean();
    const counts = await Student.aggregate<{ _id: unknown; n: number }>([
      { $match: { instituteId, status: 'active', batchIds: { $in: batches.map((b) => b._id) } } },
      { $unwind: '$batchIds' },
      { $group: { _id: '$batchIds', n: { $sum: 1 } } },
    ]);
    const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({
      ...paged(
        teachers.map((t) => {
          const id = String(t._id);
          const mine = batches.filter((b) => String(b.teacherId) === id || (b.coTeacherIds ?? []).some((x) => String(x) === id));
          return {
            ...t,
            batches: mine.map((b) => ({ _id: b._id, name: b.name, color: b.color, role: String(b.teacherId) === id ? 'lead' : 'co' })),
            studentCount: mine.reduce((s, b) => s + (countBy.get(String(b._id)) ?? 0), 0),
          };
        }),
        total,
        p,
      ),
      counts: { all: allCount, active: activeCount, inactive: allCount - activeCount },
    });
  }),
);

/** Active teachers for dropdowns (a plan allows at most a few dozen, so all are returned). */
r.get(
  '/options',
  ah(async (req, res) => {
    res.json(await User.find({ instituteId: tid(req), role: 'teacher', active: true }).select('name subjects').sort({ name: 1 }).lean());
  }),
);

r.post(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['name', 'email']);
    const email = String(req.body.email).toLowerCase().trim();
    if (!EMAIL_RX.test(email)) throw new HttpError(400, 'Enter a valid email address');
    const { set } = teacherFields(req.body);
    const password = req.body.password ? assertPassword(req.body.password) : generatePassword();
    await assertTeacherSeat(req);

    const existing = await User.findOne({ email });
    if (existing) {
      // Re-adding a teacher who was deactivated earlier: bring the same account back.
      if (existing.role === 'teacher' && String(existing.instituteId) === String(instituteId) && !existing.active) {
        existing.set({ ...set, active: true, password: await bcrypt.hash(password, 10), tokenVersion: (existing.tokenVersion ?? 0) + 1 });
        await existing.save();
        audit(req, 'teacher.reactivate', 'User', existing._id, existing.name);
        return res.status(201).json({ teacher: existing, credentials: { email, password }, reactivated: true });
      }
      throw new HttpError(409, existing.role === 'teacher' && String(existing.instituteId) === String(instituteId) ? 'This teacher is already on your staff' : 'This email is already used by another account');
    }
    const teacher = await User.create({ ...set, email, password: await bcrypt.hash(password, 10), role: 'teacher', instituteId });
    audit(req, 'teacher.create', 'User', teacher._id, `${teacher.name} <${email}>`);
    res.status(201).json({ teacher, credentials: { email: teacher.email, password } });
  }),
);

r.put(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const t = await User.findOne({ _id: oid(req.params.id), instituteId, role: 'teacher' });
    if (!t) throw new HttpError(404, 'Teacher not found');
    const { set, unset } = teacherFields(req.body ?? {});

    if (req.body?.email !== undefined) {
      const email = String(req.body.email).toLowerCase().trim();
      if (!EMAIL_RX.test(email)) throw new HttpError(400, 'Enter a valid email address');
      if (email !== t.email) {
        if (await User.exists({ email, _id: { $ne: t._id } })) throw new HttpError(409, 'This email is already used by another account');
        set.email = email;
      }
    }

    let unassigned: string[] = [];
    if (typeof req.body?.active === 'boolean' && req.body.active !== t.active) {
      if (req.body.active) await assertTeacherSeat(req); // reactivating needs a free seat on the plan
      else unassigned = await unassignTeacher(req, t._id);
      set.active = req.body.active;
      if (!req.body.active) set.tokenVersion = (t.tokenVersion ?? 0) + 1;
      audit(req, req.body.active ? 'teacher.reactivate' : 'teacher.deactivate', 'User', t._id, t.name);
    }
    const updated = await User.findOneAndUpdate(
      { _id: t._id },
      { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
      { new: true, runValidators: true },
    );
    if (set.active === false) disconnectUser(t._id);
    res.json({ ...updated!.toObject(), unassignedBatches: unassigned });
  }),
);

r.post(
  '/:id/reset-password',
  ah(async (req, res) => {
    const password = generatePassword();
    const t = await User.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId: tid(req), role: 'teacher' },
      { $set: { password: await bcrypt.hash(password, 10) }, $inc: { tokenVersion: 1 } },
      { new: true },
    );
    if (!t) throw new HttpError(404, 'Teacher not found');
    disconnectUser(t._id); // the old password and every logged-in device stop working now
    audit(req, 'teacher.password_reset', 'User', t._id, t.name);
    res.json({ email: t.email, password });
  }),
);

/** "Remove" a teacher = deactivate + take them off their batches. Their history stays. */
r.delete(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const t = await User.findOneAndUpdate({ _id: oid(req.params.id), instituteId, role: 'teacher' }, { $set: { active: false }, $inc: { tokenVersion: 1 } });
    if (!t) throw new HttpError(404, 'Teacher not found');
    const unassigned = await unassignTeacher(req, t._id);
    disconnectUser(t._id);
    audit(req, 'teacher.deactivate', 'User', t._id, `${t.name}${unassigned.length ? ` · unassigned from ${unassigned.join(', ')}` : ''}`);
    res.json({ ok: true, unassignedBatches: unassigned });
  }),
);

export default r;
