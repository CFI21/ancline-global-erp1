import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UatController } from './uat.controller';
import { UatService } from './uat.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [UatController],
  providers: [UatService],
})
export class UatModule {}
