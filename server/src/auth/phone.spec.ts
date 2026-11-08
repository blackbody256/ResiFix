import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['0700000001', '+256700000001'],
    ['0700 000 001', '+256700000001'],
    ['0700-000-001', '+256700000001'],
    ['256700000001', '+256700000001'],
    ['+256700000001', '+256700000001'],
    ['+256 700 000 001', '+256700000001'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(['', '0700', '07000000011', 'not a phone', '+12'])('rejects %j with a 400', (raw) => {
    expect(() => normalizePhone(raw)).toThrow(AppException);
    try {
      normalizePhone(raw);
    } catch (err) {
      expect((err as AppException).getStatus()).toBe(400);
    }
  });
});
