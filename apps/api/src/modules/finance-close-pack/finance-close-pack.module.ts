import { Module } from '@nestjs/common';
import { FinanceCloseExecutionModule } from '../finance-close-execution/finance-close-execution.module';
import { FinanceClosePackController } from './finance-close-pack.controller';
import { FinanceClosePackService } from './finance-close-pack.service';

@Module({
  imports:[FinanceCloseExecutionModule],
  controllers:[FinanceClosePackController],
  providers:[FinanceClosePackService]
})
export class FinanceClosePackModule {}
