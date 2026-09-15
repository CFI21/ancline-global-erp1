import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CustomsController } from './customs.controller';
import { CustomsService } from './customs.service';

@Module({imports:[PrismaModule,AuthModule,AuditModule],controllers:[CustomsController],providers:[CustomsService]})
export class CustomsModule {}
