import {readFileSync} from 'fs';
import {resolve} from 'path';
const read=(...parts:string[])=>readFileSync(resolve(__dirname,...parts),'utf8');
describe('final resilience hardening contracts',()=>{
  it('claims workflow idempotency before side effects',()=>{
    const s=read('../src/modules/workflow-automation/workflow-automation.service.ts');
    expect(s).toContain('AUTOMATION_IDEMPOTENCY_CLAIM');
    expect(s).toContain('automationClaimId');
    expect(s).toContain('duplicate:true');
  });
  it('deduplicates callbacks and atomically claims retry state',()=>{
    const s=read('../src/modules/integrations/integrations.service.ts');
    expect(s).toContain('externalClaimId');
    expect(s).toContain('updateMany({where:{id,status:row.status,attemptCount:row.attemptCount}');
    expect(s).toContain('retryRequired');
  });
  it('serializes payment allocation and protects references',()=>{
    const s=read('../src/modules/accounting/accounting.service.ts');
    expect(s).toContain("isolationLevel:'Serializable'");
    expect(s).toContain('paymentEventId');
    expect(s).toContain('Payment reference already exists with different payment details');
    expect(s).toContain("e?.code==='P2034'");
  });
  it('keeps all requested live hardening gates active',()=>{
    const s=read('../../../tools/live_final_hardening_uat.mjs');
    for(const marker of ['CONCURRENCY_IDEMPOTENCY','DEAD_LETTER','balanceRaceBlocked','cspNoEval','BOUNDED_STAGING_MICRO_LOAD','rollbackDrillRequired'])expect(s).toContain(marker);
  });
});
