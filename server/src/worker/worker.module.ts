// Queue consumers. Imported by AppModule when RUN_WORKER_INLINE=true (dev), or run on its own
// by src/worker.ts (Docker: the `worker` service).
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsProcessor } from './notifications.processor';
import { TicketTimersProcessor } from './ticket-timers.processor';

@Module({
  imports: [NotificationsModule],
  providers: [TicketTimersProcessor, NotificationsProcessor],
})
export class WorkerModule {}
