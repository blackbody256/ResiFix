// OWNER: Ayan (PB-023) / Andrew (PB-024)
// Web Push subscription management and the caller's in-app notification inbox (PB-023).
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { notFound } from '../common/app-exception';
import { CurrentUser, Public } from '../common/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';

const SubscribeBody = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const UnsubscribeBody = z.object({ endpoint: z.url() });

const NOTIFICATION_SELECT = {
  id: true,
  ticketId: true,
  message: true,
  channel: true,
  sentAt: true,
  readAt: true,
  createdAt: true,
} as const;

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: WebPushService,
  ) {}

  /** GET /api/notifications -> latest 50 for the caller, plus how many are unread in total */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const [notifications, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { notifications, unread };
  }

  /** PB-023: POST /api/notifications/read-all -> { updated } */
  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  /** PB-023: POST /api/notifications/:id/read -> { notification }. 404 unless it is the caller's. */
  @Post(':id/read')
  @HttpCode(200)
  async read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const own = { id, userId: user.id };
    // Only stamp the first read; reading again keeps the original time.
    await this.prisma.notification.updateMany({
      where: { ...own, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await this.prisma.notification.findFirst({
      where: own,
      select: NOTIFICATION_SELECT,
    });
    if (!notification) throw notFound('Notification not found');
    return { notification };
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
