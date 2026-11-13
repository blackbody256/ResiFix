import { Weekday } from '@prisma/client';
import type { AvailabilityWindow } from '@prisma/client';

const DAYS: Weekday[] = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

export function kampalaWeekday(date: Date): Weekday {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
  }).format(date);
  return DAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts)];
}

export function kampalaMinute(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

export function isAvailableAt(date: Date, windows: AvailabilityWindow[]): boolean {
  const weekday = kampalaWeekday(date);
  const minute = kampalaMinute(date);
  return windows.some(
    (window) =>
      window.weekday === weekday && window.startMinute <= minute && minute < window.endMinute,
  );
}
