// PB-013: the custodian's prioritised work queue. Open tickets of the caller's property, most
// pressing first (least time left against the response target, then priority), with search and
// filters. Residents are identified by room, never by name or phone (business plan 8.4).
import { Injectable } from '@nestjs/common';
import { type Prisma, Priority, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { notFound } from '../common/app-exception';
import type { PropertyScope } from '../common/property-scope';
import { PrismaService } from '../prisma/prisma.service';
import { type ChangeRequest, openChangeRequests } from './change-requests';
import {
  OPEN_STATUSES,
  pickTarget,
  PRIORITY_RANK,
  type TargetRule,
  type TargetState,
  type TargetStatus,
  targetStatus,
} from './response-targets';
import { ResponseTargetsService } from './response-targets.service';

/** Statuses the queue can show: everything open, plus repairs waiting for the resident. */
const QUEUE_STATUSES = [
  TicketStatus.REPORTED,
  TicketStatus.REVIEWED,
  TicketStatus.REOPENED,
  TicketStatus.ASSIGNED,
  TicketStatus.SCHEDULED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.COMPLETED,
] as const;
const STATES = ['ON_TRACK', 'DUE_SOON', 'OVERDUE'] as const satisfies readonly TargetState[];

/** "a,b" -> ["a", "b"], each checked against `values`. */
const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));

