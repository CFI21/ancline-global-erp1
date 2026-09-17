import { Module } from '@nestjs/common';
import { CommercialGuardrailsController } from './commercial-guardrails.controller';
import { CommercialGuardrailsService } from './commercial-guardrails.service';
@Module({controllers:[CommercialGuardrailsController],providers:[CommercialGuardrailsService],exports:[CommercialGuardrailsService]})
export class CommercialGuardrailsModule {}
