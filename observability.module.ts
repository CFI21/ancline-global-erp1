import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ObservabilityController } from './observability.controller';
@Global()
@Module({providers:[MetricsService],controllers:[ObservabilityController],exports:[MetricsService]})
export class ObservabilityModule {}
