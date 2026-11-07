// SMS gateway seam. Not wired to a provider yet (Africa's Talking or similar — see PB-001).
import { logger } from './logger.js';

export async function sendSms(phone, message) {
  logger.info('SMS (not sent: no provider configured)', { phone, message });
}
