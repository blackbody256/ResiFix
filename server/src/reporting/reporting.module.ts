// OWNER: Amabe / Ayan (PB-005..PB-009)
import { Module } from '@nestjs/common';
import { CustodianModule } from '../custodian/custodian.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportingController } from './reporting.controller';

// CustodianModule: the response clock (PB-012). NotificationsModule: custodian alerts (PB-024).
@Module({ imports: [CustodianModule, NotificationsModule], controllers: [ReportingController] })
export class ReportingModule {}
