import { Module } from '@nestjs/common';
import { CreditControlController } from './credit-control.controller';
import { CreditControlService } from './credit-control.service';

@Module({controllers:[CreditControlController],providers:[CreditControlService]})
export class CreditControlModule {}
