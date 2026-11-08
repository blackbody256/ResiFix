// OWNER: Selina (PB-019, PB-020 API, PB-021, PB-026..PB-029); rating endpoint PB-022 (Ayan)
import { Module } from '@nestjs/common';
import { CompletionController } from './completion.controller';

@Module({ controllers: [CompletionController] })
export class CompletionModule {}
