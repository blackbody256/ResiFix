// OWNER: Selina (PB-019, PB-021, PB-025..PB-029)
import { Module } from '@nestjs/common';
import { CompletionController } from './completion.controller';

@Module({ controllers: [CompletionController] })
export class CompletionModule {}
