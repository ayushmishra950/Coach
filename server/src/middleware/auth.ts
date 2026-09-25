import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../config.js';
import { Batch, Institute, User, type FeatureKey, type InstituteDoc, type Role } from '../models/index.js';
import { getEffectivePlan } from '../services/plan.js';
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

export const signToken = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });

export const auth = ah(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please log in to continue');
  let payload: { sub: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as { sub: string };
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }
  const user = await User.findById(payload.sub).lean();
  if (!user || !user.active) throw new HttpError(401, 'Account not found or disabled');

  req.user = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    instituteId: user.instituteId ?? undefined,
    studentIds: (user.studentIds ?? []) as Types.ObjectId[],
  };

  if (user.role !== 'superadmin') {
    const institute = await Institute.findById(user.instituteId);
    if (!institute) throw new HttpError(401, 'Institute not found');
    if (institute.status === 'suspended') throw new HttpError(403, 'This institute account has been suspended. Contact CoachFlow support.');
    req.institute = institute;
  }
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
      throw new HttpError(402, 'Upgrade your plan to unlock this feature', 'UPGRADE_REQUIRED', { feature });
    }
    next();
  });

/** The tenant id every institute-scoped query must be filtered by. */
export function tid(req: Request): Types.ObjectId {
  if (!req.user.instituteId) throw new HttpError(403, 'No institute context');
  return req.user.instituteId;
}

/** For teachers: the ids of batches they teach. For owners: null (no restriction). */
export async function scopedBatchIds(req: Request): Promise<Types.ObjectId[] | null> {
  if (req.user.role !== 'teacher') return null;
  const batches = await Batch.find({ instituteId: tid(req), teacherId: req.user.id }).select('_id').lean();
  return batches.map((b) => b._id);
}

export async function assertBatchAccess(req: Request, batchId: Types.ObjectId) {
  const batch = await Batch.findOne({ _id: batchId, instituteId: tid(req) });
  if (!batch) throw new HttpError(404, 'Batch not found');
  if (req.user.role === 'teacher' && String(batch.teacherId) !== String(req.user.id)) {
    throw new HttpError(403, 'This batch is not assigned to you');
  }
  return batch;
}
