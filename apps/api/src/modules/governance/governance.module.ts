import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[GovernanceController],providers:[GovernanceService],exports:[GovernanceService]})
export class GovernanceModule {}
