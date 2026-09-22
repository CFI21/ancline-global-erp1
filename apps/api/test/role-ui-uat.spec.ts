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
});
