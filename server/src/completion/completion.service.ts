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

const PRIORITIES: Priority[] = [Priority.URGENT, Priority.HIGH, Priority.MEDIUM, Priority.LOW];

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
      const day = ticket.createdAt.toISOString().slice(0, 10);
      const dayStats = daily.get(day) ?? {
        reported: 0,
        responded: 0,
        completed: 0,
        response: [],
        repair: [],
      };
      dayStats.reported += 1;
      daily.set(day, dayStats);

      const priorityStats = byPriority.get(ticket.priority)!;
      priorityStats.reported += 1;

      const reopenedAt = ticket.auditLogs
        .filter((log) => log.toStatus === TicketStatus.REOPENED)
        .at(-1)?.createdAt;
      const clockStart =
        reopenedAt && reopenedAt > ticket.createdAt ? reopenedAt : ticket.createdAt;
      const target =
        targets.find(
          (rule) =>
            rule.categoryId === ticket.faultItem.categoryId && rule.priority === ticket.priority,
        ) ?? targets.find((rule) => rule.categoryId === null && rule.priority === ticket.priority);
      const arrivedAt = ticket.visits[0]?.arrivedAt;
      const completedAt =
        ticket.auditLogs.find((log) => log.action === 'ticket.repair_completed')?.createdAt ??
        ticket.repairProofs[0]?.createdAt;

      if (arrivedAt && arrivedAt >= clockStart) {
        const duration = this.duration(clockStart, arrivedAt, target?.respondWithinH);
        responseDurations.push(duration);
        dayStats.responded += 1;
        dayStats.response.push(duration.minutes);
        priorityStats.responded += 1;
        priorityStats.response.push(duration.minutes);
      }
      if (completedAt && completedAt >= clockStart) {
        const duration = this.duration(clockStart, completedAt, target?.resolveWithinH);
        repairDurations.push(duration);
        dayStats.completed += 1;
        dayStats.repair.push(duration.minutes);
        priorityStats.completed += 1;
        priorityStats.repair.push(duration.minutes);
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
