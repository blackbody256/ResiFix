// OWNER: Selina (PB-019, PB-020 API, PB-021, PB-026..PB-029); rating endpoint PB-022 (Ayan)
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CompletionController } from './completion.controller';
import { CompletionService } from './completion.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CompletionController],
  providers: [CompletionService],
})
export class CompletionModule {}
