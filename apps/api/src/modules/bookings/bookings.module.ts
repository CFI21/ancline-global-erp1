import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { EnterpriseRiskModule } from '../enterprise-risk/enterprise-risk.module';
@Module({imports:[EnterpriseRiskModule],controllers:[BookingsController],providers:[BookingsService]})
export class BookingsModule {}
