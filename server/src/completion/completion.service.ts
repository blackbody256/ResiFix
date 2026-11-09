import { Injectable } from '@nestjs/common';
import { PhotoKind, Role, TicketStatus, type Prisma } from '@prisma/client';
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
