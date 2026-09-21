import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'online',
      service: 'ANCLINE API',
      runtimeRole: 'staging-api',
      releasePipeline: 'smart-release-v3',
      deploymentTier: process.env.ANCLINE_DEPLOYMENT_TIER || 'unknown',
      buildCommit: process.env.ANCLINE_BUILD_COMMIT || process.env.ANCLINE_RELEASE_COMMIT || 'unknown',
    };
  }
}
