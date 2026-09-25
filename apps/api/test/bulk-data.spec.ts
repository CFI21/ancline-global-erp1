import { BulkDataService } from '../src/modules/bulk-data/bulk-data.service';

type Row={id:string;[key:string]:any};

function mockPrisma(){
  let seq=0;
  const state:{organizations:Row[];rates:Row[];bookings:Row[];events:Row[];audits:Row[]}={
    organizations:[],rates:[],bookings:[],events:[],audits:[]
  };
  const id=()=>String(++seq);
  const clone=(x:any)=>structuredClone(x);
  const matchIn=(value:any,where:any)=>!where||!where.in||where.in.includes(value);

  const db:any={
    organization:{
      findUnique:async({where}:any)=>state.organizations.find(x=>x.code===where.code)||null,
      findMany:async({where}:any)=>state.organizations.filter(x=>matchIn(x.code,where?.code)),
      create:async({data}:any)=>{const row={id:id(),...clone(data)};state.organizations.push(row);return row;},
      update:async({where,data}:any)=>{const row=state.organizations.find(x=>x.code===where.code);if(!row)throw new Error('organization missing');Object.assign(row,clone(data));return row;}
    },
    rateQuote:{
      findUnique:async({where}:any)=>state.rates.find(x=>x.quoteNo===where.quoteNo)||null,
      findMany:async({where}:any)=>state.rates.filter(x=>matchIn(x.quoteNo,where?.quoteNo)),
      create:async({data}:any)=>{const row={id:id(),...clone(data)};state.rates.push(row);return row;},
      update:async({where,data}:any)=>{const row=state.rates.find(x=>x.quoteNo===where.quoteNo);if(!row)throw new Error('rate missing');Object.assign(row,clone(data));return row;}
    },
    booking:{
      findUnique:async({where}:any)=>state.bookings.find(x=>x.bookingNo===where.bookingNo)||null,
      findMany:async({where}:any)=>state.bookings.filter(x=>matchIn(x.bookingNo,where?.bookingNo)),
      create:async({data}:any)=>{const row={id:id(),...clone(data)};state.bookings.push(row);return row;},
      update:async({where,data}:any)=>{const row=state.bookings.find(x=>x.bookingNo===where.bookingNo);if(!row)throw new Error('booking missing');Object.assign(row,clone(data));return row;}
    },
    integrationEvent:{
      deleteMany:async({where}:any)=>{state.events=state.events.filter(x=>!(x.sourceSystem===where.sourceSystem&&x.objectType===where.objectType&&x.objectId===where.objectId&&x.eventType===where.eventType));return {count:0};},
      create:async({data}:any)=>{const row={id:id(),...clone(data)};state.events.push(row);return row;}
    },
    auditEvent:{
      create:async({data}:any)=>{const row={id:id(),...clone(data)};state.audits.push(row);return row;}
    }
  };
  const prisma:any={...db,$transaction:async(fn:any)=>{
    const snapshot=clone(state);
    try{return await fn(db);}
    catch(e){state.organizations=snapshot.organizations;state.rates=snapshot.rates;state.bookings=snapshot.bookings;state.events=snapshot.events;state.audits=snapshot.audits;throw e;}
  }};
  return {prisma,state};
}

const admin={sub:'uat-admin',email:'uat@ancline.invalid',role:'GLOBAL_ADMIN'};

