// Shared ticket lifecycle: the seam between tickets, custodian, completion and the worker.
// Change by PR to Ann only (it is part of the shared API contract).
import { TicketStatus } from '@prisma/client';
import { conflict } from './app-exception';

const S = TicketStatus;

/** Allowed next states. Proposed for the MVP; owners refine via PR. */
export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  [S.REPORTED]: [S.REVIEWED, S.CLOSED],
  [S.REVIEWED]: [S.SCHEDULED, S.ASSIGNED, S.CLOSED],
  [S.SCHEDULED]: [S.ASSIGNED, S.IN_PROGRESS],
  [S.ASSIGNED]: [S.SCHEDULED, S.IN_PROGRESS],
  [S.IN_PROGRESS]: [S.COMPLETED],
  [S.COMPLETED]: [S.STUDENT_CONFIRMED, S.REOPENED, S.CLOSED],
  [S.STUDENT_CONFIRMED]: [S.CLOSED],
  [S.CLOSED]: [S.REOPENED],
  [S.REOPENED]: [S.REVIEWED, S.SCHEDULED, S.ASSIGNED],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransition(from, to)) throw conflict(`Ticket cannot move from ${from} to ${to}`);
}
