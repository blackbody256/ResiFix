// OWNER: Amabe / Ayan (PB-005..PB-009)
import { Module } from '@nestjs/common';
import { CustodianModule } from '../custodian/custodian.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportingController } from './reporting.controller';

@Module({
  imports: [CustodianModule, NotificationsModule],
  controllers: [ReportingController],
})
export class ReportingModule {}
