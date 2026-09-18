import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[IntegrationsController],providers:[IntegrationsService],exports:[IntegrationsService]})
export class IntegrationsModule {}
