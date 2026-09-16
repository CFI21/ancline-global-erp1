import { Module } from '@nestjs/common';
import { MonthEndController } from './month-end.controller';
import { MonthEndService } from './month-end.service';

@Module({controllers:[MonthEndController],providers:[MonthEndService]})
export class MonthEndModule {}
