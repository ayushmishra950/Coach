import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { config } from '../config.js';
import { Batch, Institute, Student, User, type FeatureKey, type InstituteDoc, type Role } from '../models/index.js';
import { getEffectivePlan, syncBillingStatus } from '../services/plan.js';
import { onAuthDataChange, ttlCache } from '../utils/cache.js';
import { HttpError, ah } from '../utils/http.js';

export interface AuthUser {
  id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  instituteId?: Types.ObjectId;
  studentIds: Types.ObjectId[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthUser;
      institute?: InstituteDoc;
    }
  }
}

/** Blocks every user of a suspended institute (owner, teachers, parents) with a clear message. */
export function assertNotSuspended(institute: Pick<InstituteDoc, 'status' | 'suspendedReason'>) {
  if (institute.status !== 'suspended') return;
  const reason = institute.suspendedReason ? ` Reason: ${institute.suspendedReason}.` : '';
  throw new HttpError(403, `This institute's CoachFlow account has been suspended.${reason} Please contact the institute or CoachFlow support.`, 'INSTITUTE_SUSPENDED');
}

/** What teachers and parents see instead of any plan / upgrade wording. */
export const NOT_ENABLED = 'This feature isn’t switched on for your institute yet. Please contact your institute.';

export const signToken = (userId: string, version = 0) =>
  jwt.sign({ sub: userId, v: version }, config.jwtSecret, { expiresIn: '7d', algorithm: 'HS256' });

/**
 * Short-lived caches so an API call doesn't cost two extra DB round-trips just to check who
 * is calling. Entries are dropped on any User / Institute write (see the model hooks below),
 * so a disable, suspend, plan change or password reset still applies immediately.
 */
type LeanUser = {
  _id: Types.ObjectId; name: string; email: string; role: string; active?: boolean | null;
  instituteId?: Types.ObjectId | null; studentIds?: Types.ObjectId[]; tokenVersion?: number | null;
};
const userCache = ttlCache<LeanUser | null>(15_000);
// Institutes are cached as BSON bytes: every request gets its own copy with real ObjectIds.
const instCache = ttlCache<Uint8Array | null>(15_000);
// Bumped on every User / Institute write. A DB read that started before a write must not be
// cached after it (otherwise a just-reset password could keep working for 15 s).
let generation = 0;
export function invalidateAuthCache() {
  generation++;
  userCache.clear();
  instCache.clear();
}
onAuthDataChange(invalidateAuthCache);

async function loadUser(id: string) {
  let u = userCache.get(id);
  if (u === undefined) {
    const gen = generation;
    u = (await User.findById(id).select('name email role active instituteId studentIds tokenVersion').lean()) as LeanUser | null;
    if (gen === generation) userCache.set(id, u);
  }
  return u;
}

async function loadInstitute(id: Types.ObjectId): Promise<InstituteDoc | null> {
  const k = String(id);
  let bytes = instCache.get(k);
  if (bytes === undefined) {
    const gen = generation;
    const raw = await Institute.findById(id).lean();
    bytes = raw ? mongoose.mongo.BSON.serialize(raw) : null;
    if (gen === generation) instCache.set(k, bytes);
  }
  // A fresh document per request (deserialised from bytes), so a route that changes
  // req.institute never touches the cache, and ObjectIds / Dates stay real types.
  return bytes ? (Institute.hydrate(mongoose.mongo.BSON.deserialize(bytes)) as InstituteDoc) : null;
}

/**
 * Verifies a JWT and loads the user + institute. Shared by the REST middleware and the
 * Socket.IO handshake so both apply exactly the same rules.
 */
