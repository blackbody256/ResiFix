// OWNER: Andrew (PB-012..PB-018, PB-024)
import { Module } from '@nestjs/common';
import { CustodianController } from './custodian.controller';

@Module({ controllers: [CustodianController] })
export class CustodianModule {}
