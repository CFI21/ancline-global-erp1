import { Module } from '@nestjs/common';
import { CommercialProfitabilityController } from './commercial-profitability.controller';
import { CommercialProfitabilityService } from './commercial-profitability.service';

@Module({controllers:[CommercialProfitabilityController],providers:[CommercialProfitabilityService]})
export class CommercialProfitabilityModule {}
