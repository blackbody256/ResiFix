// Africa's Talking SMS. Used for OTP codes and as the fallback when Web Push fails (PB-024).
// Unconfigured (no AT_USERNAME / AT_API_KEY): messages are logged instead of sent.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';

interface AtResponse {
  SMSMessageData?: { Recipients?: { status: string; statusCode: number; number: string }[] };
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get isConfigured() {
    return this.config.sms !== null;
  }

  /** Returns true if Africa's Talking accepted the message. Throws on transport errors. */
  async send(to: string, message: string): Promise<boolean> {
    const sms = this.config.sms;
    if (!sms) {
      this.logger.log(`SMS not sent (Africa's Talking not configured) to=${to}: ${message}`);
      return false;
    }

    const host = sms.sandbox ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const body = new URLSearchParams({ username: sms.username, to, message });
    if (sms.senderId) body.set('from', sms.senderId);

    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey: sms.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) throw new Error(`Africa's Talking HTTP ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as AtResponse;
    const recipient = data.SMSMessageData?.Recipients?.[0];
    if (recipient?.status !== 'Success') {
      this.logger.warn(`SMS to ${to} rejected: ${recipient?.status ?? 'no recipient in response'}`);
      return false;
    }
    return true;
  }
}
