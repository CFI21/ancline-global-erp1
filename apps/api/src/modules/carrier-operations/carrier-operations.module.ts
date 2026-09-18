import { Module } from '@nestjs/common';
import { CarrierOperationsController } from './carrier-operations.controller';
import { CarrierOperationsService } from './carrier-operations.service';

@Module({controllers:[CarrierOperationsController],providers:[CarrierOperationsService]})
export class CarrierOperationsModule {}
