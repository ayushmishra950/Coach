import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Institute, User, type UserDoc } from '../models/index.js';
import { assertNotSuspended, auth, signToken } from '../middleware/auth.js';
import { config } from '../config.js';
import { effectivePlanKey, getPlan, trialDaysLeft } from '../services/plan.js';
import { disconnectUser } from '../services/realtime.js';
import { HttpError, ah, required } from '../utils/http.js';
import { addDays } from '../utils/dates.js';
import { EMAIL_RX, PHONE_RX, assertPassword, cleanName, createFailureGuard, optStr, rateLimit } from '../utils/security.js';

const r = Router();

// Two guards: one per (network, email) so a typo-prone user is slowed down, and one per
// network so nobody can spray passwords across many accounts.
const loginGuard = createFailureGuard({ windowMs: 15 * 60 * 1000, max: 8 });
const ipGuard = createFailureGuard({ windowMs: 15 * 60 * 1000, max: 40 });
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many sign-ups from this network. Please try again later.' });
// Compared against when the email does not exist, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('coachflow-timing-equaliser', 10);

export async function sessionPayload(userId: unknown) {
  const user = (await User.findById(userId).lean()) as (UserDoc & { _id: unknown }) | null;
  if (!user) throw new HttpError(404, 'User not found');
  const institute = user.instituteId ? await Institute.findById(user.instituteId) : null;
  const plan = institute ? await getPlan(effectivePlanKey(institute)) : null;
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
  registerLimit,
  ah(async (req, res) => {
    required(req.body ?? {}, ['instituteName', 'ownerName', 'email', 'password']);
    const instituteName = cleanName(req.body.instituteName, 'Institute name');
    const ownerName = cleanName(req.body.ownerName, 'Your name');
    const email = String(req.body.email).toLowerCase().trim();
    const password = assertPassword(req.body.password);
    const phone = optStr(req.body.phone, 20);
    const city = optStr(req.body.city, 80);
    const type = optStr(req.body.type, 60);
    if (!EMAIL_RX.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (phone && !PHONE_RX.test(phone)) throw new HttpError(400, 'Enter a valid phone number');
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');

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
    res.status(201).json({ token: signToken(String(user._id), 0), ...(await sessionPayload(user._id)) });
  }),
);

r.post(
  '/login',
  ah(async (req, res) => {
    required(req.body ?? {}, ['email', 'password']);
    const email = String(req.body.email).toLowerCase().trim().slice(0, 200);
    const password = String(req.body.password).slice(0, 200);
    const ip = req.ip || 'unknown';
    const key = `${ip}:${email}`;
    // Behind a proxy without TRUST_PROXY every visitor shares one IP — a per-IP limit would then
    // lock out the whole site, so it only applies when real client IPs are known.
    const useIpGuard = !config.isProd || config.trustProxy;
    const wait = Math.max(loginGuard.check(key), useIpGuard ? ipGuard.check(ip) : 0);
    if (wait) throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`);
    const user = await User.findOne({ email }).select('+password');
    const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !ok) {
      loginGuard.fail(key);
      if (useIpGuard) ipGuard.fail(ip);
      throw new HttpError(401, 'Invalid email or password');
    }
    loginGuard.reset(key);
    if (!user.active) throw new HttpError(403, 'Your account has been disabled');
    // No token for anyone from a suspended institute.
    if (user.role !== 'superadmin') {
      const inst = await Institute.findById(user.instituteId).select('status suspendedReason').lean();
      if (!inst) throw new HttpError(403, 'Your institute account was not found. Please contact CoachFlow support.');
      assertNotSuspended(inst);
    }
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    res.json({ token: signToken(String(user._id), user.tokenVersion ?? 0), ...(await sessionPayload(user._id)) });
  }),
);

r.get('/me', auth, ah(async (req, res) => res.json(await sessionPayload(req.user.id))));

r.put(
  '/me',
  auth,
  ah(async (req, res) => {
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (req.body?.name !== undefined) set.name = cleanName(req.body.name);
    if (req.body?.phone !== undefined) {
      const phone = optStr(req.body.phone, 20);
      if (phone && !PHONE_RX.test(phone)) throw new HttpError(400, 'Enter a valid phone number');
      if (phone) set.phone = phone;
      else unset.phone = 1;
    }
    await User.updateOne({ _id: req.user.id }, { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) });
    res.json(await sessionPayload(req.user.id));
  }),
);

r.put(
  '/password',
  auth,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts. Please try again later.', key: (req) => `pw:${String(req.user.id)}` }),
  ah(async (req, res) => {
    required(req.body ?? {}, ['current', 'next']);
    const next = assertPassword(req.body.next, 'New password');
    const user = await User.findById(req.user.id).select('+password');
    if (!user || !(await bcrypt.compare(String(req.body.current), user.password))) throw new HttpError(400, 'Current password is incorrect');
    if (await bcrypt.compare(next, user.password)) throw new HttpError(400, 'New password must be different from the current one');
    // New password → every other logged-in device is signed out; this one gets a fresh token.
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { password: await bcrypt.hash(next, 10) }, $inc: { tokenVersion: 1 } },
      { new: true },
    );
    disconnectUser(user._id);
    res.json({ ok: true, token: signToken(String(user._id), updated?.tokenVersion ?? 0) });
  }),
);

/** Signs this account out on every device (e.g. a phone was lost). */
r.post(
  '/logout-all',
  auth,
  ah(async (req, res) => {
    await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
    disconnectUser(req.user.id);
    res.json({ ok: true });
  }),
);

export default r;
