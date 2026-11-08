// Worker for ticket timers.
//   auto-close         (PB-021, OWNER: Selina): COMPLETED for 48h without resident action -> CLOSED
//   response-deadline  (response targets, PB-012): still not attended at dueAt -> audit + alert
//                      the assignee (or all custodians) and the admins (PB-024)
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { AuditService } from '../common/audit.service';
import { canTransition } from '../common/ticket-status';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { CustodianAlertsService } from '../notifications/custodian-alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES, TIMER_JOBS, type TicketTimerJob } from '../queue/queue.constants';

/** Statuses that still count as "not yet responded to". */
const AWAITING_RESPONSE: TicketStatus[] = [
  TicketStatus.REPORTED,
  TicketStatus.REVIEWED,
  TicketStatus.REOPENED,
];

@Processor(QUEUES.TICKET_TIMERS)
export class TicketTimersProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketTimersProcessor.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly alerts: CustodianAlertsService,
  ) {
    super();
  }

  async process(job: Job<TicketTimerJob>) {
    switch (job.name) {
      case TIMER_JOBS.AUTO_CLOSE:
        return this.autoClose(job.data.ticketId);
      case TIMER_JOBS.RESPONSE_DEADLINE:
        return this.responseDeadline(job.data.ticketId);
      default:
        throw new Error(`Unknown ticket timer job: ${job.name}`);
    }
  }

  private async autoClose(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.status !== TicketStatus.COMPLETED) return 'skipped';
    if (!canTransition(ticket.status, TicketStatus.CLOSED)) return 'skipped';

    const closed = await this.prisma.$transaction(async (tx) => {
      // Conditional update: a resident action that raced us wins.
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, status: TicketStatus.COMPLETED },
        data: { status: TicketStatus.CLOSED, closedAt: new Date() },
      });
      if (count === 0) return false;
      await this.audit.record(
        {
          propertyId: ticket.propertyId,
          ticketId,
          action: 'ticket.auto_closed',
          fromStatus: TicketStatus.COMPLETED,
          toStatus: TicketStatus.CLOSED,
          meta: { afterHours: this.config.worker.autoCloseHours },
        },
        tx,
      );
      return true;
    });
    if (!closed) return 'skipped';

    await this.notifications.notify({
      userId: ticket.reporterId,
      ticketId,
      title: 'Ticket closed',
      body: `No response within ${this.config.worker.autoCloseHours} hours, so the repair was marked as accepted.`,
    });
    this.logger.log(`Auto-closed ticket ${ticketId}`);
    return 'closed';
  }

  private async responseDeadline(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { visits: { where: { arrivedAt: { not: null } }, take: 1 } },
    });
    if (!ticket || !AWAITING_RESPONSE.includes(ticket.status) || ticket.visits.length) {
      return 'met';
    }

    await this.audit.record({
      propertyId: ticket.propertyId,
      ticketId,
      action: 'ticket.response_target_missed',
      meta: { dueAt: ticket.dueAt?.toISOString() ?? null, status: ticket.status },
    });
    await this.alerts.ticketBreached(ticketId);
    return 'missed';
  }
}
