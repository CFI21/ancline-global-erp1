import { Module } from '@nestjs/common';
import { GeneralLedgerController } from './general-ledger.controller';
import { GeneralLedgerService } from './general-ledger.service';
@Module({controllers:[GeneralLedgerController],providers:[GeneralLedgerService]})
export class GeneralLedgerModule {}
