import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Res } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queue.constants';

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  /** GET /api/health -> { status, db, redis, time }. 503 when the database is down. */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 2000).then(ok, down),
      // Any queue read is a real Redis round-trip.
      withTimeout(this.queue.getJobCounts('waiting'), 1000).then(ok, down),
    ]);
    if (db !== 'ok') res.status(503);
    return {
      status: db === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      db,
      redis,
      time: new Date(),
    };
  }
}

const ok = () => 'ok' as const;
const down = () => 'down' as const;
