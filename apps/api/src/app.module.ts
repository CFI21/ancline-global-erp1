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
import { AccountingModule } from './modules/accounting/accounting.module';
import { CreditControlModule } from './modules/credit-control/credit-control.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { StorageModule } from './modules/storage/storage.module';
import { PortalModule } from './modules/portal/portal.module';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { UatModule } from './modules/uat.module';
import { OperationsModule } from './modules/operations/operations.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { RoutingModule } from './modules/routing/routing.module';
import { ContainerMovementsModule } from './modules/container-movements/container-movements.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { TransportModule } from './modules/transport/transport.module';
import { CustomsModule } from './modules/customs/customs.module';
import { ShipmentControlModule } from './modules/shipment-control/shipment-control.module';
import { CommercialModule } from './modules/commercial/commercial.module';

@Module({
  imports:[
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
    AccountingModule,
    CreditControlModule,
    TasksModule,
    ApprovalsModule,
    StorageModule,
    PortalModule,
    DiagnosticsModule,
    UatModule,
    OperationsModule,
    TrackingModule,
    RoutingModule,
    ContainerMovementsModule,
    SchedulesModule,
    IntegrationsModule,
    TransportModule,
    CustomsModule,
    ShipmentControlModule,
    CommercialModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer:MiddlewareConsumer){
    consumer.apply(RequestLoggingMiddleware).forRoutes({path:'{*path}',method:RequestMethod.ALL});
  }
}
