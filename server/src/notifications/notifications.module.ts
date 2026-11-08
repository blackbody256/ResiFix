// OWNER: Ayan (PB-023) / Andrew (PB-024)
// Web Push (VAPID) with Africa's Talking SMS fallback. Delivery runs in the worker.
import { Module } from '@nestjs/common';
import { CustodianAlertsService } from './custodian-alerts.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms.service';
import { WebPushService } from './web-push.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliveryService,
    SmsService,
    WebPushService,
    CustodianAlertsService, // PB-024
  ],
  exports: [NotificationsService, NotificationDeliveryService, SmsService, CustodianAlertsService],
})
export class NotificationsModule {}
