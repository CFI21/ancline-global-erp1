import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
@Module({imports:[PrismaModule,AuditModule],controllers:[GovernanceController],providers:[GovernanceService]})
export class GovernanceModule {}
