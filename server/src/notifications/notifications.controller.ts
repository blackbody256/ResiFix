// OWNER: Ayan (PB-023) / Andrew (PB-024)
// Web Push subscription management and the caller's in-app notification list.
import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';

const SubscribeBody = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const UnsubscribeBody = z.object({ endpoint: z.url() });

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: WebPushService,
  ) {}

  /** GET /api/notifications -> latest 50 for the caller */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { notifications };
  }

  /** GET /api/notifications/push/public-key -> { publicKey } (null when push is disabled) */
  @Public()
  @Get('push/public-key')
  publicKey() {
    return { publicKey: this.push.publicKey };
  }

  /** POST /api/notifications/push/subscriptions  (body = PushSubscription.toJSON()) */
  @Post('push/subscriptions')
  @HttpCode(201)
  async subscribe(
    @Body(new ZodValidationPipe(SubscribeBody)) body: z.infer<typeof SubscribeBody>,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const data = {
      userId: user.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.get('user-agent')?.slice(0, 255),
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { ...data, endpoint: body.endpoint },
      update: data,
    });
    return { subscribed: true };
  }

  /** DELETE /api/notifications/push/subscriptions { endpoint } */
  @Delete('push/subscriptions')
  async unsubscribe(
    @Body(new ZodValidationPipe(UnsubscribeBody)) body: z.infer<typeof UnsubscribeBody>,
    @CurrentUser() user: AuthUser,
  ) {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: user.id },
    });
    return { subscribed: false };
  }
}
