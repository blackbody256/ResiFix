// Custodian actions on a ticket (PB-013 assign, PB-014 review, and the stories that follow).
// Each action:
//   1. loads the ticket inside the caller's property (404 otherwise),
//   2. checks the lifecycle and moves the ticket with a conditional update, so when two people
//      act at once only one wins and the other gets a 409,
//   3. writes the audit row in the same transaction,
//   4. notifies the people affected after the commit.
import { Injectable } from '@nestjs/common';
import { type Prisma, Priority, Role, type Ticket, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { conflict, notFound } from '../common/app-exception';
import { AuditService } from '../common/audit.service';
import type { PropertyScope } from '../common/property-scope';
import { assertTransition } from '../common/ticket-status';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { fieldError } from './field-error';
import { AWAITING_RESPONSE } from './response-targets';
import { ResponseTargetsService } from './response-targets.service';
import { WorkQueueService } from './work-queue.service';

const S = TicketStatus;

/** Statuses where the ticket already has an owner and reassigning keeps the status. */
const REASSIGNABLE: readonly TicketStatus[] = [S.ASSIGNED, S.SCHEDULED, S.IN_PROGRESS];

/** A review moves these to REVIEWED. */
const NEEDS_REVIEW: readonly TicketStatus[] = [S.REPORTED, S.REOPENED];
/** Open and already reviewed: the category and priority can still be corrected. */
const RECLASSIFIABLE: readonly TicketStatus[] = [
  S.REVIEWED,
  S.ASSIGNED,
  S.SCHEDULED,
  S.IN_PROGRESS,
];

/** PB-014 body: every field optional; an empty body just confirms the report as it is. */
export const ReviewBody = z.object({
  faultItemId: z.string().min(1).optional(),
  priority: z.enum(Object.values(Priority) as [Priority, ...Priority[]]).optional(),
  /** What the custodian found, kept alongside the resident's original report. */
  note: z.string().trim().min(1).max(500).optional(),
});
export type ReviewBody = z.infer<typeof ReviewBody>;

export const TICKET_CONTEXT = {
  room: { select: { number: true, block: { select: { name: true } } } },
  faultItem: { select: { name: true } },
} satisfies Prisma.TicketInclude;

export type TicketWithContext = Prisma.TicketGetPayload<{ include: typeof TICKET_CONTEXT }>;

/** "Leaking tap, Block A 101": how notifications name a ticket. */
export function describeTicket(t: TicketWithContext): string {
  return `${t.faultItem.name}, ${t.room.block.name} ${t.room.number}`;
}

/**
 * Moves a ticket from the status we read to `to`, failing with 409 if that is not an allowed
 * transition or if someone else changed the ticket since we read it.
 */
export async function moveTicket(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, 'id' | 'status'>,
  to: TicketStatus,
  data: Prisma.TicketUncheckedUpdateManyInput = {},
): Promise<void> {
  assertTransition(ticket.status, to);
  await updateIfUnchanged(tx, ticket, { ...data, status: to });
}

/** Updates a ticket only if its status is still the one we read; 409 otherwise. */
export async function updateIfUnchanged(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, 'id' | 'status'>,
  data: Prisma.TicketUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.ticket.updateMany({
    where: { id: ticket.id, status: ticket.status },
    data,
  });
  if (count === 0) throw conflict('Someone else updated this ticket. Reload and try again.');
}

@Injectable()
export class TicketActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly queue: WorkQueueService,
    private readonly targets: ResponseTargetsService,
  ) {}

  /** Loads a ticket of the caller's property with what notifications need, or 404. */
  async load(ticketId: string, scope: PropertyScope): Promise<TicketWithContext> {
    const ticket = await this.prisma.ticket.findFirst({
      where: scope.where<Prisma.TicketWhereInput>({ id: ticketId }),
      include: TICKET_CONTEXT,
    });
    if (!ticket) throw notFound('Ticket not found');
    return ticket;
  }

  /** An active custodian of the caller's property, or a 400 field error. */
  async custodian(userId: string, scope: PropertyScope, field: string) {
    const custodian = await this.prisma.user.findFirst({
      where: scope.where<Prisma.UserWhereInput>({
        id: userId,
        role: Role.CUSTODIAN,
        isActive: true,
      }),
      select: { id: true, name: true },
    });
    if (!custodian) {
      throw fieldError(
        field,
        'Not an active custodian of this property',
        'Choose an active custodian of this property',
      );
    }
    return custodian;
  }

  /**
   * PB-013: give a ticket to a custodian. REVIEWED / REOPENED -> ASSIGNED; a ticket that is
   * already assigned, scheduled or in progress keeps its status, and its upcoming visits move to
   * the new custodian. A REPORTED ticket must be reviewed first.
   */
  async assign(ticketId: string, assigneeId: string, user: AuthUser, scope: PropertyScope) {
    const ticket = await this.load(ticketId, scope);
    const assignee = await this.custodian(assigneeId, scope, 'assigneeId');

    const reassign = REASSIGNABLE.includes(ticket.status);
    if (ticket.status === S.REPORTED) throw conflict('Review the ticket before assigning it');
    if (!reassign && ticket.status !== S.REVIEWED && ticket.status !== S.REOPENED) {
      throw conflict(`A ${ticket.status} ticket cannot be assigned`);
    }
    if (reassign && ticket.assigneeId === assignee.id) return this.queue.item(ticket.id, scope);

    await this.prisma.$transaction(async (tx) => {
      if (reassign) await updateIfUnchanged(tx, ticket, { assigneeId: assignee.id });
      else await moveTicket(tx, ticket, S.ASSIGNED, { assigneeId: assignee.id });

      await tx.visit.updateMany({
        where: { ticketId: ticket.id, arrivedAt: null, missed: false },
        data: { custodianId: assignee.id },
      });
      await this.audit.record(
        {
          propertyId: ticket.propertyId,
          actorId: user.id,
          ticketId: ticket.id,
          action: 'ticket.assigned',
          ...(reassign ? {} : { fromStatus: ticket.status, toStatus: S.ASSIGNED }),
          meta: { assigneeId: assignee.id, previousAssigneeId: ticket.assigneeId },
        },
        tx,
      );
    });

    if (assignee.id !== user.id) {
      await this.notifications.notify({
        userId: assignee.id,
        ticketId: ticket.id,
        title: 'Job assigned to you',
        body: `${describeTicket(ticket)} (${ticket.priority.toLowerCase()} priority).`,
      });
    }
    return this.queue.item(ticket.id, scope);
  }

  /**
   * PB-014: review a report and, if needed, correct its fault item and priority.
   * REPORTED / REOPENED -> REVIEWED. A ticket already reviewed (and still open) can be
   * reclassified without changing status. Choosing a different item takes that item's default
   * priority unless `priority` is given. The resident's description is never changed; the
   * custodian's `note` goes in the audit log next to it. While the ticket still awaits a
   * response, its respond clock restarts for the new category and priority.
   */
  async review(ticketId: string, input: ReviewBody, user: AuthUser, scope: PropertyScope) {
    const ticket = await this.load(ticketId, scope);
    const firstReview = NEEDS_REVIEW.includes(ticket.status);
    if (!firstReview && !RECLASSIFIABLE.includes(ticket.status)) {
      throw conflict(`A ${ticket.status} ticket can no longer be reviewed`);
    }

    const item = input.faultItemId
      ? await this.prisma.faultItem.findFirst({
          where: {
            id: input.faultItemId,
            isActive: true,
            category: { propertyId: scope.propertyId },
          },
          select: { id: true, name: true, defaultPriority: true },
        })
      : null;
    if (input.faultItemId && !item) {
      throw fieldError(
        'faultItemId',
        'Not an active fault item of this property',
        "Choose an active fault from this property's catalogue",
      );
    }

    const itemChanged = item !== null && item.id !== ticket.faultItemId;
    const priority = input.priority ?? (itemChanged ? item.defaultPriority : ticket.priority);
    const changes: Prisma.InputJsonObject = {
      ...(itemChanged && {
        faultItem: {
          from: { id: ticket.faultItemId, name: ticket.faultItem.name },
          to: { id: item.id, name: item.name },
        },
      }),
      ...(priority !== ticket.priority && { priority: { from: ticket.priority, to: priority } }),
    };
    if (!firstReview && !Object.keys(changes).length) {
      throw conflict('Already reviewed. Send a different faultItemId or priority to reclassify.');
    }

    await this.prisma.$transaction(async (tx) => {
      const data = { faultItemId: item?.id ?? ticket.faultItemId, priority };
      if (firstReview) await moveTicket(tx, ticket, S.REVIEWED, data);
      else await updateIfUnchanged(tx, ticket, data);
      await this.audit.record(
        {
          propertyId: ticket.propertyId,
          actorId: user.id,
          ticketId: ticket.id,
          action: firstReview ? 'ticket.reviewed' : 'ticket.reclassified',
          ...(firstReview ? { fromStatus: ticket.status, toStatus: S.REVIEWED } : {}),
          meta: { ...changes, ...(input.note && { note: input.note }) },
        },
        tx,
      );
    });

    const status = firstReview ? S.REVIEWED : ticket.status;
    if (AWAITING_RESPONSE.includes(status)) await this.targets.startClock(ticket.id);
    return this.queue.item(ticket.id, scope);
  }
}
