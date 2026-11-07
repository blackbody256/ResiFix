// Producer side: feature modules call notify(); the worker delivers it.
//   await notifications.notify({ userId, ticketId, title: 'Repair scheduled', body: '...' })
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES, type DeliverNotificationJob } from '../queue/queue.constants';

export interface NotifyInput {
  userId: string;
  title: string;
  body: string;
  ticketId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue<DeliverNotificationJob>,
  ) {}

  /** Stores an in-app notification and queues Web Push delivery (SMS fallback). */
  async notify({ userId, title, body, ticketId }: NotifyInput) {
    const notification = await this.prisma.notification.create({
      data: { userId, ticketId, message: `${title}: ${body}` },
    });
    await this.queue.add(
      'deliver',
      { notificationId: notification.id, title, body },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000 },
    );
    return notification;
  }

  async notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>) {
    return Promise.all(userIds.map((userId) => this.notify({ ...input, userId })));
  }
}
