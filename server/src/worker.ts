// Standalone queue worker: `npm run start:worker -w server` (Docker `worker` service).
// Runs response-time timers, the 48-hour auto-close (PB-021) and notification delivery.
import './instrument';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from './core.module';
import { WorkerModule } from './worker/worker.module';

@Module({ imports: [CoreModule, WorkerModule] })
class WorkerAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  app.enableShutdownHooks();
  Logger.log('ResiFix worker started', 'Worker');
}

void bootstrap();
