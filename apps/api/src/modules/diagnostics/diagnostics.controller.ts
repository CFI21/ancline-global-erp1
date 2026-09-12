import { Controller, Get } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private s:DiagnosticsService){}
  @Get('staging-readiness') readiness(){return this.s.readiness();}
}
