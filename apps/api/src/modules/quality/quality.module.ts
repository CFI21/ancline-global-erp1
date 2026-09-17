import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({imports:[PrismaModule,AuthModule],controllers:[QualityController],providers:[QualityService]})
export class QualityModule {}
