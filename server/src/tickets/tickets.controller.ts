// OWNER: Ayan
// TODO:
//   [ ] PB-010  ticket detail
//   [ ] PB-011  admin review: on REVIEWED call TicketTimersService.scheduleResponseDeadline()
//   [ ] PB-020  status changes: assertTransition() + AuditService.record() in one $transaction
//   [ ] PB-022
//   [ ] PB-023  notifications on status change: NotificationsService.notify()
import { Controller, Get, Post } from '@nestjs/common';
import { type Prisma, Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Tickets visible to the caller; residents only see their own. GET /api/tickets */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Scope() scope: PropertyScope) {
    const mine = user.role === Role.RESIDENT ? { reporterId: user.id } : {};
    const tickets = await this.prisma.ticket.findMany({
      where: scope.where<Prisma.TicketWhereInput>(mine),
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { room: { include: { block: true } }, faultItem: true },
    });
    return { tickets };
  }

  @Get(':id')
  detail() {
    notImplemented('PB-010');
  }

  @Post(':id/review')
  @Roles(Role.ADMIN)
  review() {
    notImplemented('PB-011');
  }

  @Post(':id/status')
  @Roles(Role.ADMIN, Role.CUSTODIAN)
  changeStatus() {
    notImplemented('PB-020');
  }
}
