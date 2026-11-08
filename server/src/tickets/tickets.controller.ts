// OWNER: Ayan
// TODO:
//   [x] PB-010  ticket detail
//   [ ] PB-011  admin review: on REVIEWED call TicketTimersService.scheduleResponseDeadline()
//   [ ] PB-020  status changes: assertTransition() + AuditService.record() in one $transaction
//   [ ] PB-022
//   [ ] PB-023  notifications on status change: NotificationsService.notify()
import { Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import type { AuthUser } from '../auth/auth-user';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /** Tickets visible to the caller; residents only see their own. GET /api/tickets */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Scope() scope: PropertyScope) {
    return { tickets: await this.tickets.list(user, scope) };
  }

  /** PB-010: ticket detail with photos, visits and timeline. GET /api/tickets/:id */
  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return { ticket: await this.tickets.detail(id, user, scope) };
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
