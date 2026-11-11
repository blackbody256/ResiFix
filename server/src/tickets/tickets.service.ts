// Ticket reads and lifecycle. OWNER: Ayan (PB-010, PB-011, PB-020, PB-022, PB-023).
import { Injectable } from '@nestjs/common';
import { PhotoKind, type Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { notFound } from '../common/app-exception';
import type { PropertyScope } from '../common/property-scope';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const PERSON = { select: { id: true, name: true, role: true } } as const;
const PHOTO = { select: { id: true, kind: true, url: true, createdAt: true } } as const;

const DETAIL_INCLUDE = {
  room: { include: { block: true } },
  facility: true,
  faultItem: { include: { category: true } },
  reporter: { select: { id: true, name: true, phone: true } },
  assignee: PERSON,
  photos: { ...PHOTO, where: { kind: PhotoKind.REPORT }, orderBy: { createdAt: 'asc' } },
  visits: {
    orderBy: { scheduledAt: 'asc' },
    include: { custodian: PERSON },
  },
  repairProofs: {
    orderBy: { createdAt: 'asc' },
    include: { submittedBy: PERSON, photos: { ...PHOTO, orderBy: { createdAt: 'asc' } } },
  },
  verifications: { orderBy: { createdAt: 'asc' }, include: { user: PERSON } },
  rating: true,
  auditLogs: { orderBy: { createdAt: 'asc' }, include: { actor: PERSON } },
} satisfies Prisma.TicketInclude;

type StoredPhoto = { id: string; kind: string; url: string; createdAt: Date };

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Residents only ever see tickets they reported; staff see the whole property. */
  private visibleTo(user: AuthUser): Prisma.TicketWhereInput {
    return user.role === Role.RESIDENT ? { reporterId: user.id } : {};
  }

  /** Ticket cards: category, who has the job and the next booked visit, so no per-card fetch. */
  async list(user: AuthUser, scope: PropertyScope) {
    const tickets = await this.prisma.ticket.findMany({
      where: scope.where<Prisma.TicketWhereInput>(this.visibleTo(user)),
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        room: { include: { block: true } },
        facility: true,
        faultItem: { include: { category: true } },
        assignee: { select: { id: true, name: true } },
        visits: {
          where: { missed: false, arrivedAt: null },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: { id: true, scheduledAt: true },
        },
      },
    });
    return tickets.map(({ visits, ...ticket }) => ({ ...ticket, nextVisit: visits[0] ?? null }));
  }

  /**
   * PB-010: one ticket with its photos, visits, repair proof and audit timeline (PB-011).
   * Timeline entries copy named audit fields only, so `meta` and any audit column added
   * later never reach a resident by accident.
   */
  async detail(id: string, user: AuthUser, scope: PropertyScope) {
    const ticket = await this.prisma.ticket.findFirst({
      where: scope.where<Prisma.TicketWhereInput>({ id, ...this.visibleTo(user) }),
      include: DETAIL_INCLUDE,
    });
    // 404 (not 403) for other residents' and other properties' tickets: don't leak existence.
    if (!ticket) throw notFound('Ticket not found');

    const { auditLogs, photos, repairProofs, rating, ...rest } = ticket;
    return {
      ...rest,
      // Deliverable 4: managers only see rating totals (analytics), never one resident's
      // score, so only the resident who reported the ticket gets its rating back.
      ...(user.role === Role.RESIDENT && { rating }),
      photos: await this.withLinks(photos),
      repairProofs: await Promise.all(
        repairProofs.map(async (p) => ({ ...p, photos: await this.withLinks(p.photos) })),
      ),
      timeline: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        actor: log.actor,
        createdAt: log.createdAt,
      })),
    };
  }

  /** Swap stored object keys for short-lived presigned links (PB-007). Signing is local. */
  private withLinks(photos: StoredPhoto[]) {
    return Promise.all(
      photos.map(async ({ url: key, ...photo }) => {
        const { url, expiresAt } = await this.storage.presignedGetUrl(key);
        return { ...photo, url, urlExpiresAt: expiresAt };
      }),
    );
  }
}
