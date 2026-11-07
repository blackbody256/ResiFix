// Redis + BullMQ. Global so any feature module can inject TicketTimersService or a queue.
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { QUEUES, redisConnectionFromUrl } from './queue.constants';
import { TicketTimersService } from './ticket-timers.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        prefix: 'resifix',
        connection: redisConnectionFromUrl(config.redis.url),
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.TICKET_TIMERS }, { name: QUEUES.NOTIFICATIONS }),
  ],
  providers: [TicketTimersService],
  exports: [BullModule, TicketTimersService],
})
export class QueueModule {}
