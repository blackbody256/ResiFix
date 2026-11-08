import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadConfig } from './config/config';
import { CoreModule } from './core.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkerModule } from './worker/worker.module';

import { AuthModule } from './auth/auth.module';
import { PropertiesModule } from './properties/properties.module';
import { ReportingModule } from './reporting/reporting.module';
import { TicketsModule } from './tickets/tickets.module';
import { CustodianModule } from './custodian/custodian.module';
import { CompletionModule } from './completion/completion.module';

const { worker } = loadConfig();

@Module({
  imports: [
    SentryModule.forRoot(),
    CoreModule,
    HealthModule,
    NotificationsModule, // OWNER: Ayan (PB-023) / Andrew (PB-024)

    // OWNER: Ann: PB-001, PB-002
    AuthModule,
    // OWNER: Amabe: PB-003, PB-004
    PropertiesModule,
    // OWNER: Amabe / Ayan: PB-005..PB-009
    ReportingModule,
    // OWNER: Ayan: PB-010, PB-011, PB-020, PB-022, PB-023
    TicketsModule,
    // OWNER: Andrew: PB-012..PB-018, PB-024
    CustodianModule,
    // OWNER: Selina: PB-019, PB-020 (API), PB-021, PB-026..PB-029
    CompletionModule,

    // Queue consumers in-process for local dev; Docker runs them in the `worker` service.
    ...(worker.inline ? [WorkerModule] : []),
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
