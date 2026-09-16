import { Module } from '@nestjs/common';
import { StatutoryFinanceController } from './statutory-finance.controller';
import { StatutoryFinanceService } from './statutory-finance.service';

@Module({controllers:[StatutoryFinanceController],providers:[StatutoryFinanceService]})
export class StatutoryFinanceModule {}
