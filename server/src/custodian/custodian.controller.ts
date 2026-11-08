// OWNER: Andrew
// TODO:
//   [ ] PB-012  response targets by category; flag overdue tickets
//               GET /targets; ResponseTargetsService.startClock() sets dueAt + schedules the alert
//   [ ] PB-013  prioritised work queue: urgency and least time remaining, search and filter
//   [ ] PB-014  review and correct the ticket category (REPORTED -> REVIEWED);
//               then TicketTimersService.scheduleResponseDeadline()
//   [ ] PB-015  schedule a repair visit inside the resident's availability; notify the resident
//   [ ] PB-016  resident requests another time for a scheduled visit
//   [ ] PB-017  record a missed visit; the ticket stays open for rescheduling
//   [ ] PB-018  mark work in progress
//   [ ] PB-024  custodian alerts for new, breached and reopened tickets:
//               NotificationsService.notify()
import { Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { notImplemented } from '../common/app-exception';
import { Roles, Scope } from '../common/decorators';
import type { PropertyScope } from '../common/property-scope';
import { ResponseTargetsService } from './response-targets.service';

@Controller('custodian')
@Roles(Role.CUSTODIAN, Role.ADMIN)
export class CustodianController {
  constructor(private readonly targets: ResponseTargetsService) {}

  /** PB-012: the response targets in force for the caller's property. GET /api/custodian/targets */
  @Get('targets')
  async listTargets(@Scope() scope: PropertyScope) {
    return { targets: await this.targets.list(scope) };
  }

  @Get('queue')
  queue() {
    notImplemented('PB-013');
  }

  @Post('tickets/:id/review')
  review() {
    notImplemented('PB-014');
  }

  @Post('tickets/:id/assign')
  assign() {
    notImplemented('PB-013');
  }

  @Post('tickets/:id/visits')
  scheduleVisit() {
    notImplemented('PB-015');
  }

  @Post('visits/:visitId/missed')
  markMissed() {
    notImplemented('PB-017');
  }
}
