import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private counters=new Map<string,number>();
  inc(name:string,by=1){this.counters.set(name,(this.counters.get(name)||0)+by);}
  snapshot(){
    return {
      service:'ancline-api',
      uptimeSeconds:Math.round(process.uptime()),
      memory:process.memoryUsage(),
      counters:Object.fromEntries(this.counters.entries()),
      timestamp:new Date().toISOString()
    };
  }
}
