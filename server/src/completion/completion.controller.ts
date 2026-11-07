// OWNER: Selina
// TODO:
//   [ ] PB-019  resident confirms or disputes a repair (dispute -> REOPENED);
//               cancel the auto-close timer with TicketTimersService.cancelAutoClose()
//   [x] PB-021  48-hour auto-close: worker job in src/worker/ticket-timers.processor.ts
//   [ ] PB-025  rating
//   [ ] PB-026
//   [ ] PB-027
//   [ ] PB-028
//   [ ] PB-029
import { Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { Roles } from '../common/decorators';

@Controller('completion')
export class CompletionController {
  @Post('tickets/:id/verify')
  @Roles(Role.RESIDENT)
  verify() {
    notImplemented('PB-019');
  }

  @Post('tickets/:id/rating')
  @Roles(Role.RESIDENT)
  rate() {
    notImplemented('PB-025');
  }
}
