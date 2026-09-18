import { Module } from '@nestjs/common';
import { FinanceCloseOrchestrationModule } from '../finance-close-orchestration/finance-close-orchestration.module';
import { FinanceCloseExecutionController } from './finance-close-execution.controller';
import { FinanceCloseExecutionService } from './finance-close-execution.service';

@Module({
  imports:[FinanceCloseOrchestrationModule],
  controllers:[FinanceCloseExecutionController],
  providers:[FinanceCloseExecutionService]
})
export class FinanceCloseExecutionModule {}
