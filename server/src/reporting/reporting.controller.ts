// OWNER: Amabe / Ayan
// TODO:
//   [ ] PB-005  resident reports a fault (create ticket)
//   [ ] PB-006  attach photos: upload endpoint works; add client UI and limits per ticket
//   [x] PB-007  photos served via expiring presigned links
//   [ ] PB-008
//   [ ] PB-009
import { Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Prisma, PhotoKind, Role } from '@prisma/client';
import { badRequest, notFound, notImplemented } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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
  createTicket() {
    notImplemented('PB-005');
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
