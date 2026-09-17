import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { DataQualityController } from './data-quality.controller';
import { DataQualityService } from './data-quality.service';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[DataQualityController],providers:[DataQualityService],exports:[DataQualityService]})
export class DataQualityModule {}
