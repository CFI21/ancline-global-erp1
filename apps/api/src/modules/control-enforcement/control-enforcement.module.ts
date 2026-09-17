import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { WorkflowAutomationModule } from '../workflow-automation/workflow-automation.module';
import { ControlEnforcementInterceptor } from './control-enforcement.interceptor';

@Module({imports:[PrismaModule,AuditModule,DataQualityModule,WorkflowAutomationModule],providers:[ControlEnforcementInterceptor,{provide:APP_INTERCEPTOR,useExisting:ControlEnforcementInterceptor}]})
export class ControlEnforcementModule {}
