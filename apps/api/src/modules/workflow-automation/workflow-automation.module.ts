import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { WorkflowAutomationController } from './workflow-automation.controller';
import { WorkflowAutomationService } from './workflow-automation.service';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[WorkflowAutomationController],providers:[WorkflowAutomationService]})
export class WorkflowAutomationModule {}
