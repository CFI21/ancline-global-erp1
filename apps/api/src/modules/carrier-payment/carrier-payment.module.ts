import { Module } from '@nestjs/common';
import { CarrierPaymentController } from './carrier-payment.controller';
import { CarrierPaymentService } from './carrier-payment.service';

@Module({controllers:[CarrierPaymentController],providers:[CarrierPaymentService]})
export class CarrierPaymentModule {}
