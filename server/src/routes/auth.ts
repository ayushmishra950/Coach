import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Institute, Plan, User, type UserDoc } from '../models/index.js';
import { auth, signToken } from '../middleware/auth.js';
import { effectivePlanKey, trialDaysLeft } from '../services/plan.js';
import { HttpError, ah, required } from '../utils/http.js';
import { addDays } from '../utils/dates.js';

const r = Router();

export async function sessionPayload(userId: unknown) {
  const user = (await User.findById(userId).lean()) as (UserDoc & { _id: unknown }) | null;
  if (!user) throw new HttpError(404, 'User not found');
  const institute = user.instituteId ? await Institute.findById(user.instituteId) : null;
  const plan = institute ? await Plan.findOne({ key: effectivePlanKey(institute) }).lean() : null;
  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      subjects: user.subjects,
      studentIds: (user.studentIds ?? []).map(String),
    },
    institute: institute
      ? {
          id: String(institute._id),
          name: institute.name,
          city: institute.city,
          phone: institute.phone,
          email: institute.email,
          type: institute.type,
          brandColor: institute.brandColor,
          logoText: institute.logoText,
          plan: institute.plan,
          status: institute.status,
          billingCycle: institute.billingCycle,
          trialEndsAt: institute.trialEndsAt,
          currentPeriodEnd: institute.currentPeriodEnd,
          trialDaysLeft: trialDaysLeft(institute),
        }
      : null,
    plan: plan
      ? { key: plan.key, name: plan.name, features: plan.features, studentLimit: plan.studentLimit, teacherLimit: plan.teacherLimit }
      : null,
  };
}

r.post(
  '/register',
  ah(async (req, res) => {
    const { instituteName, ownerName, email, password, phone, city, type } = req.body ?? {};
    required(req.body ?? {}, ['instituteName', 'ownerName', 'email', 'password']);
    if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (await User.exists({ email: String(email).toLowerCase() })) throw new HttpError(409, 'An account with this email already exists');

    const institute = await Institute.create({
      name: instituteName,
      ownerName,
      email,
      phone,
      city,
      type,
      logoText: String(instituteName).slice(0, 2).toUpperCase(),
      plan: 'premium',
      status: 'trial',
      trialEndsAt: addDays(new Date(), 30),
    });
    const user = await User.create({
      name: ownerName,
      email,
      phone,
      password: await bcrypt.hash(password, 10),
      role: 'owner',
      instituteId: institute._id,
    });
    res.status(201).json({ token: signToken(String(user._id)), ...(await sessionPayload(user._id)) });
  }),
);

r.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body ?? {};
    required(req.body ?? {}, ['email', 'password']);
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) throw new HttpError(401, 'Invalid email or password');
    if (!user.active) throw new HttpError(403, 'Your account has been disabled');
    user.lastLoginAt = new Date();
    await user.save();
    res.json({ token: signToken(String(user._id)), ...(await sessionPayload(user._id)) });
  }),
);

r.get('/me', auth, ah(async (req, res) => res.json(await sessionPayload(req.user.id))));

r.put(
  '/me',
  auth,
  ah(async (req, res) => {
    const { name, phone } = req.body ?? {};
    await User.updateOne({ _id: req.user.id }, { ...(name && { name }), ...(phone !== undefined && { phone }) });
    res.json(await sessionPayload(req.user.id));
  }),
);

r.put(
  '/password',
  auth,
  ah(async (req, res) => {
    const { current, next } = req.body ?? {};
    required(req.body ?? {}, ['current', 'next']);
    if (String(next).length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
    const user = await User.findById(req.user.id).select('+password');
    if (!user || !(await bcrypt.compare(current, user.password))) throw new HttpError(400, 'Current password is incorrect');
    user.password = await bcrypt.hash(next, 10);
    await user.save();
    res.json({ ok: true });
  }),
);

export default r;
