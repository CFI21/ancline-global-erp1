import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WorkflowAutomationModule } from '../workflow-automation/workflow-automation.module';
@Module({imports:[WorkflowAutomationModule],controllers:[TasksController],providers:[TasksService]})
export class TasksModule {}
