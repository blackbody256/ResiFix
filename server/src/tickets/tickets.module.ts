// OWNER: Ayan (PB-010, PB-011, PB-020, PB-022, PB-023)
import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({ controllers: [TicketsController], providers: [TicketsService] })
export class TicketsModule {}
