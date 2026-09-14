import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
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
import { OperationsModule } from './modules/operations/operations.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { SpecialCargoModule } from './modules/special-cargo/special-cargo.module';
import { DocumentOpsModule } from './modules/document-ops/document-ops.module';
import { LandsideModule } from './modules/landside/landside.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { AutomationModule } from './modules/automation/automation.module';
import { UatModule } from './modules/uat/uat.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { RoutingModule } from './modules/routing/routing.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ObservabilityModule,
    AuthModule,
    HealthModule,
    BookingsModule,
    OrganizationsModule,
    RatesModule,
    DocumentsModule,
    FinanceModule,
    TasksModule,
    ApprovalsModule,
    StorageModule,
    PortalModule,
    DiagnosticsModule,
    OperationsModule,
    FleetModule,
    SpecialCargoModule,
    DocumentOpsModule,
    LandsideModule,
    CommercialModule,
    GovernanceModule,
    AutomationModule,
    UatModule,
    TrackingModule,
    RoutingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggingMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
