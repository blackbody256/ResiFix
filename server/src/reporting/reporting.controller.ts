// OWNER: Amabe / Ayan
// TODO:
//   [x] PB-005  report a room fault: create a ticket (UI by Ayan).
//               After creating it: ResponseTargetsService.startClock(id) (import CustodianModule)
//               and CustodianAlertsService.ticketReported(id) (NotificationsModule)
//   [ ] PB-006  report a shared-facility fault (UI by Ayan)
//   [x] PB-007  upload photos: upload and presigned links work; still to do: the limit of two
//               per ticket and on-device compression in the UI (Ayan)
//   [ ] PB-008  provide availability for scheduling (UI by Ayan)
//   [ ] PB-009  follow a shared fault instead of reporting a duplicate
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, PhotoKind, Role, TicketStatus, Weekday } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ResponseTargetsService } from '../custodian/response-targets.service';
import { CustodianAlertsService } from '../notifications/custodian-alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/audit.service';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const CreateTicketBody = z
  .object({
    roomId: z.string().trim().min(1).optional(),
    facilityId: z.string().trim().min(1).optional(),
    faultItemId: z.string().trim().min(1),
    description: z.string().trim().max(2000).optional(),
  })
  .refine((b) => Boolean(b.roomId) !== Boolean(b.facilityId), {
    message: 'Provide exactly one of roomId or facilityId',
  });
const AvailabilityWindow = z
  .object({
    weekday: z.nativeEnum(Weekday),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((w) => w.startMinute < w.endMinute, { message: 'startMinute must be before endMinute' });
const AvailabilityBody = z
  .object({ windows: z.array(AvailabilityWindow).max(28) })
  .superRefine((body, context) => {
    const counts = new Map<Weekday, number>();
    for (const window of body.windows) {
      const count = (counts.get(window.weekday) ?? 0) + 1;
      counts.set(window.weekday, count);
      if (count > 4) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['windows'],
          message: 'A day can have at most four availability windows',
        });
        break;
      }
    }
  });
const CandidateQuery = z
  .object({
    faultItemId: z.string().min(1),
    roomId: z.string().min(1).optional(),
    facilityId: z.string().min(1).optional(),
  })
  .refine((q) => Boolean(q.roomId) !== Boolean(q.facilityId), {
    message: 'Provide exactly one of roomId or facilityId',
  });
const AvailabilityQuery = z.object({ userId: z.string().min(1).optional() });
const DUPLICATE_STATUSES: TicketStatus[] = [
  TicketStatus.REPORTED,
  TicketStatus.REVIEWED,
  TicketStatus.SCHEDULED,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.REOPENED,
];

@Controller('reporting')
export class ReportingController {
  private readonly logger = new Logger(ReportingController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly targets: ResponseTargetsService,
    private readonly alerts: CustodianAlertsService,
  ) {}

