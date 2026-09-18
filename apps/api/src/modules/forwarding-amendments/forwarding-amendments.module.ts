import { Module } from '@nestjs/common';
import { ForwardingAmendmentsController } from './forwarding-amendments.controller';
import { ForwardingAmendmentsService } from './forwarding-amendments.service';

@Module({controllers:[ForwardingAmendmentsController],providers:[ForwardingAmendmentsService]})
export class ForwardingAmendmentsModule {}
