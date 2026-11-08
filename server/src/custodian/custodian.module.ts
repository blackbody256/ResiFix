// OWNER: Andrew (PB-012..PB-018, PB-024)
import { Module } from '@nestjs/common';
import { CustodianController } from './custodian.controller';
import { ResponseTargetsService } from './response-targets.service';

@Module({
  controllers: [CustodianController],
  providers: [ResponseTargetsService],
  // Reporting (PB-005), completion (PB-020) and the worker call startClock().
  exports: [ResponseTargetsService],
})
export class CustodianModule {}
