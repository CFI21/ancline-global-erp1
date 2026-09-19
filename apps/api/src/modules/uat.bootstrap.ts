import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UatService } from './uat.service';

@Injectable()
export class UatBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UatBootstrapService.name);

  constructor(private readonly uat: UatService) {}

  async onApplicationBootstrap() {
    if (String(process.env.UAT_RUN_ON_STARTUP || '').toLowerCase() !== 'true') return;

    this.logger.log('[UAT_BOOTSTRAP] START');
    try {
      const profile=String(process.env.UAT_RUN_PROFILE||'FULL_TRANSACTION').toUpperCase();
      const principal={
        role:'GLOBAL_ADMIN',
        sub:'uat-bootstrap',
        email:'uat-bootstrap@ancline.local',
      };
      const result=profile==='EXCEPTION_FAILURE'
        ? await this.uat.runExceptionFailure(principal,{cleanup:true})
        : await this.uat.run(principal,{cleanup:true});
      const failedSteps = Array.isArray(result?.steps)
        ? result.steps.filter((step: any) => step?.status === 'FAIL').map((step: any) => ({ name: step.name, error: step.error }))
        : [];
      this.logger.log(
        `[UAT_BOOTSTRAP] RESULT ${JSON.stringify({
          runId: result?.runId,
          profile: result?.profile,
          status: result?.status,
          cleanup: result?.cleanup,
          summary: result?.summary,
          error: result?.error,
          failedSteps,
        })}`,
      );
    } catch (error: any) {
      this.logger.error(`[UAT_BOOTSTRAP] CRASH ${error?.message || String(error)}`);
    }
  }
}
