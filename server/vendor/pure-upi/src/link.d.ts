import type { ParsedUpiLink, UpiLinkParams } from './types.js';

export type { UpiLinkParams, ParsedUpiLink } from './types.js';

export function upiLink(params: UpiLinkParams): string;
export function parseUpiLink(link: string): ParsedUpiLink;
export function isValidVpa(vpa: unknown): boolean;
/** 12-digit UPI transaction reference (spaces ignored). */
export function isValidUtr(utr: unknown): boolean;
export function normalizeUtr(utr: string): string;
/** Rupees -> integer paise. Throws RangeError for invalid amounts. */
export function toPaise(amount: number | string): number;
/** Integer paise -> "99.07". */
export function formatPaise(paise: number): string;