export const QueueQuery = z.object({
  status: csv(QUEUE_STATUSES).optional(),
  priority: csv(Object.values(Priority) as [Priority, ...Priority[]]).optional(),
  /** ON_TRACK / DUE_SOON / OVERDUE against the response target. */
  state: csv(STATES).optional(),
  categoryId: z.string().min(1).optional(),
  blockId: z.string().min(1).optional(),
  /** "me", "unassigned" or a custodian's user id. */
  assignee: z.string().min(1).optional(),
  /** Words to find in the room, block, fault, category or description. */
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type QueueQuery = z.infer<typeof QueueQuery>;

/** What the custodian should do next. */
export type NextStep =
  | 'REVIEW' // confirm or correct the category (PB-014)
  | 'SCHEDULE' // agree a visit (PB-015)
  | 'VISIT' // a visit is booked: start work (PB-018) or record it missed (PB-017)
  | 'RESCHEDULE' // the last visit was missed, none is booked, or the resident asked to move it
  | 'COMPLETE' // work started: upload proof of repair (PB-019)
  | 'AWAIT_RESIDENT'; // repaired: waiting for the resident to confirm (PB-020)

const PERSON = { select: { id: true, name: true } } as const;

const QUEUE_INCLUDE = {
  room: { select: { id: true, number: true, block: { select: { id: true, name: true } } } },
  facility: { select: { id: true, name: true, location: true } },
  faultItem: {
    select: { id: true, name: true, category: { select: { id: true, name: true } } },
  },
  assignee: PERSON,
  visits: {
    orderBy: { scheduledAt: 'desc' },
    take: 5,
    select: {
      id: true,
      scheduledAt: true,
      arrivedAt: true,
      missed: true,
      custodian: PERSON,
    },
  },
  _count: { select: { photos: { where: { kind: 'REPORT' } } } },
} satisfies Prisma.TicketInclude;

type QueueRow = Prisma.TicketGetPayload<{ include: typeof QUEUE_INCLUDE }>;

export interface QueueItem {
  id: string;
  status: TicketStatus;
  priority: Priority;
  description: string | null;
  createdAt: Date;
  reopenCount: number;
  room: QueueRow['room'];
  facility: QueueRow['facility'];
  faultItem: QueueRow['faultItem'];
  assignee: { id: string; name: string } | null;
  photoCount: number;
  nextVisit: {
    id: string;
    scheduledAt: Date;
    custodian: { id: string; name: string };
    /** PB-016: the resident asked for another time and the visit has not been moved yet. */
    changeRequest: ChangeRequest | null;
  } | null;
  lastMissedVisit: { id: string; scheduledAt: Date } | null;
  target: TargetStatus | null;
  next: NextStep;
}

@Injectable()
export class WorkQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: ResponseTargetsService,
  ) {}

  async queue(user: AuthUser, scope: PropertyScope, query: QueueQuery) {
    const rows = await this.prisma.ticket.findMany({
      where: scope.where<Prisma.TicketWhereInput>(this.filters(user, query)),
      include: QUEUE_INCLUDE,
      take: 1000, // a pilot property has a few hundred rooms; this is a safety cap
    });

    let items = await this.toItems(rows, scope.propertyId);
    if (query.state) items = items.filter((i) => i.target && query.state!.includes(i.target.state));
    items.sort(byUrgency);

    return {
      tickets: items.slice(0, query.limit),
      summary: {
        total: items.length,
        overdue: items.filter((i) => i.target?.state === 'OVERDUE').length,
        dueSoon: items.filter((i) => i.target?.state === 'DUE_SOON').length,
        unassigned: items.filter((i) => !i.assignee && i.status !== TicketStatus.COMPLETED).length,
      },
    };
  }

  /** One ticket in queue form, e.g. to return after an action. 404 outside the caller's property. */
  async item(ticketId: string, scope: PropertyScope): Promise<QueueItem> {
    const row = await this.prisma.ticket.findFirst({
      where: scope.where<Prisma.TicketWhereInput>({ id: ticketId }),
      include: QUEUE_INCLUDE,
    });
    if (!row) throw notFound('Ticket not found');
    const [item] = await this.toItems([row], scope.propertyId);
    return item;
  }

  private filters(user: AuthUser, query: QueueQuery): Prisma.TicketWhereInput {
    const and: Prisma.TicketWhereInput[] = [
      { status: { in: query.status ?? [...OPEN_STATUSES] } },
      { duplicatesOf: { none: {} } },
    ];
    if (query.priority) and.push({ priority: { in: query.priority } });
    if (query.categoryId) and.push({ faultItem: { categoryId: query.categoryId } });
    if (query.blockId) and.push({ room: { blockId: query.blockId } });
    if (query.assignee === 'me') and.push({ assigneeId: user.id });
    else if (query.assignee === 'unassigned') and.push({ assigneeId: null });
    else if (query.assignee) and.push({ assigneeId: query.assignee });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { id: query.q },
          { description: contains },
          { room: { number: contains } },
          { room: { block: { name: contains } } },
          { facility: { name: contains } },
          { faultItem: { name: contains } },
          { faultItem: { category: { name: contains } } },
        ],
      });
    }
    return { AND: and };
  }

  private async toItems(rows: QueueRow[], propertyId: string): Promise<QueueItem[]> {
    const rules: TargetRule[] = await this.targets.rules(propertyId);
    // A reopened ticket's clock restarts at the reopen, whatever its status now.
    const reopened = await this.targets.reopenedAt(rows.map((r) => r.id));
    const requests = await openChangeRequests(
      this.prisma,
      rows.map((r) => r.id),
    );
    const now = new Date();

    return rows.map((row) => {
      const upcoming = row.visits
        .filter((v) => !v.arrivedAt && !v.missed)
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      const latest = row.visits[0];
      const nextVisit = upcoming[0] ?? null;
      const lastMissedVisit = latest?.missed ? latest : null;

      return {
        id: row.id,
        status: row.status,
        priority: row.priority,
        description: row.description,
        createdAt: row.createdAt,
        reopenCount: row.reopenCount,
        room: row.room,
        facility: row.facility,
        faultItem: row.faultItem,
        assignee: row.assignee,
        photoCount: row._count.photos,
        nextVisit: nextVisit && {
          id: nextVisit.id,
          scheduledAt: nextVisit.scheduledAt,
          custodian: nextVisit.custodian,
          changeRequest: requests.get(nextVisit.id) ?? null,
        },
        lastMissedVisit: lastMissedVisit && {
          id: lastMissedVisit.id,
          scheduledAt: lastMissedVisit.scheduledAt,
        },
        target: targetStatus(
          {
            status: row.status,
            clockStart: reopened.get(row.id) ?? row.createdAt,
            dueAt: row.dueAt,
            rule: pickTarget(rules, row.faultItem.category.id, row.priority),
          },
          now,
        ),
        next:
          nextVisit && requests.has(nextVisit.id)
            ? 'RESCHEDULE'
            : nextStep(row.status, Boolean(nextVisit)),
      };
    });
  }
}

export function nextStep(status: TicketStatus, hasUpcomingVisit: boolean): NextStep {
  switch (status) {
    case TicketStatus.REPORTED:
    case TicketStatus.REOPENED:
      return 'REVIEW';
    case TicketStatus.REVIEWED:
    case TicketStatus.ASSIGNED:
      return 'SCHEDULE';
    case TicketStatus.SCHEDULED:
      return hasUpcomingVisit ? 'VISIT' : 'RESCHEDULE';
    case TicketStatus.IN_PROGRESS:
      return hasUpcomingVisit ? 'VISIT' : 'COMPLETE';
    default:
      return 'AWAIT_RESIDENT';
  }
}

/**
 * Most pressing first: the earliest deadline (overdue tickets naturally lead), then the higher
 * priority, then the oldest report. Tickets without a target follow, by priority and age.
 */
export function byUrgency(a: QueueItem, b: QueueItem): number {
  const due = (i: QueueItem) => i.target?.dueAt.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    due(a) - due(b) ||
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}
