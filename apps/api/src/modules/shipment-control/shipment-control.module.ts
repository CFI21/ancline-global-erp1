import { Module } from '@nestjs/common';
import { ShipmentControlController } from './shipment-control.controller';
import { ShipmentControlService } from './shipment-control.service';

@Module({controllers:[ShipmentControlController],providers:[ShipmentControlService]})
export class ShipmentControlModule {}
