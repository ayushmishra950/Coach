import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { config } from '../config.js';
import { Batch, Institute, Student, User } from '../models/index.js';
import { getEffectivePlan, syncBillingStatus } from '../services/plan.js';
import { onAuthDataChange, ttlCache } from '../utils/cache.js';
import { HttpError, ah } from '../utils/http.js';
/** Blocks every user of a suspended institute (owner, teachers, parents) with a clear message. */
export function assertNotSuspended(institute) {
    if (institute.status !== 'suspended')
        return;
    const reason = institute.suspendedReason ? ` Reason: ${institute.suspendedReason}.` : '';
    throw new HttpError(403, `This institute's CoachFlow account has been suspended.${reason} Please contact the institute or CoachFlow support.`, 'INSTITUTE_SUSPENDED');
}
/** What teachers and parents see instead of any plan / upgrade wording. */
export const NOT_ENABLED = 'This feature isn’t switched on for your institute yet. Please contact your institute.';
export const signToken = (userId, version = 0) => jwt.sign({ sub: userId, v: version }, config.jwtSecret, { expiresIn: '7d', algorithm: 'HS256' });
const userCache = ttlCache(15_000);
// Institutes are cached as BSON bytes: every request gets its own copy with real ObjectIds.
const instCache = ttlCache(15_000);
// Bumped on every User / Institute write. A DB read that started before a write must not be
// cached after it (otherwise a just-reset password could keep working for 15 s).
let generation = 0;
export function invalidateAuthCache() {
    generation++;
    userCache.clear();
    instCache.clear();
}
onAuthDataChange(invalidateAuthCache);
async function loadUser(id) {
    let u = userCache.get(id);
    if (u === undefined) {
        const gen = generation;
        u = (await User.findById(id).select('name email role active instituteId studentIds tokenVersion').lean());
        if (gen === generation)
            userCache.set(id, u);
    }
    return u;
}
async function loadInstitute(id) {
    const k = String(id);
    let bytes = instCache.get(k);
    if (bytes === undefined) {
        const gen = generation;
        const raw = await Institute.findById(id).lean();
        bytes = raw ? mongoose.mongo.BSON.serialize(raw) : null;
        if (gen === generation)
            instCache.set(k, bytes);
    }
    // A fresh document per request (deserialised from bytes), so a route that changes
    // req.institute never touches the cache, and ObjectIds / Dates stay real types.
    return bytes ? Institute.hydrate(mongoose.mongo.BSON.deserialize(bytes)) : null;
}
/**
 * Verifies a JWT and loads the user + institute. Shared by the REST middleware and the
 * Socket.IO handshake so both apply exactly the same rules.
 */
export async function authenticateToken(token) {
    if (!token)
        throw new HttpError(401, 'Please log in to continue');
    let payload;
    try {
        payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    }
    catch {
        throw new HttpError(401, 'Session expired, please log in again');
    }
    if (typeof payload.sub !== 'string' || !Types.ObjectId.isValid(payload.sub))
        throw new HttpError(401, 'Session expired, please log in again');
    const user = await loadUser(payload.sub);
    if (!user || !user.active)
        throw new HttpError(401, 'Account not found or disabled');
    // Password changed / reset or "sign out everywhere" since this token was issued.
    if ((payload.v ?? 0) !== (user.tokenVersion ?? 0))
        throw new HttpError(401, 'Your session has ended. Please log in again.');
    const authUser = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        instituteId: user.instituteId ?? undefined,
        studentIds: (user.studentIds ?? []),
    };
    if (user.role === 'superadmin')
        return { user: authUser };
    const institute = user.instituteId ? await loadInstitute(user.instituteId) : null;
    if (!institute)
        throw new HttpError(401, 'Institute not found');
    assertNotSuspended(institute);
    await syncBillingStatus(institute);
    return { user: authUser, institute };
}
export const auth = ah(async (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const ctx = await authenticateToken(token);
    req.user = ctx.user;
    req.institute = ctx.institute;
    next();
});
export const allow = (...roles) => (req, _res, next) => {
    if (!roles.includes(req.user.role))
        return next(new HttpError(403, 'You do not have access to this action'));
    next();
};
/** Blocks a route unless the institute's current plan includes the feature. */
export const requireFeature = (feature) => ah(async (req, _res, next) => {
    const plan = await getEffectivePlan(req.institute);
    if (!plan?.features.includes(feature)) {
        // Only the owner deals with plans; teachers and parents get a neutral message.
        throw new HttpError(402, req.user.role === 'owner' ? 'Upgrade your plan to unlock this feature' : NOT_ENABLED, 'UPGRADE_REQUIRED', { feature });
    }
    next();
});
/** The tenant id every institute-scoped query must be filtered by. */
export function tid(req) {
    if (!req.user.instituteId)
        throw new HttpError(403, 'No institute context');
    return req.user.instituteId;
}
/** Batches a teacher may work in: the ones they lead plus the ones they co-teach. */
export const teacherBatchFilter = (teacherId) => ({ $or: [{ teacherId }, { coTeacherIds: teacherId }] });
export const teachesBatch = (batch, userId) => String(batch.teacherId) === String(userId) || (batch.coTeacherIds ?? []).some((t) => String(t) === String(userId));
const scopeCache = new WeakMap();
/** For teachers: the ids of batches they teach. For owners: null (no restriction). Cached per request. */
export function scopedBatchIds(req) {
    if (req.user.role !== 'teacher')
        return Promise.resolve(null);
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
export async function assertBatchAccess(req, batchId) {
    const batch = await Batch.findOne({ _id: batchId, instituteId: tid(req) });
    if (!batch)
        throw new HttpError(404, 'Batch not found');
    if (req.user.role === 'teacher' && !teachesBatch(batch, req.user.id)) {
        throw new HttpError(403, 'This batch is not assigned to you');
    }
    return batch;
}
/** Loads a student of this institute; teachers may only reach students in their own batches. */
export async function assertStudentAccess(req, studentId) {
    const student = await Student.findOne({ _id: studentId, instituteId: tid(req) });
    if (!student)
        throw new HttpError(404, 'Student not found');
    const scoped = await scopedBatchIds(req);
    if (scoped && !student.batchIds.some((b) => scoped.some((s) => String(s) === String(b)))) {
        throw new HttpError(403, 'This student is not in your batches');
    }
    return student;
}
