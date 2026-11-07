import { badRequest } from '../common/app-exception';

/** Normalise Ugandan numbers to E.164: "0700 000 001" -> "+256700000001". */
export function normalizePhone(raw: string): string {
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (/^\+\d{9,15}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^256\d{9}$/.test(digits)) return `+${digits}`;
  throw badRequest('Enter a valid phone number, e.g. 0700 000 001');
}
