// OWNER: Andrew
// TODO:
//   [ ] PB-012  work queue
//   [ ] PB-013  assignment
//   [ ] PB-014  schedule a visit
//   [ ] PB-015
//   [ ] PB-016  mark a visit missed
//   [ ] PB-017
//   [ ] PB-018  repair proof (photos via StorageService, kind PROOF);
//               on COMPLETED call TicketTimersService.scheduleAutoClose()
//   [ ] PB-024  notify resident (Web Push, SMS fallback): NotificationsService.notify()
import { Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { Roles } from '../common/decorators';

@Controller('custodian')
@Roles(Role.CUSTODIAN, Role.ADMIN)
export class CustodianController {
  @Get('queue')
  queue() {
    notImplemented('PB-012');
  }

  @Post('tickets/:id/assign')
  assign() {
    notImplemented('PB-013');
  }

  @Post('tickets/:id/visits')
  scheduleVisit() {
    notImplemented('PB-014');
  }

  @Post('visits/:visitId/missed')
  markMissed() {
    notImplemented('PB-016');
  }

  @Post('tickets/:id/repair-proof')
  repairProof() {
    notImplemented('PB-018');
  }
}
