import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Batch, Student, User } from '../models/index.js';
import { getEffectivePlan } from '../services/plan.js';
import { HttpError, ah, oid, required } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner'));

const FIELDS = ['name', 'phone', 'subjects', 'qualification', 'salary', 'joiningDate'] as const;

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const teachers = await User.find({ instituteId, role: 'teacher' }).sort({ active: -1, name: 1 }).lean();
    const batches = await Batch.find({ instituteId, active: true }).select('name teacherId color').lean();
    const counts = await Student.aggregate([
      { $match: { instituteId, status: 'active' } },
      { $unwind: '$batchIds' },
      { $group: { _id: '$batchIds', n: { $sum: 1 } } },
    ]);
    res.json(
      teachers.map((t) => {
        const mine = batches.filter((b) => String(b.teacherId) === String(t._id));
        return {
          ...t,
          batches: mine,
          studentCount: mine.reduce((s, b) => s + (counts.find((c) => String(c._id) === String(b._id))?.n ?? 0), 0),
        };
      }),
    );
  }),
);

r.post(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['name', 'email']);
    const plan = await getEffectivePlan(req.institute!);
    const count = await User.countDocuments({ instituteId, role: 'teacher', active: true });
    if (plan && count >= plan.teacherLimit) {
      throw new HttpError(402, `Your ${plan.name} plan allows up to ${plan.teacherLimit} teachers. Upgrade to add more.`, 'UPGRADE_REQUIRED', { feature: 'teacherLimit' });
    }
    const password = req.body.password || crypto.randomBytes(4).toString('hex');
    const data: Record<string, unknown> = {};
    for (const k of FIELDS) if (req.body[k] !== undefined && req.body[k] !== '') data[k] = req.body[k];
    const teacher = await User.create({
      ...data,
      email: req.body.email,
      password: await bcrypt.hash(password, 10),
      role: 'teacher',
      instituteId,
    });
    res.status(201).json({ teacher, credentials: { email: teacher.email, password } });
  }),
);

r.put(
  '/:id',
  ah(async (req, res) => {
    const data: Record<string, unknown> = {};
    for (const k of FIELDS) if (req.body?.[k] !== undefined) data[k] = req.body[k];
    if (typeof req.body?.active === 'boolean') data.active = req.body.active;
    const t = await User.findOneAndUpdate({ _id: oid(req.params.id), instituteId: tid(req), role: 'teacher' }, data, { new: true });
    if (!t) throw new HttpError(404, 'Teacher not found');
    res.json(t);
  }),
);

r.post(
  '/:id/reset-password',
  ah(async (req, res) => {
    const password = crypto.randomBytes(4).toString('hex');
    const t = await User.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId: tid(req), role: 'teacher' },
      { password: await bcrypt.hash(password, 10) },
      { new: true },
    );
    if (!t) throw new HttpError(404, 'Teacher not found');
    res.json({ email: t.email, password });
  }),
);

r.delete(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const t = await User.findOneAndUpdate({ _id: oid(req.params.id), instituteId, role: 'teacher' }, { active: false });
    if (!t) throw new HttpError(404, 'Teacher not found');
    await Batch.updateMany({ instituteId, teacherId: t._id }, { $unset: { teacherId: 1 } });
    res.json({ ok: true });
  }),
);

export default r;
