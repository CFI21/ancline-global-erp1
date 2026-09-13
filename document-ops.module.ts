import { Module } from '@nestjs/common';
import { DocumentOpsController } from './document-ops.controller';
import { DocumentOpsService } from './document-ops.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
@Module({imports:[AuditModule,AuthModule],controllers:[DocumentOpsController],providers:[DocumentOpsService]})
export class DocumentOpsModule{}
