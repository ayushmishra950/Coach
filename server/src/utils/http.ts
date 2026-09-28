import type { NextFunction, Request, Response, RequestHandler } from 'express';
import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const oid = (id: unknown) => {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  return new mongoose.Types.ObjectId(id);
};

export function required<T extends Record<string, unknown>>(body: T, fields: (keyof T)[]) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new HttpError(400, `Missing required fields: ${missing.join(', ')}`);
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, code: err.code, ...err.extra });
  }
  if (err?.code === 11000) {
    // Compound indexes start with instituteId — name the field the user actually typed.
    const keys = Object.keys(err.keyValue || {}).filter((k) => k !== 'instituteId');
    const field = keys[0] || 'value';
    const label: Record<string, string> = { studentCode: 'student code', email: 'email', receiptNo: 'receipt number', key: 'key' };
    const val = err.keyValue?.[field];
    return res.status(409).json({ message: `A record with this ${label[field] ?? field}${typeof val === 'string' ? ` (${val})` : ''} already exists` });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'That upload is too large. Please split it into smaller parts.' });
  }
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.expose) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  // Log the error itself, never the request body (it can contain phone numbers, marks, passwords).
  console.error('[error]', err?.name, err?.message, err?.stack?.split('\n').slice(1, 4).join(' | '));
  res.status(500).json({ message: 'Something went wrong' });
}

/** A query-string / body value as a plain string (anything else → undefined). */
export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
