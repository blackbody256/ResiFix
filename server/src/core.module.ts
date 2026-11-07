// Infrastructure shared by the API and the standalone worker.
import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [ConfigModule, PrismaModule, CommonModule, QueueModule, StorageModule],
})
export class CoreModule {}
