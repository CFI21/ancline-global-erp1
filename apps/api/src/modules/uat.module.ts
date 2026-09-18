import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UatController } from './uat.controller';
import { UatService } from './uat.service';
import { IntegrationsModule } from './integrations/integrations.module';
import { UatBootstrapService } from './uat.bootstrap';

const UAT_ENABLED = process.env.UAT_RUNNER_ENABLED === 'true';

@Module({
  imports: UAT_ENABLED ? [AuthModule, PrismaModule, IntegrationsModule] : [],
  controllers: UAT_ENABLED ? [UatController] : [],
  providers: UAT_ENABLED ? [UatService, UatBootstrapService] : [],
})
export class UatModule {}
