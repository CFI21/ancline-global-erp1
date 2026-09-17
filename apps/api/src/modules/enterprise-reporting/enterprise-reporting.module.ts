import { Module } from '@nestjs/common';
import { EnterpriseReportingController } from './enterprise-reporting.controller';
import { EnterpriseReportingService } from './enterprise-reporting.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[EnterpriseReportingController],providers:[EnterpriseReportingService],exports:[EnterpriseReportingService]})
export class EnterpriseReportingModule {}
