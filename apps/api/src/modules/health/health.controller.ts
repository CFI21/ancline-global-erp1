import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'online',
      service: 'ANCLINE API',
      phase: 'production-phase-1',
      buildCommit: process.env.ANCLINE_BUILD_COMMIT || process.env.ANCLINE_RELEASE_COMMIT || 'unknown',
    };
  }
}
