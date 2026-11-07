// Append-only audit trail. Pass a transaction client (`tx`) when inside $transaction.
import { prisma } from '../db.js';

export function recordAudit(
  { propertyId, actorId, ticketId, action, fromStatus, toStatus, meta },
  db = prisma,
) {
  return db.auditLog.create({
    data: { propertyId, actorId, ticketId, action, fromStatus, toStatus, meta },
  });
}
