import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { DocumentAutomationController } from './document-automation.controller';
import { DocumentAutomationService } from './document-automation.service';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[DocumentAutomationController],providers:[DocumentAutomationService],exports:[DocumentAutomationService]})
export class DocumentAutomationModule {}
