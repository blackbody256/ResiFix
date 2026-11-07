export const QUEUES = {
  TICKET_TIMERS: 'ticket-timers',
  NOTIFICATIONS: 'notifications',
} as const;

export const TIMER_JOBS = {
  RESPONSE_DEADLINE: 'response-deadline',
  AUTO_CLOSE: 'auto-close',
} as const;

export interface TicketTimerJob {
  ticketId: string;
}

export interface DeliverNotificationJob {
  notificationId: string;
  title: string;
  body: string;
}

/** BullMQ wants ioredis options, not a URL. */
export function redisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}
