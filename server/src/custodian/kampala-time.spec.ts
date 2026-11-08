import { describe, expect, it } from 'vitest';
import { kampalaTime } from './kampala-time';

describe('kampalaTime', () => {
  it('shows UTC instants in Kampala time (UTC+3)', () => {
    expect(kampalaTime(new Date('2026-11-10T13:00:00Z'))).toBe('Tue 10 Nov, 4:00 pm');
    expect(kampalaTime(new Date('2026-11-10T06:30:00Z'))).toBe('Tue 10 Nov, 9:30 am');
  });

  it('rolls over to the next day after 9 pm UTC', () => {
    expect(kampalaTime(new Date('2026-11-10T22:15:00Z'))).toBe('Wed 11 Nov, 1:15 am');
  });

  it('uses only plain spaces, which every SMS gateway handles', () => {
    expect(kampalaTime(new Date('2026-11-10T13:00:00Z'))).toMatch(/^[\x20-\x7e]+$/);
  });
});
