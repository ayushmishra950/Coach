import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UpiErrorCode, UpiPay, UpiPayOptions, UpiStore } from './types.js';

export type {
  ErrorCorrectionLevel, QrOptions, QrMatrix, QrSvgOptions, UpiLinkParams, ParsedUpiLink, OrderStatus, UpiOrder, PlanInput, Plan,
  PlansInput, ListFilter, StoreFilter, UpiStore, Setting, UpiPayOptions, UpiPay, UpiErrorCode,
} from './types.js';
export { upiLink, parseUpiLink, isValidVpa, isValidUtr, normalizeUtr, toPaise, formatPaise } from './link.js';
export { qrMatrix, qrSvg, qrDataUrl } from './qr.js';

// ---- Orders ----

export function memoryStore(): UpiStore;
export function mongoStore(collection: unknown): UpiStore & { init(): Promise<void> };

export function createUpiPay(options: UpiPayOptions): UpiPay;

export class UpiPayError extends Error {
  constructor(code: UpiErrorCode, message: string);
  readonly code: UpiErrorCode;
  /** HTTP status for this error. */
  readonly status: number;
}

// ---- HTTP ----

export interface UpiHandlerOptions<Req = IncomingMessage> {
  /**
   * Logged-in user's id (or an object with id / _id), or null/undefined when logged out.
   * Throw an error with a 4xx `status` (e.g. your HttpError(403, ...)) to refuse with that status and message.
   */
  getUser(req: Req): unknown;
  /** True if this request may list/approve/reject orders. */
  isAdmin(req: Req): boolean | Promise<boolean>;
  /** Path prefix to strip when not mounted with app.use(path, ...), e.g. '/api/upi'. */
  basePath?: string | undefined;
  /** Include qrSvg in order responses. Default true. */
  qr?: boolean | undefined;
  /** Called for unexpected (500) errors. Default console.error. */
  onError?: ((error: unknown) => void) | undefined;
}

export function upiHandler<Req extends IncomingMessage = IncomingMessage>(
  pay: UpiPay,
  options: UpiHandlerOptions<Req>,
): (req: Req, res: ServerResponse, next?: (err?: unknown) => void) => Promise<void>;
