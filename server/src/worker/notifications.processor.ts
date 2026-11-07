// Worker for notification delivery (Web Push, SMS fallback). OWNER: Ayan (PB-023) / Andrew (PB-024)
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { QUEUES, type DeliverNotificationJob } from '../queue/queue.constants';

@Processor(QUEUES.NOTIFICATIONS, { concurrency: 5 })
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly delivery: NotificationDeliveryService) {
    super();
  }

  process(job: Job<DeliverNotificationJob>) {
    const { notificationId, title, body } = job.data;
    return this.delivery.deliver(notificationId, title, body);
  }
}
