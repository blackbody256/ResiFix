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
import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, PhotoKind, Role } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import type { AuthUser } from '../auth/auth-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const CreateTicketBody = z.object({
  roomId: z.string().trim().min(1),
  faultItemId: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
});

@Controller('reporting')
export class ReportingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
    const [occupancy, faultItem] = await Promise.all([
      this.prisma.occupancy.findFirst({
        where: {
          userId: user.id,
          roomId: body.roomId,
          endDate: null,
          room: { block: { propertyId: scope.propertyId } },
        },
      }),
      this.prisma.faultItem.findFirst({
        where: scope.where<Prisma.FaultItemWhereInput>({ id: body.faultItemId }, 'category'),
      }),
    ]);
    if (!occupancy) throw notFound('You are not assigned to this room');
    if (!faultItem) throw notFound('Fault item not found');

    const ticket = await this.prisma.ticket.create({
      data: scope.data({
        roomId: body.roomId,
        reporterId: user.id,
        faultItemId: faultItem.id,
        description: body.description || undefined,
        priority: faultItem.defaultPriority,
      }),
      include: { room: { include: { block: true } }, faultItem: true },
    });
    return { ticket };
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
