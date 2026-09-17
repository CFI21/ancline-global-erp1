import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseRiskController } from './enterprise-risk.controller';
import { EnterpriseRiskService } from './enterprise-risk.service';

@Module({imports:[PrismaModule,AuthModule],controllers:[EnterpriseRiskController],providers:[EnterpriseRiskService],exports:[EnterpriseRiskService]})
export class EnterpriseRiskModule {}
