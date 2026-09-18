import { Module } from '@nestjs/common';
import { FinanceAutomationController } from './finance-automation.controller';
import { FinanceAutomationService } from './finance-automation.service';

@Module({controllers:[FinanceAutomationController],providers:[FinanceAutomationService]})
export class FinanceAutomationModule {}
