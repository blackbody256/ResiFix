import { describe, expect, it } from 'vitest';
import { TicketStatus } from '@prisma/client';
import { AppException } from './app-exception';
import { assertTransition, canTransition, TRANSITIONS } from './ticket-status';

const S = TicketStatus;
const ALL = Object.values(TicketStatus);

describe('ticket lifecycle', () => {
  it('defines next states for every status', () => {
    for (const status of ALL) expect(TRANSITIONS[status]).toBeDefined();
  });

  it('only allows moves to real statuses and never to the same status', () => {
    for (const [from, next] of Object.entries(TRANSITIONS)) {
      for (const to of next) {
        expect(ALL).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });

  it.each([
    [S.REPORTED, S.REVIEWED],
    [S.REVIEWED, S.SCHEDULED],
    [S.SCHEDULED, S.IN_PROGRESS],
    [S.IN_PROGRESS, S.COMPLETED],
    [S.COMPLETED, S.STUDENT_CONFIRMED],
    [S.COMPLETED, S.REOPENED],
    [S.COMPLETED, S.CLOSED],
    [S.CLOSED, S.REOPENED],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    [S.REPORTED, S.IN_PROGRESS], // must be reviewed first
    [S.REPORTED, S.COMPLETED],
    [S.IN_PROGRESS, S.CLOSED], // completion needs proof, not a shortcut
    [S.STUDENT_CONFIRMED, S.REOPENED],
    [S.CLOSED, S.COMPLETED],
  ])('rejects %s -> %s with a 409', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    try {
      assertTransition(from, to);
      throw new Error('expected assertTransition to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).getStatus()).toBe(409);
      expect((err as AppException).code).toBe('CONFLICT');
    }
  });
});
