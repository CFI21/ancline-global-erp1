import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UatController } from './uat.controller';
import { UatService } from './uat.service';

@Module({
  imports: [AuthModule],
  controllers: [UatController],
  providers: [UatService],
})
export class UatModule {}
