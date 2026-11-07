// OWNER: Amabe (PB-003, PB-004)
import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';

@Module({ controllers: [PropertiesController] })
export class PropertiesModule {}
