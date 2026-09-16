import { Module } from '@nestjs/common';
import { FinanceReportingController } from './finance-reporting.controller';
import { FinanceReportingService } from './finance-reporting.service';

@Module({controllers:[FinanceReportingController],providers:[FinanceReportingService]})
export class FinanceReportingModule {}
