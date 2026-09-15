import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({controllers:[AccountingController],providers:[AccountingService]})
export class AccountingModule {}