  /** Fault catalogue for the caller's property. GET /api/reporting/fault-categories */
  @Get('fault-categories')
  async faultCategories(@Scope() scope: PropertyScope) {
    const categories = await this.prisma.faultCategory.findMany({
      where: scope.where<Prisma.FaultCategoryWhereInput>(),
      orderBy: { name: 'asc' },
      include: { items: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });
    return { categories };
  }

  @Post('tickets')
  @Roles(Role.RESIDENT)
  async createTicket(
    @Body(new ZodValidationPipe(CreateTicketBody)) body: z.infer<typeof CreateTicketBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const [occupancy, facility, faultItem] = await Promise.all([
      body.roomId
        ? this.prisma.occupancy.findFirst({
            where: {
              userId: user.id,
              roomId: body.roomId,
              endDate: null,
              room: { block: { propertyId: scope.propertyId } },
            },
          })
        : null,
      body.facilityId
        ? this.prisma.facility.findFirst({
            where: { id: body.facilityId, propertyId: scope.propertyId, isActive: true },
          })
        : null,
      this.prisma.faultItem.findFirst({
        where: scope.where<Prisma.FaultItemWhereInput>({ id: body.faultItemId }, 'category'),
      }),
    ]);
    if (body.roomId && !occupancy) throw notFound('You are not assigned to this room');
    if (body.facilityId && !facility) throw notFound('Facility not found');
    if (!faultItem) throw notFound('Fault item not found');

    const ticket = await this.prisma.ticket.create({
      data: scope.data({
        roomId: body.roomId,
        facilityId: body.facilityId,
        reporterId: user.id,
        faultItemId: faultItem.id,
        description: body.description || undefined,
        priority: faultItem.defaultPriority,
      }),
      include: { room: { include: { block: true } }, facility: true, faultItem: true },
    });
    return { ticket: { ...ticket, dueAt: await this.afterReport(ticket.id) } };
  }

  /**
   * Start response tracking and notify custodians after the ticket is persisted.
   * These follow-up failures are logged without making the successful report look failed.
   */
  private async afterReport(ticketId: string): Promise<Date | null> {
    let dueAt: Date | null = null;
    try {
      dueAt = await this.targets.startClock(ticketId);
    } catch (error) {
      this.logger.error(`Could not start response clock for ticket ${ticketId}`, error);
    }
    try {
      await this.alerts.ticketReported(ticketId);
    } catch (error) {
      this.logger.error(`Could not alert custodians about ticket ${ticketId}`, error);
    }
    return dueAt;
  }

  @Get('availability')
  @Roles(Role.RESIDENT, Role.ADMIN)
  async availability(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(AvailabilityQuery)) query: z.infer<typeof AvailabilityQuery>,
  ) {
    const targetUserId = query.userId ?? user.id;
    if (targetUserId !== user.id && user.role !== Role.ADMIN)
      throw notFound('Availability not found');
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, propertyId: user.propertyId, role: Role.RESIDENT },
      select: { id: true },
    });
    if (!target) throw notFound('Availability not found');
    if (targetUserId !== user.id) {
      await this.audit.record({
        propertyId: user.propertyId,
        actorId: user.id,
        action: 'availability.read',
        meta: { userId: targetUserId },
      });
    }
    const windows = await this.prisma.availabilityWindow.findMany({
      where: { userId: targetUserId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
    return { windows };
  }

  @Put('availability')
  @Roles(Role.RESIDENT)
  async replaceAvailability(
    @Body(new ZodValidationPipe(AvailabilityBody)) body: z.infer<typeof AvailabilityBody>,
    @CurrentUser() user: AuthUser,
  ) {
    const grouped = new Map<Weekday, Array<{ startMinute: number; endMinute: number }>>();
    for (const window of body.windows) {
      const day = grouped.get(window.weekday) ?? [];
      if (day.some((x) => window.startMinute < x.endMinute && x.startMinute < window.endMinute)) {
        throw badRequest('Availability windows must not overlap');
      }
      day.push(window);
      grouped.set(window.weekday, day);
    }
    const windows = await this.prisma.$transaction(async (tx) => {
      await tx.availabilityWindow.deleteMany({ where: { userId: user.id } });
      return Promise.all(
        body.windows.map((window) =>
          tx.availabilityWindow.create({
            data: { ...window, userId: user.id },
          }),
        ),
      );
    });
    return { windows };
  }

  @Delete('availability/:id')
  @Roles(Role.RESIDENT)
  async deleteAvailability(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const result = await this.prisma.availabilityWindow.deleteMany({
      where: { id, userId: user.id },
    });
    if (!result.count) throw notFound('Availability window not found');
    return { deleted: true };
  }

  @Get('duplicate-candidates')
  @Roles(Role.RESIDENT)
  async duplicateCandidates(
    @Query(new ZodValidationPipe(CandidateQuery)) query: z.infer<typeof CandidateQuery>,
    @Scope() scope: PropertyScope,
  ) {
    const target = query.roomId ? { roomId: query.roomId } : { facilityId: query.facilityId };
    const tickets = await this.prisma.ticket.findMany({
      where: scope.where<Prisma.TicketWhereInput>({
        ...target,
        faultItemId: query.faultItemId,
        status: { in: DUPLICATE_STATUSES },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        duplicatesOf: { none: {} },
      }),
      select: {
        id: true,
        status: true,
        createdAt: true,
        faultItem: { select: { id: true, name: true } },
        room: { select: { number: true, block: { select: { name: true } } } },
        facility: { select: { name: true, location: true } },
        _count: { select: { duplicatedBy: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      candidates: tickets.map((ticket) => ({
        id: ticket.id,
        status: ticket.status,
        createdAt: ticket.createdAt,
        faultItem: ticket.faultItem,
        location:
          ticket.facility?.location ??
          (ticket.room ? `${ticket.room.block.name} ${ticket.room.number}` : ticket.facility?.name),
        followCount: ticket._count.duplicatedBy,
      })),
    };
  }

  @Post('tickets/:canonicalId/follow')
  @Roles(Role.RESIDENT)
  async followTicket(
    @Param('canonicalId') canonicalId: string,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    let result: {
      link: {
        ticketId: string;
        canonicalId: string;
        linkedById: string;
        id: string;
        createdAt: Date;
      };
      ticket: { id: string };
      repeated: boolean;
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const canonical = await tx.ticket.findFirst({
          where: scope.where<Prisma.TicketWhereInput>({
            id: canonicalId,
            status: { in: DUPLICATE_STATUSES },
            duplicatesOf: { none: {} },
          }),
        });
        if (!canonical) throw notFound('Ticket is no longer available to follow');
        if (canonical.reporterId === user.id) throw badRequest('You cannot follow your own ticket');
        const existing = await tx.duplicateLink.findFirst({
          where: { linkedById: user.id, canonicalId },
        });
        if (existing) {
          return {
            link: existing,
            ticket: await tx.ticket.findUniqueOrThrow({ where: { id: existing.ticketId } }),
            repeated: true,
          };
        }
        const occupancy = canonical.roomId
          ? await tx.occupancy.findFirst({
              where: { userId: user.id, roomId: canonical.roomId, endDate: null },
            })
          : null;
        if (canonical.roomId && !occupancy) throw notFound('You are not assigned to this room');
        const follower = await tx.ticket.create({
          data: {
            propertyId: canonical.propertyId,
            roomId: canonical.roomId && occupancy ? occupancy.roomId : null,
            facilityId: canonical.facilityId,
            reporterId: user.id,
            faultItemId: canonical.faultItemId,
            priority: canonical.priority,
            description: null,
          },
        });
        const link = await tx.duplicateLink.create({
          data: { ticketId: follower.id, canonicalId, linkedById: user.id },
        });
        return { link, ticket: follower, repeated: false };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.duplicateLink.findUnique({
        where: { canonicalId_linkedById: { canonicalId, linkedById: user.id } },
      });
      if (!existing) throw error;
      result = {
        link: existing,
        ticket: await this.prisma.ticket.findUniqueOrThrow({ where: { id: existing.ticketId } }),
        repeated: true,
      };
    }
    if (!result.repeated) {
      await this.notifications.notify({
        userId: user.id,
        ticketId: result.ticket.id,
        title: 'Ticket followed',
        body: 'Your report is linked to an existing repair.',
      });
    }
    return { ticket: result.ticket, duplicateLink: result.link };
  }

  /** multipart/form-data with field `photo`. POST /api/reporting/tickets/:id/photos */
  @Post('tickets/:id/photos')
  @Roles(Role.RESIDENT)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async uploadPhoto(
    @Param('id') ticketId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    if (!file) throw badRequest('Attach an image in the "photo" field');
    const ext = PHOTO_TYPES[file.mimetype];
    if (!ext) throw badRequest('Photos must be JPEG, PNG or WebP');

    const ticket = await this.prisma.ticket.findFirst({
      where: scope.where<Prisma.TicketWhereInput>({ id: ticketId, reporterId: user.id }),
    });
    if (!ticket) throw notFound('Ticket not found');

    const reportPhotoCount = await this.prisma.photo.count({
      where: { ticketId: ticket.id, kind: PhotoKind.REPORT },
    });
    if (reportPhotoCount >= 2) throw conflict('A ticket can have at most two report photos');

    const key = this.storage.photoKey(scope.propertyId, ticket.id, ext);
    await this.storage.put(key, file.buffer, file.mimetype);
    const photo = await this.prisma.photo.create({
      data: { ticketId: ticket.id, uploadedById: user.id, kind: PhotoKind.REPORT, url: key },
      select: { id: true, kind: true, createdAt: true },
    });
    return { photo };
  }

  /**
   * PB-007: short-lived link to view a photo. GET /api/reporting/photos/:photoId/link
   * Same visibility as GET /tickets/:id: staff see any photo in their property, residents only
   * photos on tickets they reported (they are taken inside someone's room).
   */
  @Get('photos/:photoId/link')
  async photoLink(
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    const own = user.role === Role.RESIDENT ? { ticket: { reporterId: user.id } } : {};
    const photo = await this.prisma.photo.findFirst({
      where: scope.where<Prisma.PhotoWhereInput>({ id: photoId, ...own }, 'ticket'),
    });
    if (!photo) throw notFound('Photo not found');
    return this.storage.presignedGetUrl(photo.url);
  }
}
