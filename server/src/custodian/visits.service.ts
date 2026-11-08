// Repair visits: PB-015 schedule. Same pattern as TicketActionsService: load in scope, check the
// lifecycle, conditional update + audit in one transaction, notify after the commit.
import { Injectable } from '@nestjs/common';
import { Role, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { conflict } from '../common/app-exception';
import { AuditService } from '../common/audit.service';
import type { PropertyScope } from '../common/property-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { fieldError } from './field-error';
import { kampalaTime } from './kampala-time';
import { MINUTE_MS } from './response-targets';
import {
  describeTicket,
  moveTicket,
  TicketActionsService,
  updateIfUnchanged,
} from './ticket-actions.service';
import { WorkQueueService } from './work-queue.service';

const S = TicketStatus;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Scheduling moves these to SCHEDULED. */
const SCHEDULABLE: readonly TicketStatus[] = [S.REVIEWED, S.ASSIGNED, S.REOPENED];
/** These keep their status: a new visit after a missed one, or a follow-up visit. */
const REVISITABLE: readonly TicketStatus[] = [S.SCHEDULED, S.IN_PROGRESS];

/** A visit can be booked from a few minutes ago (clock skew) to this far ahead. */
export const MAX_DAYS_AHEAD = 60;
const SKEW_MS = 5 * MINUTE_MS;

export const ScheduleBody = z.object({
  /** ISO 8601 with an offset, e.g. "2026-11-10T16:00:00+03:00". */
  scheduledAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  /** Who will visit. Defaults to the ticket's assignee, then to the caller if a custodian. */
  custodianId: z.string().min(1).optional(),
  notes: z.string().trim().min(1).max(300).optional(),
});
export type ScheduleBody = z.infer<typeof ScheduleBody>;

const VISIT_SELECT = {
  id: true,
  scheduledAt: true,
  arrivedAt: true,
  missed: true,
  notes: true,
  custodian: { select: { id: true, name: true } },
} as const;

/** A 400 field error unless `at` is between a few minutes ago and MAX_DAYS_AHEAD from now. */
export function checkVisitTime(at: Date, now = new Date()): void {
  if (at.getTime() < now.getTime() - SKEW_MS) {
    throw fieldError('scheduledAt', 'Must be in the future', 'Choose a time in the future');
  }
  if (at.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) {
    throw fieldError(
      'scheduledAt',
      `Must be within ${MAX_DAYS_AHEAD} days`,
      `Choose a time within ${MAX_DAYS_AHEAD} days`,
    );
  }
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly actions: TicketActionsService,
    private readonly queue: WorkQueueService,
  ) {}

  /**
   * PB-015: book a repair visit. REVIEWED / ASSIGNED / REOPENED -> SCHEDULED; a SCHEDULED or
   * IN_PROGRESS ticket gets another visit without changing status. One upcoming visit at a time:
   * move it with PB-016 instead of booking a second. The resident is told when to be in.
   */
  async schedule(ticketId: string, input: ScheduleBody, user: AuthUser, scope: PropertyScope) {
    const ticket = await this.actions.load(ticketId, scope);
    const toScheduled = SCHEDULABLE.includes(ticket.status);
    if (ticket.status === S.REPORTED) throw conflict('Review the ticket before booking a visit');
    if (!toScheduled && !REVISITABLE.includes(ticket.status)) {
      throw conflict(`A ${ticket.status} ticket cannot get a visit`);
    }
    checkVisitTime(input.scheduledAt);

    const upcoming = await this.prisma.visit.findFirst({
      where: { ticketId: ticket.id, arrivedAt: null, missed: false },
    });
    if (upcoming) {
      throw conflict(
        `A visit is already booked for ${kampalaTime(upcoming.scheduledAt)}. Move it instead.`,
      );
    }

    const custodianId =
      input.custodianId ??
      ticket.assigneeId ??
      (user.role === Role.CUSTODIAN ? user.id : undefined);
    if (!custodianId) {
      throw fieldError('custodianId', 'Required for this ticket', 'Choose who will visit');
    }
    const custodian = await this.actions.custodian(custodianId, scope, 'custodianId');

    // TODO(PB-008): once residents' availability is stored, refuse times outside it here.

    const visit = await this.prisma.$transaction(async (tx) => {
      const data = { assigneeId: ticket.assigneeId ?? custodian.id };
      if (toScheduled) await moveTicket(tx, ticket, S.SCHEDULED, data);
      else await updateIfUnchanged(tx, ticket, data);

      const created = await tx.visit.create({
        data: {
          ticketId: ticket.id,
          custodianId: custodian.id,
          scheduledAt: input.scheduledAt,
          notes: input.notes,
        },
        select: VISIT_SELECT,
      });
      await this.audit.record(
        {
          propertyId: ticket.propertyId,
          actorId: user.id,
          ticketId: ticket.id,
          action: 'visit.scheduled',
          ...(toScheduled ? { fromStatus: ticket.status, toStatus: S.SCHEDULED } : {}),
          meta: {
            visitId: created.id,
            scheduledAt: created.scheduledAt.toISOString(),
            custodianId: custodian.id,
          },
        },
        tx,
      );
      return created;
    });

    const when = kampalaTime(visit.scheduledAt);
    await this.notifications.notify({
      userId: ticket.reporterId,
      ticketId: ticket.id,
      title: 'Repair visit booked',
      body: `${describeTicket(ticket)}: ${when}. Please make sure someone can let the custodian in, or ask for another time.`,
    });
    if (custodian.id !== user.id) {
      await this.notifications.notify({
        userId: custodian.id,
        ticketId: ticket.id,
        title: 'Visit booked for you',
        body: `${describeTicket(ticket)}: ${when}.`,
      });
    }

    return { visit, ticket: await this.queue.item(ticket.id, scope) };
  }
}
