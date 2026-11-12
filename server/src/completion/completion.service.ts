import { Injectable } from '@nestjs/common';
import { PhotoKind, Priority, Role, TicketStatus, type Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { badRequest, conflict, forbidden, notFound } from '../common/app-exception';
import { AuditService } from '../common/audit.service';
import type { PropertyScope } from '../common/property-scope';
import { assertTransition } from '../common/ticket-status';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketTimersService } from '../queue/ticket-timers.service';
import { StorageService } from '../storage/storage.service';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const RepairProofBody = z.object({
  notes: z.string().trim().min(1).max(1000),
});
export type RepairProofBody = z.infer<typeof RepairProofBody>;

type StatsInput = { from?: string; to?: string };

type Duration = { minutes: number; withinTarget: boolean };
type FaultCount = {
  id: string;
  name: string;
  group: string | null;
  reports: number;
  lastReportedAt: Date;
};

type RoomFaultCount = {
  id: string;
  room: string;
  block: string;
  faultItem: string;
  category: string;
  reports: number;
  lastReportedAt: Date;
};

const PRIORITIES: Priority[] = [Priority.URGENT, Priority.HIGH, Priority.MEDIUM, Priority.LOW];
const KAMPALA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kampala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

@Injectable()
export class CompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly timers: TicketTimersService,
    private readonly notifications: NotificationsService,
  ) {}

  async repairProof(
    ticketId: string,
    file: Express.Multer.File | undefined,
    input: RepairProofBody,
    user: AuthUser,
    scope: PropertyScope,
  ) {
    if (!file) throw badRequest('Attach a repair-proof image in the "photo" field');
    if (file.size > MAX_PROOF_BYTES) throw badRequest('Photos must be 5 MB or smaller');
    const ext = PHOTO_TYPES[file.mimetype];
    if (!ext) throw badRequest('Photos must be JPEG, PNG or WebP');

    const ticket = await this.prisma.ticket.findFirst({
      where: scope.where<Prisma.TicketWhereInput>({ id: ticketId }),
      select: {
        id: true,
        propertyId: true,
        reporterId: true,
        assigneeId: true,
        status: true,
      },
    });
    if (!ticket) throw notFound('Ticket not found');
    if (ticket.status !== TicketStatus.IN_PROGRESS) {
      throw conflict(`A ${ticket.status} ticket cannot receive repair proof`);
    }
    if (user.role === Role.CUSTODIAN && ticket.assigneeId !== user.id) {
      throw forbidden('Only the assigned custodian can submit repair proof');
    }

    const key = this.storage.photoKey(scope.propertyId, ticket.id, ext);
    await this.storage.put(key, file.buffer, file.mimetype);

    let proof: Awaited<ReturnType<CompletionService['createProof']>>;
    try {
      proof = await this.createProof(ticket, key, input.notes, user.id);
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }

    await this.timers.scheduleAutoClose(ticket.id);
    await this.notifications.notify({
      userId: ticket.reporterId,
      ticketId: ticket.id,
      title: 'Repair finished',
      body: 'The repair is complete. Please confirm whether the problem is fixed.',
    });
    return { proof };
  }

  async stats(input: StatsInput, scope: PropertyScope) {
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;
    if (from && to && from >= to) throw badRequest('The from date must be before the to date');

    const [tickets, targets] = await Promise.all([
      this.prisma.ticket.findMany({
        where: scope.where<Prisma.TicketWhereInput>({
          ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
        }),
        select: {
          createdAt: true,
          priority: true,
          status: true,
          faultItem: { select: { categoryId: true, category: { select: { name: true } } } },
          visits: {
            where: { arrivedAt: { not: null } },
            orderBy: { arrivedAt: 'asc' },
            select: { arrivedAt: true },
          },
          repairProofs: { orderBy: { createdAt: 'asc' }, select: { createdAt: true } },
          auditLogs: {
            orderBy: { createdAt: 'asc' },
            select: { action: true, toStatus: true, createdAt: true },
          },
        },
      }),
      this.prisma.responseTarget.findMany({
        where: { propertyId: scope.propertyId },
        select: { categoryId: true, priority: true, respondWithinH: true, resolveWithinH: true },
      }),
    ]);

    const responseDurations: Duration[] = [];
    const repairDurations: Duration[] = [];
    const daily = new Map<
      string,
      {
        reported: number;
        responded: number;
        completed: number;
        response: number[];
        repair: number[];
      }
    >();
    const byPriority = new Map<
      Priority,
      {
        reported: number;
        responded: number;
        completed: number;
        response: number[];
        repair: number[];
      }
    >();
    for (const priority of PRIORITIES) {
      byPriority.set(priority, {
        reported: 0,
        responded: 0,
        completed: 0,
        response: [],
        repair: [],
      });
    }

    for (const ticket of tickets) {
      const priorityStats = byPriority.get(ticket.priority)!;
      priorityStats.reported += 1;
      const target =
        targets.find(
          (rule) =>
            rule.categoryId === ticket.faultItem.categoryId && rule.priority === ticket.priority,
        ) ?? targets.find((rule) => rule.categoryId === null && rule.priority === ticket.priority);

      const cycleStarts = [
        ticket.createdAt,
        ...ticket.auditLogs
          .filter((log) => log.toStatus === TicketStatus.REOPENED)
          .map((log) => log.createdAt),
      ].sort((a, b) => a.getTime() - b.getTime());
      for (const [cycleIndex, clockStart] of cycleStarts.entries()) {
        const cycleEnd = cycleStarts[cycleIndex + 1];
        const day = kampalaDate(clockStart);
        const dayStats = daily.get(day) ?? {
          reported: 0,
          responded: 0,
          completed: 0,
          response: [],
          repair: [],
        };
        if (cycleIndex === 0) dayStats.reported += 1;

        const arrivedAt = ticket.visits
          .map((visit) => visit.arrivedAt)
          .find((at) => at && at >= clockStart && (!cycleEnd || at < cycleEnd));
        const completedAt = [
          ...ticket.auditLogs
            .filter((log) => log.action === 'ticket.repair_completed')
            .map((log) => log.createdAt),
          ...ticket.repairProofs.map((proof) => proof.createdAt),
        ]
          .sort((a, b) => a.getTime() - b.getTime())
          .find((at) => at >= clockStart && (!cycleEnd || at < cycleEnd));

        if (arrivedAt) {
          const duration = this.duration(clockStart, arrivedAt, target?.respondWithinH);
          responseDurations.push(duration);
          dayStats.responded += 1;
          dayStats.response.push(duration.minutes);
          priorityStats.responded += 1;
          priorityStats.response.push(duration.minutes);
        }
        if (completedAt) {
          const duration = this.duration(clockStart, completedAt, target?.resolveWithinH);
          repairDurations.push(duration);
          dayStats.completed += 1;
          dayStats.repair.push(duration.minutes);
          priorityStats.completed += 1;
          priorityStats.repair.push(duration.minutes);
        }
        daily.set(day, dayStats);
      }
    }

    return {
      range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      totals: {
        reported: tickets.length,
        responded: responseDurations.length,
        completed: repairDurations.length,
      },
      response: this.summary(responseDurations),
      repair: this.summary(repairDurations),
      byPriority: PRIORITIES.map((priority) => ({
        priority,
        ...this.groupSummary(byPriority.get(priority)!),
      })),
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({ date, ...this.groupSummary(values) })),
    };
  }

  async recurringFaults(input: StatsInput, scope: PropertyScope) {
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;
    if (from && to && from >= to) throw badRequest('The from date must be before the to date');

    const tickets = await this.prisma.ticket.findMany({
      where: scope.where<Prisma.TicketWhereInput>({
        ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
      }),
      select: {
        createdAt: true,
        faultItem: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        },
        room: {
          select: {
            id: true,
            number: true,
            block: { select: { id: true, name: true } },
          },
        },
      },
    });

    const categories = new Map<string, FaultCount>();
    const items = new Map<string, FaultCount>();
    const blocks = new Map<string, FaultCount>();
    const rooms = new Map<string, FaultCount>();
    const roomFaults = new Map<string, RoomFaultCount>();

    for (const ticket of tickets) {
      this.increment(
        categories,
        ticket.faultItem.category.id,
        ticket.faultItem.category.name,
        ticket.createdAt,
      );
      this.increment(
        items,
        ticket.faultItem.id,
        ticket.faultItem.name,
        ticket.createdAt,
        ticket.faultItem.category.name,
      );
      this.increment(blocks, ticket.room.block.id, ticket.room.block.name, ticket.createdAt);
      this.increment(
        rooms,
        ticket.room.id,
        ticket.room.number,
        ticket.createdAt,
        ticket.room.block.name,
      );
      this.incrementRoomFault(
        roomFaults,
        ticket.room.id,
        ticket.room.number,
        ticket.room.block.name,
        ticket.faultItem.id,
        ticket.faultItem.name,
        ticket.faultItem.category.name,
        ticket.createdAt,
      );
    }

    return {
      range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      totalReports: tickets.length,
      byCategory: this.sortedCounts(categories),
      byItem: this.sortedCounts(items),
      byBlock: this.sortedCounts(blocks),
      byRoom: this.sortedCounts(rooms),
      byRoomFault: this.sortedRoomFaults(roomFaults),
    };
  }

  async missedVisitsRatings(input: StatsInput, scope: PropertyScope) {
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;
    if (from && to && from >= to) throw badRequest('The from date must be before the to date');

    const dateFilter =
      from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } } : {};
    const [misses, ratings] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: scope.where<Prisma.AuditLogWhereInput>({
          action: 'visit.missed',
          ...dateFilter,
        }),
        select: { meta: true, createdAt: true },
      }),
      this.prisma.rating.findMany({
        where: scope.where<Prisma.RatingWhereInput>({ ...dateFilter }, 'ticket'),
        select: { score: true, createdAt: true },
      }),
    ]);

    const reasonCounts = new Map<string, number>();
    for (const miss of misses) {
      const meta =
        miss.meta && typeof miss.meta === 'object' && !Array.isArray(miss.meta)
          ? (miss.meta as { reason?: unknown })
          : {};
      const reason = typeof meta.reason === 'string' ? meta.reason : 'OTHER';
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    const scoreCounts = new Map<number, number>();
    for (let score = 1; score <= 5; score += 1) scoreCounts.set(score, 0);
    for (const rating of ratings)
      scoreCounts.set(rating.score, (scoreCounts.get(rating.score) ?? 0) + 1);

    return {
      range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      missedVisits: {
        total: misses.length,
        byReason: [...reasonCounts.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([reason, count]) => ({ reason, count })),
      },
      ratings: {
        total: ratings.length,
        averageScore: ratings.length
          ? Number(
              (ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length).toFixed(2),
            )
          : null,
        distribution: [...scoreCounts.entries()].map(([score, count]) => ({ score, count })),
      },
    };
  }

  private increment(
    counts: Map<string, FaultCount>,
    id: string,
    name: string,
    createdAt: Date,
    group?: string,
  ) {
    const current = counts.get(id);
    if (current) {
      current.reports += 1;
      if (createdAt > current.lastReportedAt) current.lastReportedAt = createdAt;
      return;
    }
    counts.set(id, { id, name, group: group ?? null, reports: 1, lastReportedAt: createdAt });
  }

  private sortedCounts(counts: Map<string, FaultCount>) {
    return [...counts.values()]
      .sort(
        (a, b) => b.reports - a.reports || b.lastReportedAt.getTime() - a.lastReportedAt.getTime(),
      )
      .map((item) => ({ ...item, lastReportedAt: item.lastReportedAt.toISOString() }));
  }

  private incrementRoomFault(
    counts: Map<string, RoomFaultCount>,
    roomId: string,
    room: string,
    block: string,
    faultItemId: string,
    faultItem: string,
    category: string,
    createdAt: Date,
  ) {
    const id = `${roomId}:${faultItemId}`;
    const current = counts.get(id);
    if (current) {
      current.reports += 1;
      if (createdAt > current.lastReportedAt) current.lastReportedAt = createdAt;
      return;
    }
    counts.set(id, { id, room, block, faultItem, category, reports: 1, lastReportedAt: createdAt });
  }

  private sortedRoomFaults(counts: Map<string, RoomFaultCount>) {
    return [...counts.values()]
      .sort(
        (a, b) => b.reports - a.reports || b.lastReportedAt.getTime() - a.lastReportedAt.getTime(),
      )
      .map((item) => ({ ...item, lastReportedAt: item.lastReportedAt.toISOString() }));
  }

  private duration(start: Date, end: Date, targetHours?: number): Duration {
    const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
    return { minutes, withinTarget: targetHours === undefined || minutes <= targetHours * 60 };
  }

  private summary(durations: Duration[]) {
    const minutes = durations.map((duration) => duration.minutes);
    return {
      sampleSize: minutes.length,
      averageMinutes: this.average(minutes),
      medianMinutes: this.median(minutes),
      withinTarget: durations.filter((duration) => duration.withinTarget).length,
      overdue: durations.filter((duration) => !duration.withinTarget).length,
    };
  }

  private groupSummary(values: {
    reported: number;
    responded: number;
    completed: number;
    response: number[];
    repair: number[];
  }) {
    return {
      reported: values.reported,
      responded: values.responded,
      completed: values.completed,
      averageResponseMinutes: this.average(values.response),
      averageRepairMinutes: this.average(values.repair),
    };
  }

  private average(values: number[]) {
    return values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }

  private median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  private createProof(
    ticket: { id: string; propertyId: string; status: TicketStatus },
    key: string,
    notes: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      assertTransition(ticket.status, TicketStatus.COMPLETED);
      const { count } = await tx.ticket.updateMany({
        where: { id: ticket.id, status: TicketStatus.IN_PROGRESS },
        data: { status: TicketStatus.COMPLETED },
      });
      if (count === 0) throw conflict('Someone else updated this ticket. Reload and try again.');

      const created = await tx.repairProof.create({
        data: {
          ticketId: ticket.id,
          submittedById: userId,
          notes,
          photos: {
            create: {
              ticketId: ticket.id,
              uploadedById: userId,
              kind: PhotoKind.PROOF,
              url: key,
            },
          },
        },
        include: { photos: { select: { id: true, kind: true, createdAt: true } } },
      });
      await this.audit.record(
        {
          propertyId: ticket.propertyId,
          actorId: userId,
          ticketId: ticket.id,
          action: 'ticket.repair_completed',
          fromStatus: TicketStatus.IN_PROGRESS,
          toStatus: TicketStatus.COMPLETED,
          meta: { proofId: created.id, notes },
        },
        tx,
      );
      return created;
    });
  }
}

function kampalaDate(date: Date) {
  const parts = Object.fromEntries(
    KAMPALA_DATE.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
