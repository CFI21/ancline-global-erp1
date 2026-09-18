import { Module } from '@nestjs/common';
import { RevenueCloseModule } from '../revenue-close/revenue-close.module';
import { FinanceCloseOrchestrationController } from './finance-close-orchestration.controller';
import { FinanceCloseOrchestrationService } from './finance-close-orchestration.service';

@Module({
  imports:[RevenueCloseModule],
  controllers:[FinanceCloseOrchestrationController],
  providers:[FinanceCloseOrchestrationService],
  exports:[FinanceCloseOrchestrationService]
})
export class FinanceCloseOrchestrationModule {}
