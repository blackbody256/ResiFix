// Producer for ticket timers. Feature modules call these; the worker runs the jobs.
//   - scheduleResponseDeadline: when an admin reviews a ticket (PB-011), using ResponseTarget
//   - scheduleAutoClose: when a ticket reaches COMPLETED (PB-018)  -> closes after 48h (PB-021)
//   - cancelAutoClose: when the resident confirms or disputes (PB-019)
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { QUEUES, TIMER_JOBS, type TicketTimerJob } from './queue.constants';

const HOUR = 60 * 60 * 1000;

@Injectable()
export class TicketTimersService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectQueue(QUEUES.TICKET_TIMERS) private readonly queue: Queue<TicketTimerJob>,
  ) {}

  scheduleResponseDeadline(ticketId: string, dueAt: Date) {
    return this.schedule(TIMER_JOBS.RESPONSE_DEADLINE, ticketId, dueAt.getTime() - Date.now());
  }

  scheduleAutoClose(ticketId: string) {
    return this.schedule(TIMER_JOBS.AUTO_CLOSE, ticketId, this.config.worker.autoCloseHours * HOUR);
  }

  cancelResponseDeadline(ticketId: string) {
    return this.queue.remove(jobId(TIMER_JOBS.RESPONSE_DEADLINE, ticketId));
  }

  cancelAutoClose(ticketId: string) {
    return this.queue.remove(jobId(TIMER_JOBS.AUTO_CLOSE, ticketId));
  }

  /** One pending timer per ticket and kind: re-scheduling replaces the old one. */
  private async schedule(name: string, ticketId: string, delayMs: number) {
    const id = jobId(name, ticketId);
    await this.queue.remove(id);
    return this.queue.add(
      name,
      { ticketId },
      {
        jobId: id,
        delay: Math.max(0, delayMs),
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  }
}

const jobId = (name: string, ticketId: string) => `${name}-${ticketId}`;