export async function authenticateToken(token: string | undefined): Promise<{ user: AuthUser; institute?: InstituteDoc }> {
  if (!token) throw new HttpError(401, 'Please log in to continue');
  let payload: { sub: string; v?: number };
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub: string; v?: number };
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }
  if (typeof payload.sub !== 'string' || !Types.ObjectId.isValid(payload.sub)) throw new HttpError(401, 'Session expired, please log in again');
  const user = await loadUser(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account not found or disabled');
  // Password changed / reset or "sign out everywhere" since this token was issued.
  if ((payload.v ?? 0) !== (user.tokenVersion ?? 0)) throw new HttpError(401, 'Your session has ended. Please log in again.');

  const authUser: AuthUser = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    instituteId: user.instituteId ?? undefined,
    studentIds: (user.studentIds ?? []) as Types.ObjectId[],
  };

  if (user.role === 'superadmin') return { user: authUser };
  const institute = user.instituteId ? await loadInstitute(user.instituteId) : null;
  if (!institute) throw new HttpError(401, 'Institute not found');
  assertNotSuspended(institute);
  await syncBillingStatus(institute);
  return { user: authUser, institute };
}

export const auth = ah(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const ctx = await authenticateToken(token);
  req.user = ctx.user;
  req.institute = ctx.institute;
  next();
});

export const allow =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this action'));
    next();
  };

/** Blocks a route unless the institute's current plan includes the feature. */
export const requireFeature = (feature: FeatureKey) =>
  ah(async (req: Request, _res: Response, next: NextFunction) => {
    const plan = await getEffectivePlan(req.institute!);
    if (!plan?.features.includes(feature)) {
      // Only the owner deals with plans; teachers and parents get a neutral message.
      throw new HttpError(402, req.user.role === 'owner' ? 'Upgrade your plan to unlock this feature' : NOT_ENABLED, 'UPGRADE_REQUIRED', { feature });
    }
    next();
  });

/** The tenant id every institute-scoped query must be filtered by. */
export function tid(req: Request): Types.ObjectId {
  if (!req.user.instituteId) throw new HttpError(403, 'No institute context');
  return req.user.instituteId;
}

/** Batches a teacher may work in: the ones they lead plus the ones they co-teach. */
export const teacherBatchFilter = (teacherId: Types.ObjectId) => ({ $or: [{ teacherId }, { coTeacherIds: teacherId }] });
export const teachesBatch = (batch: { teacherId?: unknown; coTeacherIds?: unknown[] | null }, userId: unknown) =>
  String(batch.teacherId) === String(userId) || (batch.coTeacherIds ?? []).some((t) => String(t) === String(userId));

const scopeCache = new WeakMap<Request, Promise<Types.ObjectId[] | null>>();

/** For teachers: the ids of batches they teach. For owners: null (no restriction). Cached per request. */
export function scopedBatchIds(req: Request): Promise<Types.ObjectId[] | null> {
  if (req.user.role !== 'teacher') return Promise.resolve(null);
  let p = scopeCache.get(req);
  if (!p) {
    p = Batch.find({ instituteId: tid(req), ...teacherBatchFilter(req.user.id) })
      .select('_id')
      .lean()
      .then((bs) => bs.map((b) => b._id));
    scopeCache.set(req, p);
  }
  return p;
}

export async function assertBatchAccess(req: Request, batchId: Types.ObjectId) {
  const batch = await Batch.findOne({ _id: batchId, instituteId: tid(req) });
  if (!batch) throw new HttpError(404, 'Batch not found');
  if (req.user.role === 'teacher' && !teachesBatch(batch, req.user.id)) {
    throw new HttpError(403, 'This batch is not assigned to you');
  }
  return batch;
}

/** Loads a student of this institute; teachers may only reach students in their own batches. */
export async function assertStudentAccess(req: Request, studentId: Types.ObjectId) {
  const student = await Student.findOne({ _id: studentId, instituteId: tid(req) });
  if (!student) throw new HttpError(404, 'Student not found');
  const scoped = await scopedBatchIds(req);
  if (scoped && !student.batchIds.some((b) => scoped.some((s) => String(s) === String(b)))) {
    throw new HttpError(403, 'This student is not in your batches');
  }
  return student;
}
