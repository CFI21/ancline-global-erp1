import { Module } from '@nestjs/common';
import { ConnectivityController } from './connectivity.controller';
import { ConnectivityService } from './connectivity.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[ConnectivityController],providers:[ConnectivityService],exports:[ConnectivityService]})
export class ConnectivityModule {}
