import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AuditModule } from '../audit/audit.module';
@Module({ imports:[AuditModule], controllers:[AutomationController], providers:[AutomationService] })
export class AutomationModule {}
