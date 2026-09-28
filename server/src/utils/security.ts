import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http.js';

export const PASSWORD_MIN = 8;

/** Password rules used everywhere a password is set. */
export function assertPassword(p: unknown, label = 'Password') {
  if (typeof p !== 'string') throw new HttpError(400, `${label} is required`);
  if (p.length < PASSWORD_MIN) throw new HttpError(400, `${label} must be at least ${PASSWORD_MIN} characters`);
  if (p.length > 128) throw new HttpError(400, `${label} is too long`);
  return p;
}

/** Random password that is easy to read out / type: 12 chars, no look-alike characters. */
export function generatePassword(len = 12) {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

/** A person's display name: trimmed, 1–80 characters. */
export function cleanName(v: unknown, label = 'Name') {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${label} is required`);
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > 80) throw new HttpError(400, `${label} is too long (max 80 characters)`);
  return s;
}

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RX = /^\+?[0-9][0-9\s-]{6,16}$/;
export const HEX_COLOR_RX = /^#[0-9a-f]{6}$/i;

/** Optional string field: '' / null → undefined; otherwise a trimmed string (max length). */
export function optStr(v: unknown, max = 200) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, 'Invalid value');
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
}

/** Masks a phone / email for logs: 98******10, pr***@gmail.com */
export function maskContact(v: string | undefined) {
  if (!v) return '-';
  if (v.includes('@')) {
    const [u, d] = v.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  const digits = v.replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 2)}${'*'.repeat(digits.length - 4)}${digits.slice(-2)}` : '****';
}

/** Basic hardening headers (no extra dependency needed). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // The API only ever returns JSON; the built React app gets a strict policy of its own.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (_req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * Small fixed-window rate limiter kept in memory. Good for a single server; move the
 * counters to Redis if you run several API instances.
 */
export function createLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60_000);
  sweep.unref();

  /** Returns seconds to wait when the key is over the limit, otherwise 0. */
  return function hit(key: string) {
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return 0;
    }
    cur.count++;
    return cur.count > opts.max ? Math.ceil((cur.resetAt - now) / 1000) : 0;
  };
}

/** Express middleware wrapper around createLimiter. */
export function rateLimit(opts: { windowMs: number; max: number; message: string; key?: (req: Request) => string }) {
  const hit = createLimiter(opts);
  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key ? opts.key(req) : req.ip || 'unknown';
    const wait = hit(key);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return next(new HttpError(429, opts.message));
    }
    next();
  };
}

/** Escapes user text before it is used inside a RegExp. */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Locks a key (e.g. ip + email) after `max` failures inside `windowMs`. Successful logins
 * reset it, so normal use — including the demo buttons — is never blocked.
 */
export function createFailureGuard(opts: { windowMs: number; max: number }) {
  const fails = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of fails) if (v.resetAt <= now) fails.delete(k);
  }, 60_000);
  sweep.unref();
  return {
    /** Seconds to wait, or 0 when allowed. */
    check(key: string) {
      const f = fails.get(key);
      if (!f || f.resetAt <= Date.now()) return 0;
      return f.count >= opts.max ? Math.ceil((f.resetAt - Date.now()) / 1000) : 0;
    },
    fail(key: string) {
      const now = Date.now();
      const f = fails.get(key);
      if (!f || f.resetAt <= now) fails.set(key, { count: 1, resetAt: now + opts.windowMs });
      else f.count++;
    },
    reset(key: string) {
      fails.delete(key);
    },
  };
}

/**
 * Gzips JSON API responses over 2 KB (reports, lists, exports shrink 5–10×) using Node's
 * built-in zlib — no extra dependency. Skipped when the client doesn't accept gzip.
 */
export function compressJson(req: Request, res: Response, next: NextFunction) {
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) return next();
  const original = res.json.bind(res);
  res.json = (body?: unknown) => {
    const text = JSON.stringify(body);
    if (text === undefined || text.length < 2048 || res.headersSent) return original(body);
    zlib.gzip(text, { level: 6 }, (err, buf) => {
      if (res.headersSent) return; // an error handler already replied
      if (err) return void original(body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    });
    return res;
  };
  next();
}

/**
 * Query strings are parsed flat: every value is a plain string (first one wins). This stops
 * `?status[$ne]=x` from turning into a MongoDB operator and arrays from crashing handlers.
 */
export function flatQueryParser(qs: string) {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs)) if (!(k in out)) out[k] = v;
  return out;
}
