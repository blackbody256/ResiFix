// PB-016: open "please come another time" requests, read from the audit log. A request is open
// while it is the latest thing that happened to its visit; booking or moving the visit answers it.
// The audit log is the record anyway (the ticket timeline shows it), so no extra table is needed.
import type { Prisma, PrismaClient } from '@prisma/client';

export const VISIT_EVENTS = {
  SCHEDULED: 'visit.scheduled',
  CHANGE_REQUESTED: 'visit.change_requested',
  RESCHEDULED: 'visit.rescheduled',
  MISSED: 'visit.missed',
  ARRIVED: 'visit.arrived',
} as const;

export interface ChangeRequest {
  message: string;
  requestedAt: Date;
}

type Db = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

/** Open change requests for visits of these tickets, keyed by visit id. */
export async function openChangeRequests(
  db: Db,
  ticketIds: string[],
): Promise<Map<string, ChangeRequest>> {
  if (!ticketIds.length) return new Map();
  const events = await db.auditLog.findMany({
    where: { ticketId: { in: ticketIds }, action: { in: Object.values(VISIT_EVENTS) } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, meta: true, createdAt: true },
  });

  const open = new Map<string, ChangeRequest>();
  for (const event of events) {
    const meta = (event.meta ?? {}) as { visitId?: string; message?: string };
    if (!meta.visitId) continue;
    if (event.action === VISIT_EVENTS.CHANGE_REQUESTED) {
      open.set(meta.visitId, { message: meta.message ?? '', requestedAt: event.createdAt });
    } else {
      open.delete(meta.visitId);
    }
  }
  return open;
}
