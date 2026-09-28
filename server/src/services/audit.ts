import type { Request } from 'express';
import { AuditLog } from '../models/index.js';

/**
 * Records who did what. Never blocks or fails the action being audited.
 *   audit(req, 'payment.void', 'Payment', id, 'CF/2026-27/0012 · ₹5,000 · wrong amount')
 */
export function audit(req: Request, action: string, entity: string, entityId?: unknown, detail?: string, instituteId?: unknown) {
  AuditLog.create({
    instituteId: instituteId ?? req.user?.instituteId,
    userId: req.user?.id,
    userName: req.user ? `${req.user.name} (${req.user.role})` : undefined,
    action,
    entity,
    entityId: entityId === undefined ? undefined : String(entityId),
    detail: detail?.slice(0, 300),
  }).catch((e) => console.error('[audit]', e?.message));
}
