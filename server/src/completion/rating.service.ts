// PB-022: the resident rates the repair service. OWNER: Ayan
//
//   POST /completion/tickets/:id/rating { score: 1..5, comment? } -> 201 { rating }
//
// - Only the resident who reported the ticket, in their own property (anyone else: 404).
// - Only once the repair is done: COMPLETED, STUDENT_CONFIRMED or CLOSED (else 409). COMPLETED is
//   allowed so the resident can rate in the same step as confirming (PB-020).
// - One rating per ticket (409 on a second one).
// - Deliverable 4: staff never see one resident's score. The audit entry records that a rating
//   was given but not the score; managers get totals from analytics (PB-028).
import { Injectable } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { conflict, notFound } from '../common/app-exception';
import { AuditService } from '../common/audit.service';
import type { PropertyScope } from '../common/property-scope';
import { PrismaService } from '../prisma/prisma.service';

export const RatingBody = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export type RatingBody = z.infer<typeof RatingBody>;

/** Statuses in which the repair is finished and can be rated. */
export const RATEABLE: TicketStatus[] = [
  TicketStatus.COMPLETED,
  TicketStatus.STUDENT_CONFIRMED,
  TicketStatus.CLOSED,
];

const RATING_SELECT = { score: true, comment: true, createdAt: true } as const;

@Injectable()
export class RatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async rate(ticketId: string, input: RatingBody, user: AuthUser, scope: PropertyScope) {
    const ticket = await this.prisma.ticket.findFirst({
      where: scope.where<Prisma.TicketWhereInput>({ id: ticketId, reporterId: user.id }),
      select: { id: true, propertyId: true, status: true, rating: { select: { id: true } } },
    });
    if (!ticket) throw notFound('Ticket not found');
    if (ticket.rating) throw conflict('You have already rated this repair');
    if (!RATEABLE.includes(ticket.status)) {
      throw conflict('You can rate the repair once it has been completed');
    }

    try {
      const rating = await this.prisma.$transaction(async (tx) => {
        const created = await tx.rating.create({
          data: {
            ticketId: ticket.id,
            userId: user.id,
            score: input.score,
            comment: input.comment || null,
          },
          select: RATING_SELECT,
        });
        await this.audit.record(
          {
            propertyId: ticket.propertyId,
            actorId: user.id,
            ticketId: ticket.id,
            action: 'ticket.rated',
          },
          tx,
        );
        return created;
      });
      return { rating };
    } catch (err) {
      // Two submissions at once: the unique ticketId lets only one through.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('You have already rated this repair');
      }
      throw err;
    }
  }
}
