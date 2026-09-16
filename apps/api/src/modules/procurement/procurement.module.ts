import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementData } from './procurement.data';

@Module({controllers:[ProcurementController],providers:[ProcurementService,ProcurementData]})
export class ProcurementModule {}
