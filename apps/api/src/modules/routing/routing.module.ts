import { Module } from '@nestjs/common';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[RoutingController],providers:[RoutingService]})
export class RoutingModule {}
