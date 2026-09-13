import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { RatesModule } from './modules/rates/rates.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FinanceModule } from './modules/finance/finance.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { StorageModule } from './modules/storage/storage.module';
import { PortalModule } from './modules/portal/portal.module';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { UatModule } from './modules/uat.module';

@Module({
  imports:[
    PrismaModule,AuditModule,ObservabilityModule,AuthModule,HealthModule,BookingsModule,
    OrganizationsModule,RatesModule,DocumentsModule,FinanceModule,TasksModule,
    ApprovalsModule,StorageModule,PortalModule,DiagnosticsModule,UatModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer:MiddlewareConsumer){
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
