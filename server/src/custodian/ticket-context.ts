// How messages name a ticket ("Leaking tap, Block A 101"). Plain data and a pure function, so the
// notifications module can use it without importing the custodian services.
import type { Prisma } from '@prisma/client';

export const TICKET_CONTEXT = {
  room: { select: { number: true, block: { select: { name: true } } } },
  facility: { select: { name: true, location: true } },
  faultItem: { select: { name: true } },
} satisfies Prisma.TicketInclude;

export type TicketWithContext = Prisma.TicketGetPayload<{ include: typeof TICKET_CONTEXT }>;

/** "Leaking tap, Block A 101" */
export function describeTicket(t: TicketWithContext): string {
  const location = t.room ? `${t.room.block.name} ${t.room.number}` : t.facility?.location ?? t.facility?.name ?? 'shared facility';
  return `${t.faultItem.name}, ${location}`;
}
