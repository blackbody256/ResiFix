// PB-012: response targets from the database, and the clock that drives breach alerts.
// The maths lives in response-targets.ts.
import { Injectable } from '@nestjs/common';
import { type Prisma, TicketStatus } from '@prisma/client';
import type { PropertyScope } from '../common/property-scope';
import { PrismaService } from '../prisma/prisma.service';
import { TicketTimersService } from '../queue/ticket-timers.service';
import { pickTarget, PRIORITY_RANK, respondBy, type TargetRule } from './response-targets';

@Injectable()
export class ResponseTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timers: TicketTimersService,
  ) {}

  /** GET /custodian/targets: property-wide targets first, then per category; most urgent first. */
  async list(scope: PropertyScope) {
    const targets = await this.prisma.responseTarget.findMany({
      where: scope.where<Prisma.ResponseTargetWhereInput>(),
      include: { category: { select: { id: true, name: true } } },
    });
    return targets
      .sort(
        (a, b) =>
          (a.category?.name ?? '').localeCompare(b.category?.name ?? '') ||
          PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
      )
      .map(({ id, priority, category, respondWithinH, resolveWithinH }) => ({
        id,
        priority,
        category,
        respondWithinH,
        resolveWithinH,
      }));
  }

  /** Every target rule of a property, for pickTarget(). */
  rules(propertyId: string): Promise<TargetRule[]> {
    return this.prisma.responseTarget.findMany({
      where: { propertyId },
      select: { categoryId: true, priority: true, respondWithinH: true, resolveWithinH: true },
    });
  }

  /** When each of these tickets was last reopened, from the audit log. */
  async reopenedAt(ticketIds: string[]): Promise<Map<string, Date>> {
    if (!ticketIds.length) return new Map();
    const rows = await this.prisma.auditLog.groupBy({
      by: ['ticketId'],
      where: { ticketId: { in: ticketIds }, toStatus: TicketStatus.REOPENED },
      _max: { createdAt: true },
    });
    return new Map(
      rows
        .filter((r) => r.ticketId && r._max.createdAt)
        .map((r) => [r.ticketId as string, r._max.createdAt as Date]),
    );
  }

  /**
   * Start (or restart) a ticket's respond clock: set Ticket.dueAt from its target and schedule the
   * response-deadline alert for that time. Call it after the change is committed, when a ticket is
   * reported (PB-005), reviewed or reclassified (PB-014), or reopened (PB-020).
   * Returns the new dueAt, or null when no target applies (dueAt is then cleared).
   */
  async startClock(ticketId: string): Promise<Date | null> {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { faultItem: { select: { categoryId: true } } },
    });
    const rule = pickTarget(
      await this.rules(ticket.propertyId),
      ticket.faultItem.categoryId,
      ticket.priority,
    );

    const clockStart =
      ticket.status === TicketStatus.REOPENED
        ? ((await this.reopenedAt([ticket.id])).get(ticket.id) ?? new Date())
        : ticket.createdAt;
    const dueAt = rule ? respondBy(rule, clockStart) : null;

    await this.prisma.ticket.update({ where: { id: ticket.id }, data: { dueAt } });
    if (dueAt) await this.timers.scheduleResponseDeadline(ticket.id, dueAt);
    else await this.timers.cancelResponseDeadline(ticket.id);
    return dueAt;
  }
}
