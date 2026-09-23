import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { AlertEngineService } from './alert-engine.service';
import { OperationsControlService } from './operations-control.service';

@Module({controllers:[OperationsController],providers:[OperationsService,AlertEngineService,OperationsControlService]})
export class OperationsModule {}
