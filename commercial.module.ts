import { Module } from '@nestjs/common';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
@Module({imports:[AuthModule,AuditModule],controllers:[CommercialController],providers:[CommercialService]})
export class CommercialModule {}
