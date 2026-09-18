import { Module } from '@nestjs/common';
import { RevenueCloseController } from './revenue-close.controller';
import { RevenueCloseService } from './revenue-close.service';

@Module({controllers:[RevenueCloseController],providers:[RevenueCloseService],exports:[RevenueCloseService]})
export class RevenueCloseModule {}
