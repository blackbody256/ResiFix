// OWNER: Andrew
// Stories (all built; tests in test/custodian-*.e2e-spec.ts and test/report-alerts.e2e-spec.ts):
//   [x] PB-012  response targets by category; flag overdue tickets
//               GET /targets; ResponseTargetsService.startClock() sets dueAt + schedules the alert
//   [x] PB-013  prioritised work queue: urgency and least time remaining, search and filter
//   [x] PB-014  review and correct the ticket category (REPORTED -> REVIEWED);
//               then TicketTimersService.scheduleResponseDeadline()
//   [x] PB-015  schedule a repair visit inside the resident's availability; notify the resident
//   [x] PB-016  resident requests another time for a scheduled visit
//   [x] PB-017  record a missed visit; the ticket stays open for rescheduling
//   [x] PB-018  mark work in progress
//   [x] PB-024  custodian alerts for new, breached and reopened tickets: CustodianAlertsService
//               (notifications module); breach alerts come from the response-deadline job;
//               the reopened alert fires once PB-020 (verify) calls ticketReopened()
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles, Scope } from '../common/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { PropertyScope } from '../common/property-scope';
import { ResponseTargetsService } from './response-targets.service';
import { ReviewBody, TicketActionsService } from './ticket-actions.service';
import {
  MissedBody,
  RescheduleBody,
  ScheduleBody,
  StartBody,
  VisitsService,
} from './visits.service';
import { QueueQuery, WorkQueueService } from './work-queue.service';

const AssignBody = z.object({ assigneeId: z.string().min(1) });

@Controller('custodian')
@Roles(Role.CUSTODIAN, Role.ADMIN)
export class CustodianController {
  constructor(
    private readonly targets: ResponseTargetsService,
    private readonly workQueue: WorkQueueService,
    private readonly actions: TicketActionsService,
    private readonly visits: VisitsService,
  ) {}

  /** PB-012: the response targets in force for the caller's property. GET /api/custodian/targets */
  @Get('targets')
  async listTargets(@Scope() scope: PropertyScope) {
    return { targets: await this.targets.list(scope) };
  }

  /** PB-013: who a ticket or visit can go to. GET /api/custodian/staff */
  @Get('staff')
  async listStaff(@Scope() scope: PropertyScope) {
    return { staff: await this.actions.staff(scope) };
  }

  /**
   * PB-013: open tickets, most pressing first. GET /api/custodian/queue
   * ?status=&priority=&state=&categoryId=&blockId=&assignee=me|unassigned|<id>&q=&limit=
   */
  @Get('queue')
  queue(
    @Query(new ZodValidationPipe(QueueQuery)) query: QueueQuery,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.workQueue.queue(user, scope, query);
  }

  /**
   * PB-014: confirm a report, or correct its fault and priority.
   * POST /api/custodian/tickets/:id/review { faultItemId?, priority?, note? }
   */
  @Post('tickets/:id/review')
  @HttpCode(200)
  async review(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReviewBody)) body: ReviewBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return { ticket: await this.actions.review(id, body, user, scope) };
  }

  /** PB-013: give a ticket to a custodian. POST /api/custodian/tickets/:id/assign { assigneeId } */
  @Post('tickets/:id/assign')
  @HttpCode(200)
  async assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignBody)) body: z.infer<typeof AssignBody>,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return { ticket: await this.actions.assign(id, body.assigneeId, user, scope) };
  }

  /**
   * PB-015: book a repair visit and tell the resident.
   * POST /api/custodian/tickets/:id/visits { scheduledAt, custodianId?, notes? }
   */
  @Post('tickets/:id/visits')
  scheduleVisit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ScheduleBody)) body: ScheduleBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.visits.schedule(id, body, user, scope);
  }

  /**
   * PB-018: the custodian has arrived and starts the repair.
   * POST /api/custodian/tickets/:id/start { visitId? }
   */
  @Post('tickets/:id/start')
  @HttpCode(200)
  start(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StartBody)) body: StartBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.visits.start(id, body, user, scope);
  }

  /**
   * PB-016: move an upcoming visit, e.g. after the resident asked for another time.
   * PATCH /api/custodian/visits/:visitId { scheduledAt, notes? }
   */
  @Patch('visits/:visitId')
  reschedule(
    @Param('visitId') visitId: string,
    @Body(new ZodValidationPipe(RescheduleBody)) body: RescheduleBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.visits.reschedule(visitId, body, user, scope);
  }

  /**
   * PB-017: record that a visit did not happen; the ticket stays open for a new time.
   * POST /api/custodian/visits/:visitId/missed { reason, notes? }
   */
  @Post('visits/:visitId/missed')
  @HttpCode(200)
  markMissed(
    @Param('visitId') visitId: string,
    @Body(new ZodValidationPipe(MissedBody)) body: MissedBody,
    @CurrentUser() user: AuthUser,
    @Scope() scope: PropertyScope,
  ) {
    return this.visits.markMissed(visitId, body, user, scope);
  }
}
