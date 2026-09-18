import { Module } from '@nestjs/common';
import { GlobalCommerceController } from './global-commerce.controller';
import { GlobalCommerceService } from './global-commerce.service';

@Module({controllers:[GlobalCommerceController],providers:[GlobalCommerceService],exports:[GlobalCommerceService]})
export class GlobalCommerceModule {}
