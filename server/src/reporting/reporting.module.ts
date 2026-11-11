// OWNER: Amabe / Ayan (PB-005..PB-009)
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportingController } from './reporting.controller';

@Module({ imports: [NotificationsModule], controllers: [ReportingController] })
export class ReportingModule {}
