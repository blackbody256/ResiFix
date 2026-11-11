// PB-002: limits how often a code can be requested, so nobody can run up SMS costs or probe which
// numbers are registered. Fixed-window counters in Redis, one per phone and one per client IP.
// OWNER: Ann.
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppException, tooManyRequests } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { redisConnectionFromUrl } from '../queue/queue.constants';

const PREFIX = 'resifix:otp-limit';

@Injectable()
export class OtpRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(OtpRateLimitService.name);
  private readonly redis: Redis;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.redis = new Redis({
      ...redisConnectionFromUrl(config.redis.url),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  /**
   * Counts one code request for `ip` and `phone` and throws 429 TOO_MANY_REQUESTS when either is
   * over its limit. The IP is checked first, and a request it blocks is not counted against the
   * phone, so one noisy network cannot lock a resident out for the whole window.
   */
  async assertAllowed(phone: string, ip: string | undefined) {
    const { perPhone, perIp, windowSeconds } = this.config.otp.requestLimit;
    try {
      if (ip) await this.hit(`ip:${ip}`, perIp, windowSeconds);
      await this.hit(`phone:${phone}`, perPhone, windowSeconds);
    } catch (error) {
      if (error instanceof AppException) throw error;
      // Redis down: let the login through rather than lock everyone out, and say so in the log.
      this.logger.error(`OTP rate limit skipped, Redis unavailable: ${String(error)}`);
    }
  }

  private async hit(key: string, limit: number, windowSeconds: number) {
    const fullKey = `${PREFIX}:${key}`;
    // SET NX starts the window on the first request only; later requests just count.
    const result = await this.redis
      .multi()
      .set(fullKey, 0, 'EX', windowSeconds, 'NX')
      .incr(fullKey)
      .ttl(fullKey)
      .exec();
    if (!result) throw new Error('Redis transaction aborted');
    const [, [countError, count], [, ttl]] = result;
    if (countError) throw countError;
    if ((count as number) > limit) {
      const retryAfterSeconds = Math.max(1, ttl as number);
      throw tooManyRequests('Too many code requests. Try again later.', { retryAfterSeconds });
    }
  }
}
