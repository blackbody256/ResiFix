import { describe, expect, it } from 'vitest';
import { Weekday } from '@prisma/client';
import { isAvailableAt, kampalaMinute, kampalaWeekday } from './availability';

describe('resident availability', () => {
  it('uses Kampala weekday and minute at the Sunday boundary', () => {
    const sunday = new Date('2026-11-08T21:00:00.000Z'); // 00:00 Monday in Kampala
    expect(kampalaWeekday(sunday)).toBe(Weekday.MON);
    expect(kampalaMinute(sunday)).toBe(0);
  });

  it('treats the end minute as exclusive', () => {
    const windows = [{
      id: 'w',
      userId: 'u',
      weekday: Weekday.TUE,
      startMinute: 600,
      endMinute: 1440,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
    expect(isAvailableAt(new Date('2026-11-10T07:00:00.000Z'), windows)).toBe(true);
    expect(isAvailableAt(new Date('2026-11-10T21:00:00.000Z'), windows)).toBe(false);
  });
});
