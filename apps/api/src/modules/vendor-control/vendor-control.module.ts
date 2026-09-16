import { Module } from '@nestjs/common';
import { VendorControlController } from './vendor-control.controller';
import { VendorControlService } from './vendor-control.service';

@Module({controllers:[VendorControlController],providers:[VendorControlService]})
export class VendorControlModule {}
