// Shared ticket lifecycle — the seam between tickets, custodian and completion.
// Change by PR to Ann only (it is part of the shared API contract).
import { conflict } from './httpError.js';

export const TicketStatus = Object.freeze({
  REPORTED: 'REPORTED',
  REVIEWED: 'REVIEWED',
  SCHEDULED: 'SCHEDULED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  STUDENT_CONFIRMED: 'STUDENT_CONFIRMED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
});

const S = TicketStatus;

/** Allowed next states. Proposed for the MVP; owners should refine via PR. */
export const TRANSITIONS = Object.freeze({
  [S.REPORTED]: [S.REVIEWED, S.CLOSED],
  [S.REVIEWED]: [S.SCHEDULED, S.ASSIGNED, S.CLOSED],
  [S.SCHEDULED]: [S.ASSIGNED, S.IN_PROGRESS],
  [S.ASSIGNED]: [S.SCHEDULED, S.IN_PROGRESS],
  [S.IN_PROGRESS]: [S.COMPLETED],
  [S.COMPLETED]: [S.STUDENT_CONFIRMED, S.REOPENED, S.CLOSED],
  [S.STUDENT_CONFIRMED]: [S.CLOSED],
  [S.CLOSED]: [S.REOPENED],
  [S.REOPENED]: [S.REVIEWED, S.SCHEDULED, S.ASSIGNED],
});

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) throw conflict(`Ticket cannot move from ${from} to ${to}`);
}
