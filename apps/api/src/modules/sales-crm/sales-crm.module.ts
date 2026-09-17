import { Module } from '@nestjs/common';
import { SalesCrmController } from './sales-crm.controller';
import { SalesCrmService } from './sales-crm.service';
@Module({controllers:[SalesCrmController],providers:[SalesCrmService]})
export class SalesCrmModule{}
