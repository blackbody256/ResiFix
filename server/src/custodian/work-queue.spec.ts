import { describe, expect, it } from 'vitest';
import { Priority, TicketStatus } from '@prisma/client';
import type { TargetStatus } from './response-targets';
import { byUrgency, nextStep, type QueueItem } from './work-queue.service';

const S = TicketStatus;

describe('nextStep', () => {
  it.each([
    [S.REPORTED, false, 'REVIEW'],
    [S.REOPENED, false, 'REVIEW'],
    [S.REVIEWED, false, 'SCHEDULE'],
    [S.ASSIGNED, false, 'SCHEDULE'],
    [S.SCHEDULED, true, 'VISIT'],
    [S.SCHEDULED, false, 'RESCHEDULE'],
    [S.IN_PROGRESS, true, 'VISIT'],
    [S.IN_PROGRESS, false, 'COMPLETE'],
    [S.COMPLETED, false, 'AWAIT_RESIDENT'],
  ] as const)('%s (upcoming visit: %s) -> %s', (status, upcoming, step) => {
    expect(nextStep(status, upcoming)).toBe(step);
  });
});

describe('byUrgency', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 10, h));
  const item = (id: string, priority: Priority, due: Date | null, created = at(0)) =>
    ({
      id,
      priority,
      createdAt: created,
      target: due ? ({ dueAt: due } as TargetStatus) : null,
    }) as QueueItem;
  const order = (...items: QueueItem[]) => items.sort(byUrgency).map((i) => i.id);

  it('puts the earliest deadline first, so overdue tickets lead', () => {
    expect(
      order(item('later', Priority.URGENT, at(9)), item('sooner', Priority.LOW, at(5))),
    ).toEqual(['sooner', 'later']);
  });

  it('breaks ties on priority, then on the oldest report', () => {
    expect(
      order(
        item('medium', Priority.MEDIUM, at(5)),
        item('high-new', Priority.HIGH, at(5), at(2)),
        item('high-old', Priority.HIGH, at(5), at(1)),
      ),
    ).toEqual(['high-old', 'high-new', 'medium']);
  });

  it('puts tickets without a target after the rest, by priority', () => {
    expect(
      order(
        item('no-target-low', Priority.LOW, null),
        item('no-target-urgent', Priority.URGENT, null),
        item('target', Priority.LOW, at(20)),
      ),
    ).toEqual(['target', 'no-target-urgent', 'no-target-low']);
  });
});
