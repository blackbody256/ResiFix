// PB-024: custodian alerts for new, breached and reopened tickets. OWNER: Andrew
// Delivered like every notification: in-app, Web Push, SMS fallback.
//
//   ticketReported(id)  after a resident reports a fault (PB-005)       -> the property's custodians
//   ticketBreached(id)  when the response target passes (response-deadline job)
//                                                     -> the assignee (or all custodians) + admins
//   ticketReopened(id)  after a resident says it is still broken (PB-020) -> the assignee + admins
//
// Only active users of the ticket's own property are alerted. Nobody gets the same alert twice.
import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { describeTicket, TICKET_CONTEXT } from '../custodian/ticket-context';
import { kampalaTime } from '../custodian/kampala-time';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class CustodianAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A new report: every active custodian of the property, or its admins if it has none. */
  async ticketReported(ticketId: string) {
    const ticket = await this.ticket(ticketId);
    let to = await this.staff(ticket.propertyId, Role.CUSTODIAN);
    if (!to.length) to = await this.staff(ticket.propertyId, Role.ADMIN);
    const due = ticket.dueAt ? ` Respond by ${kampalaTime(ticket.dueAt)}.` : '';
    return this.send(to, ticketId, {
      title: 'New fault reported',
      body: `${describeTicket(ticket)} (${ticket.priority.toLowerCase()} priority).${due}`,
    });
  }

  /** The response target passed: whoever owns the ticket (or all custodians), plus the admins. */
  async ticketBreached(ticketId: string) {
    const ticket = await this.ticket(ticketId);
    const owners = (await this.activeAssignee(ticket.assigneeId)) ?? [
      ...(await this.staff(ticket.propertyId, Role.CUSTODIAN)),
    ];
    const admins = await this.staff(ticket.propertyId, Role.ADMIN);
    const late = ticket.dueAt
      ? ` It was due ${kampalaTime(ticket.dueAt)} (${Math.max(
          1,
          Math.round((Date.now() - ticket.dueAt.getTime()) / HOUR_MS),
        )} h ago).`
      : '';
    return this.send([...owners, ...admins], ticketId, {
      title: 'Response target missed',
      body: `${describeTicket(ticket)} has not been responded to.${late}`,
    });
  }

  /** The resident says the repair did not work: whoever did it (or all custodians), plus admins. */
  async ticketReopened(ticketId: string) {
    const ticket = await this.ticket(ticketId);
    const owners = (await this.activeAssignee(ticket.assigneeId)) ?? [
      ...(await this.staff(ticket.propertyId, Role.CUSTODIAN)),
    ];
    const admins = await this.staff(ticket.propertyId, Role.ADMIN);
    return this.send([...owners, ...admins], ticketId, {
      title: 'Ticket reopened',
      body: `${describeTicket(ticket)}: the resident says the problem is not fixed.`,
    });
  }

  private ticket(id: string) {
    return this.prisma.ticket.findUniqueOrThrow({ where: { id }, include: TICKET_CONTEXT });
  }

  private async staff(propertyId: string, role: Role): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { propertyId, role, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /** [assigneeId] while that custodian is still active, else null. */
  private async activeAssignee(assigneeId: string | null): Promise<string[] | null> {
    if (!assigneeId) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, isActive: true },
      select: { id: true },
    });
    return user ? [user.id] : null;
  }

  private async send(
    userIds: string[],
    ticketId: string,
    message: { title: string; body: string },
  ) {
    const unique = [...new Set(userIds)];
    await this.notifications.notifyMany(unique, { ticketId, ...message });
    return unique;
  }
}
