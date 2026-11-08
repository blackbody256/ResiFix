// OWNER: Andrew (PB-012..PB-018, PB-024)
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustodianController } from './custodian.controller';
import { ResponseTargetsService } from './response-targets.service';
import { TicketActionsService } from './ticket-actions.service';
import { WorkQueueService } from './work-queue.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CustodianController],
  providers: [ResponseTargetsService, WorkQueueService, TicketActionsService],
  // Reporting (PB-005), completion (PB-020) and the worker call startClock().
  exports: [ResponseTargetsService],
})
export class CustodianModule {}
