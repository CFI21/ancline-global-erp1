import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { AlertEngineService } from './alert-engine.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({controllers:[OperationsController,IntegrationsController],providers:[OperationsService,AlertEngineService,IntegrationsService]})
export class OperationsModule {}
