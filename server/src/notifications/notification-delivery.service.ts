// Consumer side, called by the worker: Web Push to every device the user subscribed,
// falling back to Africa's Talking SMS when no push gets through (PB-023, PB-024).
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';
import { WebPushService } from './web-push.service';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: WebPushService,
    private readonly sms: SmsService,
  ) {}

  async deliver(notificationId: string, title: string, body: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: { include: { pushSubscriptions: true } } },
    });
    if (!notification || notification.sentAt) return 'skipped';

    const { user } = notification;
    let pushed = false;
    for (const sub of user.pushSubscriptions) {
      const result = await this.push.send(sub, {
        title,
        body,
        ticketId: notification.ticketId ?? undefined,
        url: notification.ticketId ? `/tickets?focus=${notification.ticketId}` : '/',
      });
      if (result === 'sent') pushed = true;
      if (result === 'gone') await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
    }

    if (pushed) return this.markSent(notificationId, NotificationChannel.PUSH);

    if (this.sms.isConfigured) {
      // Throws on transport errors so BullMQ retries with backoff.
      const ok = await this.sms.send(user.phone, `ResiFix: ${title}. ${body}`);
      if (ok) return this.markSent(notificationId, NotificationChannel.SMS);
    }

    this.logger.log(`Notification ${notificationId} left in-app only (no push, no SMS)`);
    return 'in-app';
  }

  private async markSent(id: string, channel: NotificationChannel) {
    await this.prisma.notification.update({ where: { id }, data: { channel, sentAt: new Date() } });
    return channel;
  }
}
