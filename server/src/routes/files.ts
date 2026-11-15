import express, { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { allow, auth, tid } from '../middleware/auth.js';
import { Material, Student } from '../models/index.js';
import { MAX_UPLOAD, saveFile, sendFile } from '../services/files.js';
import { HttpError, ah, oid } from '../utils/http.js';
import { rateLimit } from '../utils/security.js';

/**
 * POST /api/files            raw body upload (owner / teacher). Headers: Content-Type, X-File-Name.
 *                            ?public=1 (owner only) for website photos.
 * GET  /api/files/:id        logged-in users of the same institute (parents: only material of their children's batches).
 */
const r = Router();

r.post(
  '/',
  auth,
  allow('owner', 'teacher'),
  rateLimit({ windowMs: 60 * 60_000, max: 120, message: 'Too many uploads in the last hour. Please try again later.', key: (req) => `upload:${String(req.user.id)}` }),
  express.raw({ type: () => true, limit: MAX_UPLOAD }),
  ah(async (req, res) => {
    const isPublic = req.query.public === '1';
    if (isPublic && req.user.role !== 'owner') throw new HttpError(403, 'Only the owner can upload website photos');
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'file'));
    const mime = String(req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (isPublic && !mime.startsWith('image/')) throw new HttpError(400, 'Website photos must be images (JPG, PNG or WebP)');
    const body = req.body as Buffer;
    const saved = await saveFile(Buffer.isBuffer(body) ? body : Buffer.alloc(0), name, mime, {
      instituteId: tid(req), uploadedBy: req.user.id, public: isPublic, purpose: isPublic ? 'website' : 'material',
    });
    res.status(201).json(saved);
  }),
);

/** Parents may open only material shared with their children's batches. */
async function assertCanRead(req: Request, id: ReturnType<typeof oid>) {
  const instituteId = tid(req);
  if (req.user.role === 'parent') {
    const students = await Student.find({ _id: { $in: req.user.studentIds }, instituteId }).select('batchIds').lean();
    const ok = await Material.exists({ instituteId, fileId: id, batchIds: { $in: students.flatMap((s) => s.batchIds) } });
    if (!ok) throw new HttpError(404, 'File not found');
  }
  return instituteId;
}

r.get(
  '/:id',
  auth,
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const instituteId = await assertCanRead(req, id);
    await sendFile(res, id, (m) => String(m.instituteId) === String(instituteId), req.query.download === '1');
  }),
);

/**
 * Mobile app: a 10-minute link that opens the file in the phone's browser / PDF viewer
 * (which can't send the login header).
 */
r.post(
  '/:id/link',
  auth,
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const instituteId = await assertCanRead(req, id);
    const token = jwt.sign({ p: 'file', fid: String(id), inst: String(instituteId) }, config.jwtSecret, { expiresIn: 600, algorithm: 'HS256' });
    res.json({ url: `${req.protocol}://${req.get('host')}/api/public/files/signed/${token}` });
  }),
);

export default r;

/** Public (no login) — website photos only. Mounted under /api/public/files. */
export const publicFiles = Router().get(
  '/signed/:token',
  ah(async (req, res) => {
    let t: { p?: string; fid: string; inst: string };
    try {
      t = jwt.verify(req.params.token, config.jwtSecret, { algorithms: ['HS256'] }) as typeof t;
      if (t.p !== 'file') throw new Error('wrong token');
    } catch {
      throw new HttpError(401, 'This link has expired. Open the file again from the app.');
    }
    await sendFile(res, oid(t.fid), (m) => String(m.instituteId) === t.inst);
  }),
).get(
  '/:id',
  ah(async (req, res) => {
    await sendFile(res, oid(req.params.id), (m) => !!m.public);
  }),
);
