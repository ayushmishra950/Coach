// Shared types. No Node.js types here, so `pure-upi/client`, `pure-upi/link` and `pure-upi/qr` type-check in
// browser projects that don't have @types/node installed.

// ---- QR ----

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrOptions {
  /** Error correction level. Default 'M' (~15% damage tolerated). */
  ecl?: ErrorCorrectionLevel | undefined;
  minVersion?: number | undefined;
  maxVersion?: number | undefined;
  /** Force a mask pattern 0-7. Default: the best one by the spec's penalty score. */
  mask?: number | undefined;
}

export interface QrMatrix {
  version: number;
  /** Modules per side (version * 4 + 17). */
  size: number;
  ecl: ErrorCorrectionLevel;
  mask: number;
  /** modules[y][x] === true means dark. */
  modules: boolean[][];
}

export interface QrSvgOptions extends QrOptions {
  /** Quiet zone in modules. Default 4. */
  border?: number | undefined;
  dark?: string | undefined;
  light?: string | undefined;
  /** Width/height attribute in px. Default: none (scales to its container). */
  size?: number | undefined;
  /** Accessible <title>. */
  title?: string | undefined;
}

// ---- UPI links ----

export interface UpiLinkParams {
  /** Payee UPI ID (VPA), e.g. "shop@okaxis". */
  upiId: string;
  /** Payee name shown in the UPI app. */
  name: string;
  /** Rupees; omit to let the payer enter it. At most 2 decimals. */
  amount?: number | string | undefined;
  /** Transaction note (tn), up to 50 characters. */
  note?: string | undefined;
  /** Transaction reference (tr). Merchant UPI IDs only; some apps reject it for personal IDs. */
  ref?: string | undefined;
  /** Merchant category code (mc), 4 digits. Merchant UPI IDs only. */
  merchantCode?: string | number | undefined;
}

export interface ParsedUpiLink {
  upiId: string;
  name?: string;
  currency?: string;
  amount?: string;
  note?: string;
  ref?: string;
  merchantCode?: string;
}

// ---- Orders ----

export type OrderStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface UpiOrder {
  id: string;
  userId: string;
  plan: string;
  /** The plan's name when the order was created. */
  planName?: string;
  /** Amount to pay, e.g. "99.07". */
  amount: string;
  amountPaise: number;
  status: OrderStatus;
  /** Epoch ms. */
  createdAt: number;
  /** Until this time (epoch ms) no other pending order gets the same amount. */
  holdUntil: number;
  utr?: string;
  submittedAt?: number;
  decidedAt?: number;
  decidedBy?: string;
  reason?: string;
  /** UTR the payer had entered, kept for reference after a rejection. */
  rejectedUtr?: string;
  meta?: unknown;
}

export interface PlanInput {
  /** Rupees. */
  price: number | string;
  name?: string | undefined;
  [extra: string]: unknown;
}

export interface Plan {
  id: string;
  name: string;
  /** "99.00" */
  price: string;
  [extra: string]: unknown;
}

export type PlansInput = Record<string, PlanInput | number | string>;

export interface ListFilter {
  status?: OrderStatus | undefined;
  userId?: string | undefined;
  /** Rupees, e.g. "99.07" - find the order behind a credit you see in your bank app. */
  amount?: number | string | undefined;
  /** Default 100, max 500. */
  limit?: number | string | undefined;
}

export interface StoreFilter {
  status?: OrderStatus;
  userId?: string;
  amountPaise?: number;
  limit?: number;
}

export interface UpiStore {
  insert(order: UpiOrder): Promise<UpiOrder>;
  get(id: string): Promise<UpiOrder | null>;
  /**
   * Atomically apply `patch` only if the order's status is in `fromStatuses`; return the updated order or null.
   * A patch value of `undefined` removes the field. A duplicate `utr` must throw UpiPayError('UTR_USED').
   */
  update(id: string, fromStatuses: OrderStatus[], patch: Partial<Record<keyof UpiOrder, unknown>>): Promise<UpiOrder | null>;
  list(filter: StoreFilter): Promise<UpiOrder[]>;
  /** Amounts (paise) in [min, max] of submitted orders and of pending orders whose hold has not ended. */
  reservedAmounts(minPaise: number, maxPaise: number, now: number): Promise<number[]>;
}

/** A setting given directly, or as a function read on every use (e.g. from your admin settings). */
export type Setting<T> = T | (() => T);

export interface UpiPayOptions {
  /** Your UPI ID (VPA). Only the format is checked: send yourself a ₹1 test first. A merchant/business UPI ID is recommended. */
  upiId: Setting<string>;
  /** Payee name shown in the UPI app. */
  name: Setting<string>;
  /**
   * e.g. { monthly: { price: 99, name: 'Monthly' }, yearly: 799 }, or a function returning them (may be async),
   * for plans kept in your database or admin panel.
   */
  plans: PlansInput | (() => PlansInput | Promise<PlansInput>);
  /** Default memoryStore() (lost on restart). */
  store?: UpiStore | undefined;
  /** Add 1-99 paise (paid by the buyer) so each pending order has a distinct amount. Default true; false charges the exact price. */
  uniqueAmount?: boolean | undefined;
  /** How long a pending order keeps its unique amount, ms. Default 30 minutes. */
  holdMs?: number | undefined;
  /** Note shown in the UPI app: "<notePrefix> <orderId>" (prefix shortened to fit 50 characters). Default "Order". */
  notePrefix?: Setting<string> | undefined;
  /** Your checks before an order is created (plan limits, an active subscription...). Throw to refuse. */
  beforeOrder?: ((input: { userId: string; plan: Plan; meta: unknown }) => unknown) | undefined;
  /** Runs after the UTR is saved, e.g. to alert you. Its errors go to onError, the payer still gets success. */
  onSubmitted?: ((order: UpiOrder) => unknown) | undefined;
  /** Grant the purchase here. If it throws, the approval is rolled back. */
  onApproved?: ((order: UpiOrder) => unknown) | undefined;
  onRejected?: ((order: UpiOrder) => unknown) | undefined;
  /**
   * Errors thrown by onSubmitted / onRejected (they run after the change is saved, so they don't fail the call).
   * Default console.error.
   */
  onError?: ((error: unknown) => void) | undefined;
  /** Clock, for tests. */
  now?: (() => number) | undefined;
}

export interface UpiPay {
  /** Current payee UPI ID (throws if it is not set up). */
  readonly upiId: string;
  /** Current payee name (throws if it is not set up). */
  readonly name: string;
  readonly store: UpiStore;
  plans(): Promise<Plan[]>;
  linkFor(order: UpiOrder): string;
  qrFor(order: UpiOrder, options?: QrSvgOptions): string;
  /** Returns the user's existing pending order for this plan while its hold lasts, otherwise a new one. */
  createOrder(input: { userId: string | number; plan: string; meta?: unknown }): Promise<{ order: UpiOrder; link: string }>;
  getOrder(orderId: string): Promise<UpiOrder>;
  submitUtr(input: { orderId: string; userId?: string | number | undefined; utr: string }): Promise<UpiOrder>;
  approve(orderId: string, options?: { utr?: string | undefined; by?: string | undefined }): Promise<UpiOrder>;
  reject(orderId: string, options?: { reason?: string | undefined; by?: string | undefined }): Promise<UpiOrder>;
  list(filter?: ListFilter): Promise<UpiOrder[]>;
}

export type UpiErrorCode =
  | 'INVALID_PLAN' | 'INVALID_UTR' | 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_STATE' | 'UTR_USED';
