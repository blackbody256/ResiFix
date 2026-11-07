import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, notFound, tooManyRequests, unauthorized } from '../../lib/httpError.js';
import { logger } from '../../lib/logger.js';
import { sendSms } from '../../lib/sms.js';
import { recordAudit } from '../../lib/audit.js';

const hash = (code) => createHash('sha256').update(code).digest('hex');

/** Normalise Ugandan numbers to E.164: "0700 000 001" -> "+256700000001". */
export function normalizePhone(raw) {
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (/^\+\d{9,15}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^256\d{9}$/.test(digits)) return `+${digits}`;
  throw badRequest('Enter a valid phone number, e.g. 0700 000 001');
}

export async function requestOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);

  // TODO(PB-001): self-registration for residents. For now only seeded/admin-created users log in.
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user?.isActive) throw notFound('This phone number is not registered');

  const code = config.otp.devCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + config.otp.ttlSeconds * 1000),
    },
  });

  if (config.otp.devCode) {
    logger.info(`DEV OTP for ${phone}: ${code}`);
  } else {
    await sendSms(phone, `Your ResiFix code is ${code}. It expires in 5 minutes.`);
  }
  return { phone, expiresInSeconds: config.otp.ttlSeconds };
}

export async function verifyOtp(rawPhone, code) {
  const phone = normalizePhone(rawPhone);
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw unauthorized('Code expired or not requested. Request a new code.');
  if (challenge.attempts >= config.otp.maxAttempts) {
    throw tooManyRequests('Too many attempts. Request a new code.');
  }

  const ok = timingSafeEqual(Buffer.from(hash(String(code))), Buffer.from(challenge.codeHash));
  if (!ok) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw unauthorized('Incorrect code');
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, propertyId: true, phone: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw unauthorized('Account not found or inactive');

  await recordAudit({ propertyId: user.propertyId, actorId: user.id, action: 'auth.login' });

  const token = jwt.sign(
    { sub: user.id, role: user.role, propertyId: user.propertyId },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
    },
  );
  const { isActive: _isActive, ...publicUser } = user;
  return { token, user: publicUser };
}
