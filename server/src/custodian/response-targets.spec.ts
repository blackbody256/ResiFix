import { describe, expect, it } from 'vitest';
import { Priority, TicketStatus } from '@prisma/client';
import { HOUR_MS, pickTarget, respondBy, type TargetRule, targetStatus } from './response-targets';

const S = TicketStatus;
const RULES: TargetRule[] = [
  { categoryId: null, priority: Priority.URGENT, respondWithinH: 2, resolveWithinH: 24 },
  { categoryId: null, priority: Priority.HIGH, respondWithinH: 12, resolveWithinH: 48 },
  { categoryId: 'electrical', priority: Priority.HIGH, respondWithinH: 4, resolveWithinH: 24 },
];
const urgent = RULES[0];
const high = RULES[1];

const T0 = new Date('2026-11-10T08:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR_MS);

describe('pickTarget', () => {
  it("prefers the category's own target", () => {
    expect(pickTarget(RULES, 'electrical', Priority.HIGH)?.respondWithinH).toBe(4);
  });

  it('falls back to the property-wide target for the priority', () => {
    expect(pickTarget(RULES, 'plumbing', Priority.HIGH)).toBe(high);
    expect(pickTarget(RULES, 'electrical', Priority.URGENT)).toBe(urgent);
  });

  it('returns undefined when no target covers the priority', () => {
    expect(pickTarget(RULES, 'plumbing', Priority.LOW)).toBeUndefined();
  });
});

describe('respondBy', () => {
  it('adds the respond window to the clock start', () => {
    expect(respondBy(urgent, T0)).toEqual(at(2));
  });
});

describe('targetStatus', () => {
  const status = (s: TicketStatus, hoursLater: number, extra: { dueAt?: Date } = {}) =>
    targetStatus({ status: s, clockStart: T0, rule: high, ...extra }, at(hoursLater));

  it('runs the respond clock until someone acts on the ticket', () => {
    for (const s of [S.REPORTED, S.REVIEWED, S.REOPENED]) {
      expect(status(s, 1)).toMatchObject({ clock: 'RESPOND', dueAt: at(12), state: 'ON_TRACK' });
    }
  });

  it('runs the resolve clock once the ticket is assigned, scheduled or in progress', () => {
    for (const s of [S.ASSIGNED, S.SCHEDULED, S.IN_PROGRESS]) {
      expect(status(s, 1)).toMatchObject({ clock: 'RESOLVE', dueAt: at(48), state: 'ON_TRACK' });
    }
  });

  it('is DUE_SOON in the last quarter of the window and OVERDUE after it', () => {
    expect(status(S.REPORTED, 8.9)?.state).toBe('ON_TRACK'); // 3.1 h of 12 left
    expect(status(S.REPORTED, 9)?.state).toBe('DUE_SOON'); // exactly 3 h left
    expect(status(S.REPORTED, 11.99)?.state).toBe('DUE_SOON');
    expect(status(S.REPORTED, 12.5)).toMatchObject({ state: 'OVERDUE', minutesLeft: -30 });
  });

  it('uses the respond-by time set at review when there is one', () => {
    expect(status(S.REVIEWED, 1, { dueAt: at(3) })).toMatchObject({
      dueAt: at(3),
      respondBy: at(3),
      resolveBy: at(48),
    });
  });

  it('reports minutes left', () => {
    expect(status(S.SCHEDULED, 47)?.minutesLeft).toBe(60);
  });

  it('has nothing to say about finished tickets or tickets without a target', () => {
    for (const s of [S.COMPLETED, S.STUDENT_CONFIRMED, S.CLOSED]) expect(status(s, 1)).toBeNull();
    expect(targetStatus({ status: S.REPORTED, clockStart: T0, rule: undefined })).toBeNull();
  });
});
