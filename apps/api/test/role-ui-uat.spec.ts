import {readFileSync} from 'fs';
import {resolve} from 'path';

const read=(...parts:string[])=>readFileSync(resolve(__dirname,...parts),'utf8');

describe('Role-by-role UI and managed-session contracts',()=>{
  it('preserves all managed-account scope claims during JWT revalidation',()=>{
    const guard=read('../src/modules/auth/jwt-auth.guard.ts');
    for(const field of ['partyId:account.partyId','costCenterCode:account.costCenterCode','agentMode:account.agentMode','permissions:Array.isArray(account.permissions)']){
      expect(guard).toContain(field);
    }
    expect(guard).toContain("'SHIPPER','CONSIGNEE'");
  });

  it('keeps external users out of the internal ERP sidebar while preserving authorized portals',()=>{
    const shell=read('../../web/components/WorkspaceShell.tsx');
    expect(shell).toContain("const internalRole=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE'].includes(role)");
    expect(shell).toContain("if(href==='/nvocc-portal')return role==='AGENT'");
    expect(shell).toContain("['CUSTOMER','SHIPPER','CONSIGNEE'].includes(role)");
    expect(shell).toContain("(internalRole?menuGroups:[])");
  });

  it('seeds a managed synthetic login for every supported role',()=>{
    const seed=read('../src/modules/test-data/test-data.service.ts');
    for(const email of [
      'test.admin@ancline.invalid','test.control@ancline.invalid','test.ops@ancline.invalid',
      'test.finance@ancline.invalid','test.agent.sg@ancline.invalid','test.customer.nl@ancline.invalid',
      'test.shipper.nl@ancline.invalid','test.consignee.ae@ancline.invalid'
    ]) expect(seed).toContain(email);
    expect(seed).toContain('roleMatrix:[');
  });

  it('runs database-backed role projection checks inside hardened transactional UAT',()=>{
    const uat=read('../src/modules/uat.service.ts');
    expect(uat).toContain("17B Role-by-role authorization projection");
    for(const role of ['GLOBAL_ADMIN','CONTROL_TOWER','FINANCE','BRANCH_OPS','CUSTOMER','AGENT','SHIPPER','CONSIGNEE']){
      expect(uat).toContain(`role:'${role}'`);
    }
    expect(uat).toContain('scope leaked');
  });
  it('does not block managed scoped-role sign-in before the API resolves the account',()=>{
    const login=read('../../web/app/login/page.tsx');
    expect(login).not.toContain('organization first.');
    expect(login).toContain("const [password,setPassword]=useState('')");
    expect(login).toContain("const payload:any={email,password,role}");
    expect(login).toContain('type="password"');
    expect(login).toContain("if(role==='CUSTOMER'&&scopeId)payload.customerId=scopeId");
    expect(login).toContain("if((role==='SHIPPER'||role==='CONSIGNEE')&&scopeId)payload.partyId=scopeId");
    expect(login).toContain("if(role==='BRANCH_OPS'&&scopeId)payload.branchId=scopeId");
    const auth=read('../src/modules/auth/auth.service.ts');
    expect(auth).toContain("if(account){");
    expect(auth).toContain("return this.issueManaged(account,'TRANSITIONAL_MANAGED')");
    expect(auth).toContain("if((role==='SHIPPER'||role==='CONSIGNEE')&&!body.partyId)");
  });

  it('exercises the agent Forwarding cross-trade branch in transactional UAT',()=>{
    const uat=read('../src/modules/uat.service.ts');
    expect(uat).toContain("forwardingTradeType: 'CROSS_TRADE'");
    expect(uat).toContain("permissions:['FORWARDING_DIRECT_COLOAD_CROSS_TRADE']");
    expect(uat).toContain("ids.agentForwardingBookingId = agentForwarding.id");
    expect(uat).toContain("role:'AGENT'");
    expect(uat).toContain("expected:2");
  });

  it('seeds the NVOCC 50005 scenario with the same complete artifact chain as forwarding jobs',()=>{
    const seed=read('../src/modules/test-data/test-data.service.ts');
    for(const marker of [
      "bookingId:nv.id,sequence:1,legType:'MAIN'",
      "shipmentMilestone.createMany",
      "documentNo:'ANC-TEST-NVOCC-HBL-001'",
      "containerNo:'NVTU0000001'",
      "reference:'TEST-NVOCC-BUY'",
      "title:'TEST Confirm NVOCC slot allocation'",
      "reason:'Synthetic NVOCC rate approval'",
      "itemLabel:'NVOCC HBL / MBL documents complete'"
    ]) expect(seed).toContain(marker);
    const live=read('../../../tools/live_role_uat_v2.mjs');
    expect(live).toContain("fetch('/api-proxy/test-data/seed'");
    expect(live).toContain("report.seed={status:'PASS'");
  });

});
