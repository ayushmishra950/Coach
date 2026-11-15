import type { QrMatrix, QrOptions, QrSvgOptions } from './types.js';

export type { ErrorCorrectionLevel, QrOptions, QrMatrix, QrSvgOptions } from './types.js';

export function qrMatrix(text: string, options?: QrOptions): QrMatrix;
export function qrSvg(text: string, options?: QrSvgOptions): string;
export function qrDataUrl(text: string, options?: QrSvgOptions): string;
