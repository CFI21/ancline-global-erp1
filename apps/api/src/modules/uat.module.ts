import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UatController } from './uat.controller';
import { UatService } from './uat.service';
import { UatBootstrapService } from './uat.bootstrap';

@Module({
  imports: [AuthModule],
  controllers: [UatController],
  providers: [UatService, UatBootstrapService],
})
export class UatModule {}
