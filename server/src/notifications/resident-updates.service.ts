// PB-023: student notifications on ticket updates. OWNER: Ayan
// Delivered like every notification: in-app, Web Push, SMS fallback.
//
// Already sent elsewhere, so NOT repeated here:
//   visit booked / moved / missed, repair started  -> custodian VisitsService (PB-015..PB-018)
//   ticket closed automatically after 48 h          -> ticket-timers worker (PB-021)
//
// The updates below are the ones the resident would otherwise never hear about:
//   ticketReviewed(id)   after a custodian first reviews the report (PB-014)
//   ticketAssigned(id)   after a custodian is assigned or the job changes hands (PB-013)
//   repairCompleted(id)  after the custodian submits proof of repair (PB-019)
//
// Only the resident who reported the ticket is told, and only while their account is active.
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { describeTicket, TICKET_CONTEXT } from '../custodian/ticket-context';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class ResidentUpdatesService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The report has been looked at: the resident knows it is being handled. */
  async ticketReviewed(ticketId: string) {
    const ticket = await this.ticket(ticketId);
    return this.tell(ticket, {
      title: 'Report reviewed',
      body: `${describeTicket(ticket)}: your report has been reviewed and a repair is being arranged.`,
    });
  }

  /** A custodian now owns the job (first assignment or a hand-over). */
  async ticketAssigned(ticketId: string) {
    const ticket = await this.ticket(ticketId);
    const who = ticket.assignee?.name ?? 'A custodian';
    return this.tell(ticket, {
      title: 'Custodian assigned',
      body: `${describeTicket(ticket)}: ${who} will handle the repair.`,
    });
  }

  /** The repair is done: ask the resident to confirm before the auto-close (PB-021). */
  async repairCompleted(ticketId: string) {
    const ticket = await this.ticket(ticketId);
    const hours = this.config.worker.autoCloseHours;
    return this.tell(ticket, {
      title: 'Repair finished',
      body: `${describeTicket(ticket)}: please confirm it is fixed, or tell us it is not, within ${hours} hours.`,
    });
  }

  private ticket(id: string) {
    return this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: {
        ...TICKET_CONTEXT,
        reporter: { select: { id: true, isActive: true } },
        assignee: { select: { name: true } },
      },
    });
  }

  /** Returns the ids told (empty when the reporter's account is inactive). */
  private async tell(
    ticket: { id: string; reporter: { id: string; isActive: boolean } },
    message: { title: string; body: string },
  ): Promise<string[]> {
    if (!ticket.reporter.isActive) return [];
    await this.notifications.notify({
      userId: ticket.reporter.id,
      ticketId: ticket.id,
      ...message,
    });
    const followers = await this.prisma.duplicateLink.findMany({
      where: { canonicalId: ticket.id },
      select: { ticketId: true, linkedBy: { select: { id: true, isActive: true } } },
    });
    await Promise.all(
      followers
        .filter((follower) => follower.linkedBy.isActive)
        .map((follower) =>
          this.notifications.notify({
            userId: follower.linkedBy.id,
            ticketId: follower.ticketId,
            title: message.title,
            body: `The shared repair you follow was updated: ${message.body}`,
          }),
        ),
    );
    return [ticket.reporter.id, ...followers.filter((follower) => follower.linkedBy.isActive).map((follower) => follower.linkedBy.id)];
  }
}