describe('BulkDataService safety and privacy',()=>{
  it('blocks missing references before any rate write',async()=>{
    const {prisma,state}=mockPrisma();
    const service=new BulkDataService(prisma);
    const result=await service.importRows({type:'RATE',rows:[{
      quoteNo:'Q-MISSING',customerCode:'NO-CUSTOMER',trade:'NLRTM-AEJEA',equipment:'40HC',
      buyRate:'1000',sellRate:'1200',currency:'USD',validFrom:'2026-09-01',validTo:'2026-12-31'
    }]},admin);
    expect(result.committed).toBe(false);
    expect(result.results[0].errors).toContain('Customer NO-CUSTOMER not found');
    expect(state.rates).toHaveLength(0);
  });

  it('imports customer -> carrier -> rate -> booking while keeping carrier payloads customer-safe',async()=>{
    const {prisma,state}=mockPrisma();
    const service=new BulkDataService(prisma);

    expect((await service.importRows({type:'CUSTOMER',rows:[{
      code:'CUST-01',name:'Secret Customer',countryCode:'NL',customerRef:'ANC-CUST-SECRET',
      kycStatus:'APPROVED',contactName:'Private Person',contactEmail:'private@example.invalid'
    }]},admin)).committed).toBe(true);

    expect((await service.importRows({type:'CARRIER',rows:[{
      code:'CAR-01',name:'Test Carrier',countryCode:'SG',providerCode:'CARRIER_API',accountCode:'ANC-CARRIER-ACCOUNT'
    }]},admin)).committed).toBe(true);

    expect((await service.importRows({type:'RATE',rows:[{
      quoteNo:'Q-01',customerCode:'CUST-01',carrierCode:'CAR-01',providerCode:'CARRIER_API',
      trade:'NLRTM-AEJEA',equipment:'40HC',buyRate:'1000',sellRate:'1250',currency:'USD',
      validFrom:'2026-09-01',validTo:'2026-12-31',status:'APPROVED'
    }]},admin)).committed).toBe(true);

    expect((await service.importRows({type:'BOOKING',rows:[{
      bookingNo:'BKG-01',customerCode:'CUST-01',rateQuoteNo:'Q-01',businessModel:'FORWARDING',
      origin:'NLRTM',destination:'AEJEA',carrierCode:'CAR-01',equipment:'40HC',quantity:'1',
      customerReference:'CUSTOMER-PRIVATE-REF',houseBL:'ANC-PRIVATE-HBL',status:'BOOKING_REQUESTED'
    }]},admin)).committed).toBe(true);

    const provider=state.events.find(x=>x.objectType==='CarrierRateProvider');
    expect(provider).toBeDefined();
    expect(provider!.payload.dataProtection).toEqual({
      customerKycOutbound:false,
      customerReferenceOutbound:false,
      houseBlOutbound:false,
      housePartiesOutbound:false
    });
    const providerJson=JSON.stringify(provider!.payload);
    expect(providerJson).not.toContain('ANC-CUST-SECRET');
    expect(providerJson).not.toContain('CUSTOMER-PRIVATE-REF');
    expect(providerJson).not.toContain('ANC-PRIVATE-HBL');
    expect(providerJson).not.toContain('Private Person');

    const rate=state.rates.find(x=>x.quoteNo==='Q-01');
    expect(rate).toBeDefined();
    expect(rate!.carrierOfferData.customerKycOutbound).toBe(false);
    expect(rate!.carrierOfferData.customerReferenceOutbound).toBe(false);
    expect(rate!.carrierOfferData.houseBlOutbound).toBe(false);
    expect(rate!.carrierOfferData.housePartiesOutbound).toBe(false);
    expect(JSON.stringify(rate!.carrierOfferData)).not.toContain('ANC-CUST-SECRET');

    const booking=state.bookings.find(x=>x.bookingNo==='BKG-01');
    expect(booking).toBeDefined();
    expect(booking!.customerReference).toBe('CUSTOMER-PRIVATE-REF');
    expect(booking!.houseBL).toBe('ANC-PRIVATE-HBL');

    const bulkEvents=state.events.filter(x=>x.objectType==='BulkDataImport');
    expect(bulkEvents).toHaveLength(4);
    for(const event of bulkEvents){
      expect(event.payload.customerKycOutbound).toBe(false);
      expect(event.payload.customerReferenceOutbound).toBe(false);
      expect(event.payload.houseBlOutbound).toBe(false);
      expect(event.payload.housePartiesOutbound).toBe(false);
    }
  });

  it('rejects a forwarding booking when its quote belongs to another customer',async()=>{
    const {prisma,state}=mockPrisma();
    const service=new BulkDataService(prisma);
    for(const code of ['CUST-A','CUST-B']){
      await service.importRows({type:'CUSTOMER',rows:[{code,name:code,countryCode:'NL'}]},admin);
    }
    await service.importRows({type:'RATE',rows:[{
      quoteNo:'Q-A',customerCode:'CUST-A',trade:'NLRTM-SGSIN',equipment:'20GP',
      buyRate:'800',sellRate:'950',currency:'USD',validFrom:'2026-09-01',validTo:'2026-12-31'
    }]},admin);

    const before=state.bookings.length;
    const result=await service.importRows({type:'BOOKING',rows:[{
      bookingNo:'BKG-BAD',customerCode:'CUST-B',rateQuoteNo:'Q-A',businessModel:'FORWARDING',
      origin:'NLRTM',destination:'SGSIN'
    }]},admin);

    expect(result.committed).toBe(false);
    expect(result.results[0].errors).toContain('Rate quote Q-A belongs to another customer');
    expect(state.bookings).toHaveLength(before);
  });

  it('rejects duplicate business keys in the same batch',async()=>{
    const {prisma}=mockPrisma();
    const service=new BulkDataService(prisma);
    const result=await service.validate({type:'CUSTOMER',rows:[
      {code:'DUP-01',name:'One',countryCode:'NL'},
      {code:'dup-01',name:'Two',countryCode:'NL'}
    ]},admin);
    expect(result.invalid).toBe(2);
    expect(result.results[0].errors[0]).toContain('Duplicate CUSTOMER key DUP-01');
    expect(result.results[1].errors[0]).toContain('Duplicate CUSTOMER key DUP-01');
  });
  it('enforces IMPORT, UPDATE and UPSERT modes without partial writes',async()=>{
    const {prisma,state}=mockPrisma();
    const service=new BulkDataService(prisma);

    const first=await service.importRows({type:'CUSTOMER',mode:'IMPORT',rows:[
      {code:'MODE-01',name:'Mode Customer',countryCode:'NL'}
    ]},admin);
    expect(first.committed).toBe(true);
    expect(first.mode).toBe('IMPORT');

    const duplicateImport=await service.importRows({type:'CUSTOMER',mode:'IMPORT',rows:[
      {code:'MODE-01',name:'Duplicate',countryCode:'NL'}
    ]},admin);
    expect(duplicateImport.committed).toBe(false);
    expect(duplicateImport.results[0].errors.join(' ')).toContain('already exists');
    expect(state.organizations.find(x=>x.code==='MODE-01')!.name).toBe('Mode Customer');

    const missingUpdate=await service.importRows({type:'CUSTOMER',mode:'UPDATE',rows:[
      {code:'MODE-MISSING',name:'Missing',countryCode:'NL'}
    ]},admin);
    expect(missingUpdate.committed).toBe(false);
    expect(missingUpdate.results[0].errors.join(' ')).toContain('does not exist');

    const update=await service.importRows({type:'CUSTOMER',mode:'UPDATE',rows:[
      {code:'MODE-01',name:'Mode Customer Updated',countryCode:'NL'}
    ]},admin);
    expect(update.committed).toBe(true);
    expect(update.mode).toBe('UPDATE');
    expect(state.organizations.find(x=>x.code==='MODE-01')!.name).toBe('Mode Customer Updated');

    const upsert=await service.importRows({type:'CUSTOMER',mode:'UPSERT',rows:[
      {code:'MODE-02',name:'Upsert Customer',countryCode:'NL'}
    ]},admin);
    expect(upsert.committed).toBe(true);
    expect(state.organizations.some(x=>x.code==='MODE-02')).toBe(true);

    const actions=state.audits.map(x=>x.action);
    expect(actions).toContain('BULK_DATA_IMPORT');
    expect(actions).toContain('BULK_DATA_UPDATE');
    expect(actions).toContain('BULK_DATA_UPSERT');
  });

  it('rolls back the full batch if execution fails after validation',async()=>{
    const {prisma,state}=mockPrisma();
    const service=new BulkDataService(prisma);
    const originalCreate=prisma.organization.create;
    let creates=0;
    prisma.organization.create=async(args:any)=>{
      creates++;
      if(creates===2)throw new Error('synthetic execution failure');
      return originalCreate(args);
    };
    const result=await service.importRows({type:'CUSTOMER',mode:'IMPORT',rows:[
      {code:'ROLL-01',name:'Rollback One',countryCode:'NL'},
      {code:'ROLL-02',name:'Rollback Two',countryCode:'NL'}
    ]},admin);
    expect(result.committed).toBe(false);
    expect(state.organizations.filter(x=>x.code.startsWith('ROLL-'))).toHaveLength(0);
    expect(result.results[1].error).toContain('synthetic execution failure');
  });

});
