// PB-012: response targets and breach flags. Pure functions, unit-tested in
// response-targets.spec.ts; ResponseTargetsService feeds them from the database.
//
// Every open ticket runs one of two clocks, both measured from when it was reported (or last
// reopened):
//   RESPOND  until a custodian acts on it (assigns, schedules or starts work), target respondWithinH
//   RESOLVE  from then until the repair is done (COMPLETED),               target resolveWithinH
// "Acted on" is the same rule the response-deadline job uses to decide whether to alert, so the
// work queue and the alerts never disagree.
import { Priority, TicketStatus } from '@prisma/client';

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Statuses still waiting for a custodian to act. */
export const AWAITING_RESPONSE: readonly TicketStatus[] = [
  TicketStatus.REPORTED,
  TicketStatus.REVIEWED,
  TicketStatus.REOPENED,
];

/** Open statuses after the custodian acted, waiting for the repair. */
export const AWAITING_REPAIR: readonly TicketStatus[] = [
  TicketStatus.ASSIGNED,
  TicketStatus.SCHEDULED,
  TicketStatus.IN_PROGRESS,
];

/** Statuses that belong in the custodian's work queue. */
export const OPEN_STATUSES: readonly TicketStatus[] = [...AWAITING_RESPONSE, ...AWAITING_REPAIR];

/** Higher is more urgent. */
export const PRIORITY_RANK: Readonly<Record<Priority, number>> = {
  [Priority.URGENT]: 4,
  [Priority.HIGH]: 3,
  [Priority.MEDIUM]: 2,
  [Priority.LOW]: 1,
};

/** A ticket counts as due soon in the last quarter of its target window. */
export const DUE_SOON_FRACTION = 0.25;

export interface TargetRule {
  categoryId: string | null;
  priority: Priority;
  respondWithinH: number;
  resolveWithinH: number;
}

/** The category's own target for this priority if it has one, else the property-wide target. */
export function pickTarget(
  rules: readonly TargetRule[],
  categoryId: string,
  priority: Priority,
): TargetRule | undefined {
  return (
    rules.find((r) => r.categoryId === categoryId && r.priority === priority) ??
    rules.find((r) => r.categoryId === null && r.priority === priority)
  );
}

/** Respond-by time for a ticket reported (or reopened) at `clockStart`. */
export function respondBy(rule: TargetRule, clockStart: Date): Date {
  return new Date(clockStart.getTime() + rule.respondWithinH * HOUR_MS);
}

export type TargetState = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

export interface TargetStatus {
  /** Which clock is running. */
  clock: 'RESPOND' | 'RESOLVE';
  respondBy: Date;
  resolveBy: Date;
  /** Deadline of the running clock. */
  dueAt: Date;
  state: TargetState;
  /** Minutes until `dueAt`; negative once overdue. */
  minutesLeft: number;
}

export interface TargetInput {
  status: TicketStatus;
  /** When the ticket was reported, or last reopened. */
  clockStart: Date;
  /** Ticket.dueAt: the respond-by time set at review. Wins over the computed one when present. */
  dueAt?: Date | null;
  rule: TargetRule | undefined;
}

/** Where an open ticket stands against its target; null when closed or no target applies. */
export function targetStatus(input: TargetInput, now: Date = new Date()): TargetStatus | null {
  const { status, clockStart, rule } = input;
  if (!rule || !OPEN_STATUSES.includes(status)) return null;

  const respond = input.dueAt ?? respondBy(rule, clockStart);
  const resolve = new Date(clockStart.getTime() + rule.resolveWithinH * HOUR_MS);
  const clock = AWAITING_RESPONSE.includes(status) ? 'RESPOND' : 'RESOLVE';
  const dueAt = clock === 'RESPOND' ? respond : resolve;

  const left = dueAt.getTime() - now.getTime();
  const window = Math.max(dueAt.getTime() - clockStart.getTime(), MINUTE_MS);
  const state: TargetState =
    left < 0 ? 'OVERDUE' : left <= window * DUE_SOON_FRACTION ? 'DUE_SOON' : 'ON_TRACK';

  return {
    clock,
    respondBy: respond,
    resolveBy: resolve,
    dueAt,
    state,
    minutesLeft: Math.floor(left / MINUTE_MS),
  };
}
