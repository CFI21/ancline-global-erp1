import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';
@Controller('observability')
export class ObservabilityController {
  constructor(private m:MetricsService){}
  @Get('metrics') metrics(){return this.m.snapshot();}
  @Get('ready') ready(){return {status:'ready',timestamp:new Date().toISOString()};}
}
