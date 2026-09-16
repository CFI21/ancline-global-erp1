import { Module } from '@nestjs/common';
import { GroupFinanceController } from './group-finance.controller';
import { GroupFinanceService } from './group-finance.service';

@Module({controllers:[GroupFinanceController],providers:[GroupFinanceService]})
export class GroupFinanceModule {}
