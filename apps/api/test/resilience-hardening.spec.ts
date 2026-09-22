import {readFileSync} from 'fs';
import {resolve} from 'path';

const read=(...parts:string[])=>readFileSync(resolve(__dirname,...parts),'utf8');

describe('Final ECOM resilience hardening contracts',()=>{
  it('uses database-backed deterministic claims for workflow idempotency',()=>{
    const s=read('../src/modules/workflow-automation/workflow-automation.service.ts');
    expect(s).toContain("objectType:'AutomationIdempotency'");
    expect(s).toContain("eventType:'IDEMPOTENCY_CLAIMED'");
    expect(s).toContain("createHash('sha256')");
    expect(s).toContain("String(e?.code||'')==='P2002'");
    expect(s).toContain("duplicate:true");
  });

  it('deduplicates simultaneous provider callbacks by source and external id',()=>{
    const s=read('../src/modules/integrations/integrations.service.ts');
    expect(s).toContain("sourceSystem+'|'+externalId");
    expect(s).toContain("id:dedupeId");
    expect(s).toContain("Duplicate event");
    expect(s).toContain("DEAD_LETTER");
    expect(s).toContain("nextRetryAt");
  });

  it('makes referenced accounting payments idempotent under concurrency',()=>{
    const s=read('../src/modules/accounting/accounting.service.ts');
    expect(s).toContain("this.deterministicId('PAYREF',invoiceNo+'|'+reference)");
    expect(s).toContain("duplicatePaymentReference");
    expect(s).toContain("Payment reference was already used with different amount or currency");
  });

  it('keeps browser security headers restrictive while permitting Next hydration',()=>{
    const s=read('../../web/middleware.ts');
    expect(s).toContain("X-Frame-Options','DENY'");
    expect(s).toContain("X-Content-Type-Options','nosniff'");
    expect(s).toContain("object-src 'none'");
    expect(s).toContain("frame-ancestors 'none'");
    expect(s).not.toContain("'unsafe-eval'");
  });

  it('keeps exact-image automatic recovery in the hardened release workflow',()=>{
    const s=read('../../../.github/workflows/smart-release.yml');
    expect(s).toContain('Trigger exact approved-image rollback through Render API');
    expect(s).toContain('Render API automatic rollback + runtime recovery PASS');
    expect(s).toContain('approved-digests.json');
  });
  it('registers only the canonical integrations controller for the /integrations route family',()=>{
    const operations=read('../src/modules/operations/operations.module.ts');
    expect(operations).not.toContain("IntegrationsController");
    expect(operations).not.toContain("IntegrationsService");
    const canonical=read('../src/modules/integrations/integrations.module.ts');
    expect(canonical).toContain("controllers:[IntegrationsController]");
    const app=read('../src/app.module.ts');
    expect(app).toContain("IntegrationsModule");
  });

});
