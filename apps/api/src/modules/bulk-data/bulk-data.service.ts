import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SOURCE='ANCLINE_BULK_DATA';
const MAX_ROWS=1000;
const BOOKING_STATUSES=new Set(['DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED','BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE','CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);
const KYC_STATUSES=new Set(['NOT_STARTED','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED']);

type ImportType='CUSTOMER'|'CARRIER'|'RATE'|'BOOKING';
type BulkMode='IMPORT'|'UPDATE'|'UPSERT';

@Injectable()
export class BulkDataService {
  constructor(private prisma:PrismaService){}
  private get db():any{return this.prisma as any;}
  private admin(user:any){if(String(user?.role||'').toUpperCase()!=='GLOBAL_ADMIN')throw new ForbiddenException('Global Admin access required for bulk data import');}
  private text(v:any){return String(v??'').trim();}
  private upper(v:any){return this.text(v).toUpperCase();}
  private bool(v:any,def=true){if(v===undefined||v===null||this.text(v)==='')return def;return ['TRUE','1','YES','Y','ACTIVE'].includes(this.upper(v));}
  private num(v:any,name:string,required=false){if(v===undefined||v===null||this.text(v)===''){if(required)throw new Error(name+' is required');return null;}const n=Number(v);if(!Number.isFinite(n))throw new Error(name+' must be numeric');return n;}
  private int(v:any,name:string){const n=this.num(v,name,false);if(n===null)return null;if(!Number.isInteger(n)||n<0)throw new Error(name+' must be a whole number');return n;}
  private date(v:any,name:string,required=false){if(v===undefined||v===null||this.text(v)===''){if(required)throw new Error(name+' is required');return null;}const d=new Date(v);if(Number.isNaN(d.getTime()))throw new Error(name+' is invalid');return d;}
  private type(v:any):ImportType{const t=this.upper(v).replace(/S$/,'') as ImportType;if(!['CUSTOMER','CARRIER','RATE','BOOKING'].includes(t))throw new BadRequestException('Type must be CUSTOMER, CARRIER, RATE or BOOKING');return t;}
  private mode(v:any):BulkMode{const m=(this.upper(v)||'UPSERT') as BulkMode;if(!['IMPORT','UPDATE','UPSERT'].includes(m))throw new BadRequestException('Mode must be IMPORT, UPDATE or UPSERT');return m;}
  private enforceMode(mode:BulkMode,exists:boolean,key:string){if(mode==='IMPORT'&&exists)throw new Error(key+' already exists; IMPORT mode only creates new records');if(mode==='UPDATE'&&!exists)throw new Error(key+' does not exist; UPDATE mode only changes existing records');}
  private rows(v:any){if(!Array.isArray(v))throw new BadRequestException('rows must be an array');if(!v.length)throw new BadRequestException('At least one row is required');if(v.length>MAX_ROWS)throw new BadRequestException('Maximum '+MAX_ROWS+' rows per import batch');return v;}

  templates(user:any){
    this.admin(user);
    return {
      maxRows:MAX_ROWS,
      modes:['IMPORT','UPDATE','UPSERT'],
      importOrder:['CUSTOMER','CARRIER','RATE','BOOKING'],
      privacyRule:'Carrier-facing data created from bulk import never includes customer KYC, ANC customer reference, HBL or house parties.',
      templates:{
        CUSTOMER:{
          required:['code','name','countryCode'],
          headers:['code','name','countryCode','customerRef','registrationRef','costCenterCode','kycStatus','contactName','contactEmail','contactPhone','registeredAddress','active'],
          example:{code:'TEST-BULK-CUST-NL',name:'TEST Bulk NorthSea Trading B.V.',countryCode:'NL',customerRef:'ANC-TEST-BULK-CUS-001',registrationRef:'TEST-BULK-REG-001',costCenterCode:'TEST-BULK-NL',kycStatus:'APPROVED',contactName:'Test Contact',contactEmail:'bulk.customer@ancline.invalid',contactPhone:'+31-000-000-0000',registeredAddress:'TEST Address, Rotterdam',active:'true'}
        },
        CARRIER:{
          required:['code','name','countryCode'],
          headers:['code','name','countryCode','providerCode','accountCode','active'],
          example:{code:'TEST-BULK-CAR-01',name:'TEST BlueWave Container Line',countryCode:'SG',providerCode:'TEST_BLUEWAVE',accountCode:'ANC-TEST-BLUEWAVE',active:'true'}
        },
        RATE:{
          required:['quoteNo','customerCode','trade','equipment','buyRate','sellRate','currency','validFrom','validTo'],
          headers:['quoteNo','customerCode','carrierCode','providerCode','trade','equipment','buyRate','sellRate','currency','validFrom','validTo','status','source','carrierQuoteRef'],
          example:{quoteNo:'ANC-TEST-BULK-Q-001',customerCode:'TEST-BULK-CUST-NL',carrierCode:'TEST-BULK-CAR-01',providerCode:'TEST_BLUEWAVE',trade:'NLRTM-AEJEA',equipment:'40HC',buyRate:'1450',sellRate:'1725',currency:'USD',validFrom:'2026-09-01',validTo:'2026-12-31',status:'APPROVED',source:'BULK_IMPORT',carrierQuoteRef:'TEST-CARRIER-Q-001'}
        },
        BOOKING:{
          required:['bookingNo','customerCode','origin','destination'],
          headers:['bookingNo','customerCode','rateQuoteNo','businessModel','origin','destination','bookingType','transportMode','serviceType','carrierCode','carrierBookingNo','equipment','quantity','commodity','freightTerms','currency','status','customerReference','etd','eta','houseBL','masterBL'],
          example:{bookingNo:'ANC-TEST-BULK-BKG-001',customerCode:'TEST-BULK-CUST-NL',rateQuoteNo:'ANC-TEST-BULK-Q-001',businessModel:'FORWARDING',origin:'NLRTM',destination:'AEJEA',bookingType:'FCL',transportMode:'SEA',serviceType:'PORT_TO_PORT',carrierCode:'TEST-BULK-CAR-01',carrierBookingNo:'TEST-CAR-BKG-001',equipment:'40HC',quantity:'1',commodity:'Furniture',freightTerms:'PREPAID',currency:'USD',status:'BOOKING_REQUESTED',customerReference:'TEST-CUST-REF-001',etd:'2026-10-01',eta:'2026-10-24',houseBL:'ANC-TEST-HBL-001',masterBL:''}
        }
      }
    };
  }

  async history(user:any){
    this.admin(user);
    const rows=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'BulkDataImport'},orderBy:{createdAt:'desc'},take:50});
    return rows.map((x:any)=>({id:x.objectId,status:x.status,createdAt:x.createdAt,payload:x.payload}));
  }

  private syntax(type:ImportType,row:any,index:number){
    const errors:string[]=[];const warnings:string[]=[];
    const req=(key:string,label=key)=>{if(!this.text(row?.[key]))errors.push(label+' is required');};
    if(type==='CUSTOMER'){
      req('code');req('name');req('countryCode');
      const cc=this.upper(row?.countryCode);if(cc&&cc.length!==2)errors.push('countryCode must be a 2-letter ISO code');
      const k=this.upper(row?.kycStatus);if(k&&!KYC_STATUSES.has(k))errors.push('kycStatus is invalid');
      if(k==='APPROVED'&&!this.text(row?.customerRef))warnings.push('Approved customer has no ANC customerRef');
    }
    if(type==='CARRIER'){
      req('code');req('name');req('countryCode');
      const cc=this.upper(row?.countryCode);if(cc&&cc.length!==2)errors.push('countryCode must be a 2-letter ISO code');
    }
    const keys=Array.from(new Set(rows.map(r=>this.rowKey(type,r)).filter(Boolean)));
    let existingKeys=new Set<string>();
    if(keys.length){
      if(type==='CUSTOMER'||type==='CARRIER'){
        const found=await this.db.organization.findMany({where:{code:{in:keys}},select:{code:true}});
        existingKeys=new Set(found.map((x:any)=>this.upper(x.code)));
      }else if(type==='RATE'){
        const found=await this.db.rateQuote.findMany({where:{quoteNo:{in:keys}},select:{quoteNo:true}});
        existingKeys=new Set(found.map((x:any)=>this.upper(x.quoteNo)));
      }else{
        const found=await this.db.booking.findMany({where:{bookingNo:{in:keys}},select:{bookingNo:true}});
        existingKeys=new Set(found.map((x:any)=>this.upper(x.bookingNo)));
      }
      for(let i=0;i<rows.length;i++){
        const key=this.rowKey(type,rows[i]);if(!key)continue;
        const exists=existingKeys.has(key);
        if(mode==='IMPORT'&&exists)results[i].errors.push(key+' already exists; IMPORT mode only creates new records');
        if(mode==='UPDATE'&&!exists)results[i].errors.push(key+' does not exist; UPDATE mode only changes existing records');
      }
    }

    if(type==='RATE'){
      ['quoteNo','customerCode','trade','equipment','buyRate','sellRate','currency','validFrom','validTo'].forEach(k=>req(k));
      try{const b=this.num(row?.buyRate,'buyRate',true),s=this.num(row?.sellRate,'sellRate',true);if(b!==null&&b<0)errors.push('buyRate cannot be negative');if(s!==null&&s<0)errors.push('sellRate cannot be negative');if(b!==null&&s!==null&&s<b)warnings.push('sellRate is below buyRate');}catch(e:any){errors.push(e.message);}
      try{const a=this.date(row?.validFrom,'validFrom',true),z=this.date(row?.validTo,'validTo',true);if(a&&z&&z<a)errors.push('validTo must be after validFrom');}catch(e:any){errors.push(e.message);}
    }
    if(type==='BOOKING'){
      ['bookingNo','customerCode','origin','destination'].forEach(k=>req(k));
      const bm=this.upper(row?.businessModel)||'NVOCC';if(!['NVOCC','FORWARDING'].includes(bm))errors.push('businessModel must be NVOCC or FORWARDING');
      if(bm==='FORWARDING'&&!this.text(row?.rateQuoteNo))errors.push('FORWARDING booking requires rateQuoteNo');
      const st=this.upper(row?.status)||'DRAFT';if(!BOOKING_STATUSES.has(st))errors.push('status is invalid');
      try{const q=this.int(row?.quantity,'quantity');if(q!==null&&q<1)errors.push('quantity must be at least 1');}catch(e:any){errors.push(e.message);}
    }
    return {row:index+1,valid:errors.length===0,errors,warnings};
  }

  private rowKey(type:ImportType,row:any){
    return type==='CUSTOMER'||type==='CARRIER'?this.upper(row?.code):type==='RATE'?this.upper(row?.quoteNo):this.upper(row?.bookingNo);
  }

  private async preflight(type:ImportType,rows:any[],mode:BulkMode){
    const results=rows.map((r:any,i:number)=>this.syntax(type,r,i));
    const seen=new Map<string,number>();
    for(let i=0;i<rows.length;i++){
      const key=this.rowKey(type,rows[i]);
      if(!key)continue;
      const first=seen.get(key);
      if(first!==undefined){
        const msg='Duplicate '+type+' key '+key+' in the same batch';
        if(!results[first].errors.includes(msg))results[first].errors.push(msg);
        results[i].errors.push(msg);
      }else seen.set(key,i);
    }

    if(type==='RATE'){
      const customerCodes=Array.from(new Set(rows.map(r=>this.upper(r?.customerCode)).filter(Boolean)));
      const carrierCodes=Array.from(new Set(rows.map(r=>this.upper(r?.carrierCode)).filter(Boolean)));
      const orgCodes=Array.from(new Set([...customerCodes,...carrierCodes]));
      const orgs=orgCodes.length?await this.db.organization.findMany({where:{code:{in:orgCodes}}}):[];
      const byCode=new Map(orgs.map((o:any)=>[o.code,o]));
      for(let i=0;i<rows.length;i++){
        const customerCode=this.upper(rows[i]?.customerCode),carrierCode=this.upper(rows[i]?.carrierCode);
        const customer:any=byCode.get(customerCode);
        if(customerCode&&(!customer||!Array.isArray(customer.roles)||!customer.roles.includes('CUSTOMER')))results[i].errors.push('Customer '+customerCode+' not found');
        if(carrierCode){
          const carrier:any=byCode.get(carrierCode);
          if(!carrier||!Array.isArray(carrier.roles)||!carrier.roles.includes('CARRIER'))results[i].errors.push('Carrier '+carrierCode+' not found');
        }
      }
    }

    if(type==='BOOKING'){
      const customerCodes=Array.from(new Set(rows.map(r=>this.upper(r?.customerCode)).filter(Boolean)));
      const carrierCodes=Array.from(new Set(rows.map(r=>this.upper(r?.carrierCode)).filter(Boolean)));
      const orgCodes=Array.from(new Set([...customerCodes,...carrierCodes]));
      const quoteNos=Array.from(new Set(rows.map(r=>this.upper(r?.rateQuoteNo)).filter(Boolean)));
      const [orgs,quotes]=await Promise.all([
        orgCodes.length?this.db.organization.findMany({where:{code:{in:orgCodes}}}):[],
        quoteNos.length?this.db.rateQuote.findMany({where:{quoteNo:{in:quoteNos}}}):[]
      ]);
      const byCode=new Map(orgs.map((o:any)=>[o.code,o]));
      const byQuote=new Map(quotes.map((q:any)=>[q.quoteNo,q]));
      for(let i=0;i<rows.length;i++){
        const customerCode=this.upper(rows[i]?.customerCode),carrierCode=this.upper(rows[i]?.carrierCode),rateQuoteNo=this.upper(rows[i]?.rateQuoteNo);
        const customer:any=byCode.get(customerCode);
        if(customerCode&&(!customer||!Array.isArray(customer.roles)||!customer.roles.includes('CUSTOMER')))results[i].errors.push('Customer '+customerCode+' not found');
        if(carrierCode){
          const carrier:any=byCode.get(carrierCode);
          if(!carrier||!Array.isArray(carrier.roles)||!carrier.roles.includes('CARRIER'))results[i].errors.push('Carrier '+carrierCode+' not found');
        }
        if(rateQuoteNo){
          const quote:any=byQuote.get(rateQuoteNo);
          if(!quote)results[i].errors.push('Rate quote '+rateQuoteNo+' not found');
          else if(customer&&quote.customerId!==customer.id)results[i].errors.push('Rate quote '+rateQuoteNo+' belongs to another customer');
        }
      }
    }

    return results.map((x:any)=>({...x,valid:x.errors.length===0}));
  }

  async validate(body:any,user:any){
    this.admin(user);
    const type=this.type(body?.type),mode=this.mode(body?.mode),rows=this.rows(body?.rows);
    const results=await this.preflight(type,rows,mode);
    return {type,mode,total:rows.length,valid:results.filter((x:any)=>x.valid).length,invalid:results.filter((x:any)=>!x.valid).length,results};
  }

  private async upsertCustomer(r:any,mode:BulkMode,db:any=this.db){
    const code=this.upper(r.code),name=this.text(r.name),countryCode=this.upper(r.countryCode);
    if(!code||!name||countryCode.length!==2)throw new Error('code, name and 2-letter countryCode are required');
    const existing=await db.organization.findUnique({where:{code}});
    this.enforceMode(mode,Boolean(existing),'Customer '+code);
    const roles=Array.from(new Set([...(existing?.roles||[]),'CUSTOMER']));
    const kycStatus=this.upper(r.kycStatus)||existing?.kycStatus||'NOT_STARTED';
    if(!KYC_STATUSES.has(kycStatus))throw new Error('Invalid kycStatus');
    const previousKyc=(existing?.kycData&&typeof existing.kycData==='object')?existing.kycData:{};
    const extra:any={...previousKyc};
    for(const [k,v] of Object.entries({contactName:this.text(r.contactName),contactEmail:this.text(r.contactEmail).toLowerCase(),contactPhone:this.text(r.contactPhone),registeredAddress:this.text(r.registeredAddress)})){if(v)extra[k]=v;}
    extra.bulkImported=true;
    const data:any={name,roles,countryCode,active:this.bool(r.active,true),kycStatus,kycData:extra};
    if(this.text(r.customerRef))data.customerRef=this.text(r.customerRef);
    if(this.text(r.registrationRef))data.registrationRef=this.text(r.registrationRef);
    if(this.text(r.costCenterCode))data.costCenterCode=this.upper(r.costCenterCode);
    if(kycStatus==='APPROVED'&&!existing?.kycApprovedAt){data.kycApprovedAt=new Date();data.kycApprovedBy='BULK_IMPORT';}
    const row=existing?await db.organization.update({where:{code},data}):await db.organization.create({data:{code,...data}});
    return {id:row.id,code:row.code,name:row.name,role:'CUSTOMER',kycStatus:row.kycStatus};
  }

  private async upsertCarrier(r:any,mode:BulkMode,db:any=this.db){
    const code=this.upper(r.code),name=this.text(r.name),countryCode=this.upper(r.countryCode);
    if(!code||!name||countryCode.length!==2)throw new Error('code, name and 2-letter countryCode are required');
    const existing=await db.organization.findUnique({where:{code}});
    this.enforceMode(mode,Boolean(existing),'Carrier '+code);
    const roles=Array.from(new Set([...(existing?.roles||[]),'CARRIER']));
    const data={name,roles,countryCode,active:this.bool(r.active,true)};
    const row=existing?await db.organization.update({where:{code},data}):await db.organization.create({data:{code,...data}});
    const providerCode=this.upper(r.providerCode);
    if(providerCode){
      await db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateProvider',objectId:providerCode,eventType:'PROVIDER_PROFILE_SET'}});
      await db.integrationEvent.create({data:{
        sourceSystem:'ANCLINE_RATE_PROCUREMENT',eventType:'PROVIDER_PROFILE_SET',objectType:'CarrierRateProvider',objectId:providerCode,status:'COMPLETED',completedAt:new Date(),
        payload:{providerCode,name:row.name,carrier:row.name,carrierOrgId:row.id,active:row.active,authMode:'NONE',endpoint:null,bookingEndpoint:null,capabilities:{RATES:'MANUAL',BOOKING:'MANUAL',AMENDMENT:'MANUAL',CANCELLATION:'MANUAL',VGM:'MANUAL',SHIPPING_INSTRUCTIONS:'MANUAL',BL_DRAFT:'MANUAL',TRACKING:'MANUAL'},carrierIdentity:{accountName:'ANCLINE',accountCode:this.text(r.accountCode)||null},dataProtection:{customerKycOutbound:false,customerReferenceOutbound:false,houseBlOutbound:false,housePartiesOutbound:false},bulkImported:true}
      }});
    }
    return {id:row.id,code:row.code,name:row.name,role:'CARRIER',providerCode:providerCode||null};
  }

  private async upsertRate(r:any,mode:BulkMode,db:any=this.db){
    const quoteNo=this.upper(r.quoteNo),customerCode=this.upper(r.customerCode);
    const customer=await db.organization.findUnique({where:{code:customerCode}});
    if(!customer||!Array.isArray(customer.roles)||!customer.roles.includes('CUSTOMER'))throw new Error('Customer '+customerCode+' not found');
    let carrier:any=null;
    const carrierCode=this.upper(r.carrierCode);if(carrierCode){carrier=await db.organization.findUnique({where:{code:carrierCode}});if(!carrier||!carrier.roles?.includes('CARRIER'))throw new Error('Carrier '+carrierCode+' not found');}
    const buy=this.num(r.buyRate,'buyRate',true),sell=this.num(r.sellRate,'sellRate',true);
    if((buy as number)<0||(sell as number)<0)throw new Error('Rates cannot be negative');
    const validFrom=this.date(r.validFrom,'validFrom',true)!,validTo=this.date(r.validTo,'validTo',true)!;if(validTo<validFrom)throw new Error('validTo must be after validFrom');
    const providerCode=this.upper(r.providerCode)||carrierCode||null;
    const data:any={customerId:customer.id,trade:this.upper(r.trade),equipment:this.upper(r.equipment),buyRate:buy,sellRate:sell,currency:this.upper(r.currency)||'USD',validFrom,validTo,status:this.text(r.status)||'DRAFT',source:this.text(r.source)||'BULK_IMPORT',customerRef:customer.customerRef||null,costCenterCode:customer.costCenterCode||null,carrierCode:providerCode,carrierQuoteRef:this.text(r.carrierQuoteRef)||null,requestData:{bulkImported:true,trade:this.upper(r.trade),equipment:this.upper(r.equipment)},carrierOfferData:carrier?{bulkImported:true,carrierOrgId:carrier.id,carrierCode:carrier.code,providerCode,buyRate:buy,currency:this.upper(r.currency)||'USD',customerKycOutbound:false,customerReferenceOutbound:false,houseBlOutbound:false,housePartiesOutbound:false,customerDataOutbound:false,houseDataOutbound:false}:null};
    const existing=await db.rateQuote.findUnique({where:{quoteNo}});
    this.enforceMode(mode,Boolean(existing),'Rate '+quoteNo);
    const row=existing?await db.rateQuote.update({where:{quoteNo},data}):await db.rateQuote.create({data:{quoteNo,...data}});
    return {id:row.id,quoteNo:row.quoteNo,customerCode,carrierCode:carrierCode||null,status:row.status};
  }

  private async upsertBooking(r:any,mode:BulkMode,db:any=this.db){
    const bookingNo=this.upper(r.bookingNo),customerCode=this.upper(r.customerCode),businessModel=this.upper(r.businessModel)||'NVOCC';
    const customer=await db.organization.findUnique({where:{code:customerCode}});
    if(!customer||!customer.roles?.includes('CUSTOMER'))throw new Error('Customer '+customerCode+' not found');
    let quote:any=null;const rateQuoteNo=this.upper(r.rateQuoteNo);
    if(rateQuoteNo){quote=await db.rateQuote.findUnique({where:{quoteNo:rateQuoteNo}});if(!quote)throw new Error('Rate quote '+rateQuoteNo+' not found');if(quote.customerId!==customer.id)throw new Error('Rate quote belongs to another customer');}
    if(businessModel==='FORWARDING'&&!quote)throw new Error('FORWARDING booking requires rateQuoteNo');
    if(!['NVOCC','FORWARDING'].includes(businessModel))throw new Error('Invalid businessModel');
    let carrier:any=null;const carrierCode=this.upper(r.carrierCode);if(carrierCode){carrier=await db.organization.findUnique({where:{code:carrierCode}});if(!carrier||!carrier.roles?.includes('CARRIER'))throw new Error('Carrier '+carrierCode+' not found');}
    const status=this.upper(r.status)||'DRAFT';if(!BOOKING_STATUSES.has(status))throw new Error('Invalid booking status');
    const quantity=this.int(r.quantity,'quantity');if(quantity!==null&&quantity<1)throw new Error('quantity must be at least 1');
    const data:any={
      businessModel,bookingChannel:'BULK_IMPORT',customerId:customer.id,customerRef:customer.customerRef||null,costCenterCode:customer.costCenterCode||null,
      jobType:businessModel==='FORWARDING'?'FORWARDING':(this.text(r.bookingType)||'NVOCC'),forwardingTradeType:businessModel==='FORWARDING'?'STANDARD':null,
      rateQuoteId:quote?.id||null,bookingType:this.upper(r.bookingType)||'FCL',transportMode:this.upper(r.transportMode)||'SEA',serviceType:this.upper(r.serviceType)||null,
      origin:this.upper(r.origin),destination:this.upper(r.destination),carrier:carrier?.name||null,carrierBookingNo:this.text(r.carrierBookingNo)||null,
      equipment:this.upper(r.equipment)||null,quantity,commodity:this.text(r.commodity)||null,freightTerms:this.upper(r.freightTerms)||null,currency:this.upper(r.currency)||quote?.currency||'USD',
      status,customerReference:this.text(r.customerReference)||null,etd:this.date(r.etd,'etd'),eta:this.date(r.eta,'eta'),houseBL:this.text(r.houseBL)||null,masterBL:this.text(r.masterBL)||null,
      notes:'BULK IMPORT — carrier outbound privacy policy enforced'
    };
    if(!data.origin||!data.destination)throw new Error('origin and destination are required');
    const existing=await db.booking.findUnique({where:{bookingNo}});
    this.enforceMode(mode,Boolean(existing),'Booking '+bookingNo);
    const row=existing?await db.booking.update({where:{bookingNo},data}):await db.booking.create({data:{bookingNo,...data}});
    return {id:row.id,bookingNo:row.bookingNo,customerCode,businessModel:row.businessModel,status:row.status,carrier:row.carrier,rateQuoteNo:quote?.quoteNo||null};
  }

  async importRows(body:any,user:any){
    this.admin(user);
    const type=this.type(body?.type),mode=this.mode(body?.mode),rows=this.rows(body?.rows);
    const checks=await this.preflight(type,rows,mode);
    if(checks.some((x:any)=>!x.valid))return {type,mode,committed:false,total:rows.length,succeeded:0,failed:checks.filter((x:any)=>!x.valid).length,results:checks,message:'Validation failed. No rows were committed.'};

    const batchId='BULK-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
    let activeRow=0;
    try{
      const committed=await (this.prisma as any).$transaction(async (tx:any)=>{
        const results:any[]=[];
        for(let i=0;i<rows.length;i++){
          activeRow=i+1;
          const value=type==='CUSTOMER'?await this.upsertCustomer(rows[i],mode,tx):type==='CARRIER'?await this.upsertCarrier(rows[i],mode,tx):type==='RATE'?await this.upsertRate(rows[i],mode,tx):await this.upsertBooking(rows[i],mode,tx);
          results.push({row:i+1,status:'SUCCESS',value});
        }
        const actorId=user?.sub||user?.email||'unknown';
        const payload={batchId,type,mode,total:rows.length,succeeded:rows.length,failed:0,actorId,executedAt:new Date().toISOString(),customerKycOutbound:false,customerReferenceOutbound:false,houseBlOutbound:false,housePartiesOutbound:false,houseDataOutbound:false};
        await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'BULK_DATA_'+mode,objectType:'BulkDataImport',objectId:batchId,status:'COMPLETED',payload,completedAt:new Date()}});
        await tx.auditEvent.create({data:{actorId,action:'BULK_DATA_'+mode,objectType:'BulkDataImport',objectId:batchId,bookingId:null,detail:payload}});
        return {results,payload};
      });
      return {type,mode,batchId,committed:true,total:rows.length,succeeded:rows.length,failed:0,results:committed.results,privacy:{customerKycOutbound:false,customerReferenceOutbound:false,houseBlOutbound:false,housePartiesOutbound:false,houseDataOutbound:false}};
    }catch(e:any){
      const error=e?.message||String(e);
      return {
        type,mode,batchId,committed:false,total:rows.length,succeeded:0,failed:rows.length,
        results:rows.map((_:any,i:number)=>({row:i+1,status:'FAILED',error:i+1===activeRow?error:'Batch rolled back because another row failed'})),
        message:mode+' failed. The entire batch was rolled back; no rows were committed.'
      };
    }
  }

}
