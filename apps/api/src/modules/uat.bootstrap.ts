import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UatService } from './uat.service';
import { ReleaseEvidenceService } from './release-evidence/release-evidence.service';

@Injectable()
export class UatBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UatBootstrapService.name);

  constructor(
    private readonly uat: UatService,
    private readonly evidence: ReleaseEvidenceService,
  ) {}

  async onApplicationBootstrap() {
    if (String(process.env.UAT_RUN_ON_STARTUP || '').toLowerCase() !== 'true') {
      this.evidence.skipUat('UAT_RUN_ON_STARTUP=false');
      return;
    }

    this.logger.log('[UAT_BOOTSTRAP] START');
    try {
      const result = await this.uat.run(
        {
          role: 'GLOBAL_ADMIN',
          sub: 'uat-bootstrap',
          email: 'uat-bootstrap@ancline.local',
        },
        { cleanup: true },
      );
      this.evidence.recordUat(result);
      const failedSteps = Array.isArray(result?.steps)
        ? result.steps.filter((step: any) => step?.status === 'FAIL').map((step: any) => ({ name: step.name, error: step.error }))
        : [];
      this.logger.log(
        `[UAT_BOOTSTRAP] RESULT ${JSON.stringify({
          releaseCommit: process.env.ANCLINE_BUILD_COMMIT || process.env.ANCLINE_RELEASE_COMMIT || 'unknown',
          runId: result?.runId,
          status: result?.status,
          cleanup: result?.cleanup,
          summary: result?.summary,
          error: result?.error,
          failedSteps,
        })}`,
      );
    } catch (error: any) {
      this.evidence.recordUatFailure(error);
      this.logger.error(`[UAT_BOOTSTRAP] CRASH ${error?.message || String(error)}`);
    }
  }
}
