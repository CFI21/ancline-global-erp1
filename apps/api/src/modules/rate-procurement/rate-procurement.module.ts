import { Module } from '@nestjs/common';
import { RateProcurementController } from './rate-procurement.controller';
import { RateProcurementService } from './rate-procurement.service';

@Module({controllers:[RateProcurementController],providers:[RateProcurementService]})
export class RateProcurementModule {}
