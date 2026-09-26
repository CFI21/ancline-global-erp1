import { GeneralLedgerService } from '../src/modules/general-ledger/general-ledger.service';

describe('GL explicit entitlement boundary',()=>{
  const prisma:any={
    integrationEvent:{
      findMany:jest.fn().mockResolvedValue([]),
      findFirst:jest.fn().mockResolvedValue(null),
      create:jest.fn(async({data}:any)=>({id:'e1',createdAt:new Date(),...data}))
    }
  };
  const scope:any={};
  const audit:any={log:jest.fn(async()=>({ok:true}))};
  const service=new GeneralLedgerService(prisma,scope,audit);

  it.each(['FINANCE','BRANCH_OPS','CONTROL_TOWER','AGENT'])('does not grant GL view automatically to %s',async(role)=>{
    await expect(service.periods({sub:'u',role,permissions:[]} as any)).rejects.toThrow('Explicit GL_VIEW entitlement required');
  });

  it('allows a specifically entitled user to view GL setup',async()=>{
    await expect(service.periods({sub:'u',role:'FINANCE',permissions:['GL_VIEW']} as any)).resolves.toEqual([]);
  });

  it('does not allow GL_VIEW alone to create journals',async()=>{
    await expect(service.createJournal({journalDate:'2026-09-26'}, {sub:'u',role:'FINANCE',permissions:['GL_VIEW']} as any))
      .rejects.toThrow('Explicit JOURNAL_CREATE entitlement required');
  });

  it('does not allow GL_VIEW alone to close periods',async()=>{
    await expect(service.closePeriod('2026-09',{sub:'u',role:'FINANCE',permissions:['GL_VIEW']} as any))
      .rejects.toThrow('Explicit PERIOD_CLOSE entitlement required');
  });

  it('keeps Global Admin as finance configuration administrator',async()=>{
    await expect(service.periods({sub:'admin',role:'GLOBAL_ADMIN',permissions:[]} as any)).resolves.toEqual([]);
  });
});
