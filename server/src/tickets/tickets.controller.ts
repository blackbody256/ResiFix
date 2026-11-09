// OWNER: Ayan
// TODO:
//   [x] PB-010  my tickets list (and the ticket detail)
//   [ ] PB-011  ticket timeline: shown in the detail, built from the audit log
//   [ ] PB-020  UI for resident verification (API: Selina, POST /completion/tickets/:id/verify)
//   [ ] PB-022  rate the service (endpoint stub: POST /completion/tickets/:id/rating)
//   [ ] PB-023  student notifications on ticket updates: NotificationsService.notify()
//               inbox + ResidentUpdatesService done; PB-013/PB-014/PB-019 still to call it
// Status changes happen in the endpoint of the story that makes them (review, schedule, proof,
// verify), each with assertTransition() + AuditService.record() in one $transaction.
import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser, Scope } from '../common/decorators';
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
}
