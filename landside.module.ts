import { Module } from '@nestjs/common';
import { LandsideController } from './landside.controller';
import { LandsideService } from './landside.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
@Module({imports:[AuditModule,AuthModule],controllers:[LandsideController],providers:[LandsideService]})
export class LandsideModule{}
