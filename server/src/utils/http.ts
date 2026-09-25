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
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ message: `A record with this ${field} already exists` });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
}
