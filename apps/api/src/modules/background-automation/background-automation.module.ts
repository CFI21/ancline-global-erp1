import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowAutomationModule } from '../workflow-automation/workflow-automation.module';
import { EnterpriseReportingModule } from '../enterprise-reporting/enterprise-reporting.module';
import { EnterpriseRiskModule } from '../enterprise-risk/enterprise-risk.module';
import { ConnectivityModule } from '../connectivity/connectivity.module';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { BackgroundAutomationController } from './background-automation.controller';
import { BackgroundAutomationService } from './background-automation.service';

@Module({imports:[PrismaModule,AuditModule,AuthModule,WorkflowAutomationModule,EnterpriseReportingModule,EnterpriseRiskModule,ConnectivityModule,DataQualityModule],controllers:[BackgroundAutomationController],providers:[BackgroundAutomationService],exports:[BackgroundAutomationService]})
export class BackgroundAutomationModule {}
