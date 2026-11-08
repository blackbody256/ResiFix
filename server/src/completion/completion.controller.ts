// OWNER: Selina
// TODO:
//   [ ] PB-019  proof of repair: photo (StorageService, kind PROOF) + work note,
//               IN_PROGRESS -> COMPLETED; then TicketTimersService.scheduleAutoClose()
//   [ ] PB-020  resident verification API: Fixed / Still a problem (-> REOPENED); UI by Ayan.
//               Cancel the auto-close timer with TicketTimersService.cancelAutoClose(). On reopen:
//               ResponseTargetsService.startClock(id) and CustodianAlertsService.ticketReopened(id)
//   [x] PB-021  48-hour auto-close: worker job in src/worker/ticket-timers.processor.ts
//   [ ] PB-026  response and repair-time stats
//   [ ] PB-027  recurring-fault analytics
//   [ ] PB-028  missed visits and ratings analytics
//   [ ] PB-029  manage categories and response targets
// The rating endpoint below is PB-022 (Ayan).
import { Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { Roles } from '../common/decorators';

@Controller('completion')
export class CompletionController {
  @Post('tickets/:id/repair-proof')
  @Roles(Role.CUSTODIAN, Role.ADMIN)
  repairProof() {
    notImplemented('PB-019');
  }

  @Post('tickets/:id/verify')
  @Roles(Role.RESIDENT)
  verify() {
    notImplemented('PB-020');
  }

  @Post('tickets/:id/rating')
  @Roles(Role.RESIDENT)
  rate() {
    notImplemented('PB-022');
  }
}
