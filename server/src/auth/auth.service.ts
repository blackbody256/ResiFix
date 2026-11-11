// Phone + OTP login, ported from the Express scaffold. OWNER: Ann (PB-001, PB-002).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { notFound, tooManyRequests, unauthorized } from '../common/app-exception';
import { SmsService } from '../notifications/sms.service';
import { AUTH_USER_SELECT, type AuthUser } from './auth-user';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { normalizePhone } from './phone';

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

export interface JwtPayload {
  sub: string;
  role: AuthUser['role'];
  propertyId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly rateLimit: OtpRateLimitService,
  ) {}

  async requestOtp(rawPhone: string, ip?: string) {
    const phone = normalizePhone(rawPhone);
    // Before the user lookup, so unregistered numbers count too and cannot be probed freely.
    await this.rateLimit.assertAllowed(phone, ip);

    // TODO(PB-001): resident self-registration. For now only seeded/admin-created users log in.
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user?.isActive) throw notFound('This phone number is not registered');

    const { devCode, ttlSeconds } = this.config.otp;
    const code = devCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpChallenge.create({
      data: { phone, codeHash: hash(code), expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
    });

    if (devCode) {
      this.logger.warn(`DEV OTP for ${phone}: ${code}`);
    } else {
      await this.sms.send(phone, `Your ResiFix code is ${code}. It expires in 5 minutes.`);
    }
    return { phone, expiresInSeconds: ttlSeconds };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw unauthorized('Code expired or not requested. Request a new code.');
    if (challenge.attempts >= this.config.otp.maxAttempts) {
      throw tooManyRequests('Too many attempts. Request a new code.');
    }

    const ok = timingSafeEqual(Buffer.from(hash(code)), Buffer.from(challenge.codeHash));
    if (!ok) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw unauthorized('Incorrect code');
    }
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const found = await this.prisma.user.findUnique({ where: { phone }, select: AUTH_USER_SELECT });
    if (!found?.isActive) throw unauthorized('Account not found or inactive');
    const { isActive: _isActive, ...user } = found;

    await this.audit.record({
      propertyId: user.propertyId,
      actorId: user.id,
      action: 'auth.login',
    });

    const payload: JwtPayload = { sub: user.id, role: user.role, propertyId: user.propertyId };
    return { token: await this.jwt.signAsync(payload), user };
  }
}
