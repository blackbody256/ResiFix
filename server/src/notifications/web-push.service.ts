// Web Push (VAPID). Generate keys with `npm run vapid:generate -w server` and put them in .env.
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PushSubscription } from '@prisma/client';
import webpush from 'web-push';
import { APP_CONFIG, type AppConfig } from '../config/config';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  ticketId?: string;
}

export type PushResult = 'sent' | 'gone' | 'failed';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const vapid = config.webPush;
    if (vapid) webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    else this.logger.warn('VAPID keys not set; Web Push disabled (SMS fallback only)');
  }

  get publicKey() {
    return this.config.webPush?.publicKey ?? null;
  }

  async send(sub: PushSubscription, payload: PushPayload): Promise<PushResult> {
    if (!this.config.webPush) return 'failed';
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      );
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone'; // subscription expired/unsubscribed
      this.logger.warn(`Push failed (${status ?? 'network'}): ${(err as Error).message}`);
      return 'failed';
    }
  }
}
