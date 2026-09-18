import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_CARRIER_PAYMENT';
const OBJECT='CarrierPaymentInstruction';
const GROUPS=['ORIGIN_PORT','SEA_FREIGHT','DESTINATION_PORT','ORIGIN_HAULAGE','DESTINATION_HAULAGE'] as const;
const REQUIRED=new Set(['ORIGIN_PORT','SEA_FREIGHT','DESTINATION_PORT']);
const TERMS=new Set(['PREPAID_ORIGIN','COLLECT','PREPAID_ELSEWHERE','NOT_APPLICABLE']);

@Injectable()
export class CarrierPaymentService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private text(v:any){return String(v??'').trim();}
  private country(v:any){return this.text(v).toUpperCase();}
  private async booking(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    await this.scope.assertBookingAccess(user,id);
    const b=await this.db.booking.findUnique({where:{id},include:{rateQuote:true}});
    if(!b)throw new NotFoundException('Booking not found');
    if(String(b.businessModel||'NVOCC').toUpperCase()!=='FORWARDING')throw new BadRequestException('Carrier payer control is Forwarding-only');
    return b;
  }
  private async officeData(){
    const masterEvents=await this.db.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_GLOBAL_COMMERCE',objectType:'AncOfficeProfile',eventType:'ANC_OFFICE_PROFILE_SET'},orderBy:{createdAt:'asc'}});
    const latest=new Map<string,any>();for(const e of masterEvents)latest.set(e.objectId,{...(e.payload||{}),id:e.objectId});
    const masterOffices=[...latest.values()].filter((x:any)=>x.active!==false&&x.registeredOffice!==false&&x.carrierPayerEligible===true&&x.countryCode)
      .map((x:any)=>({officeKey:'GLOBAL:'+x.officeId,source:'GLOBAL_COMMERCE_MASTER',id:x.officeId,code:x.officeCode,name:x.officeName,countryCode:this.country(x.countryCode),address:x.address||null,city:x.city||null,legalEntityName:x.legalEntityName||null}));
    if(masterOffices.length){
      const countries=[...new Set(masterOffices.map((x:any)=>x.countryCode))].sort();
      return {offices:masterOffices,countries,source:'GLOBAL_COMMERCE_MASTER',legacyFallback:false};
    }
    const [branches,orgs]=await Promise.all([
      this.db.branch.findMany({where:{active:true},select:{id:true,code:true,name:true,countryCode:true},orderBy:[{countryCode:'asc'},{name:'asc'}]}),
      this.db.organization.findMany({where:{active:true,roles:{has:'ANCLINE_BRANCH'}},select:{id:true,code:true,name:true,countryCode:true},orderBy:[{countryCode:'asc'},{name:'asc'}]})
    ]);
    const offices:any[]=[
      ...branches.map((x:any)=>({officeKey:'BRANCH:'+x.id,source:'LEGACY_BRANCH',id:x.id,code:x.code,name:x.name,countryCode:this.country(x.countryCode)})),
      ...orgs.map((x:any)=>({officeKey:'ORG:'+x.id,source:'LEGACY_ORGANIZATION',id:x.id,code:x.code,name:x.name,countryCode:this.country(x.countryCode)}))
    ].filter((x:any)=>x.countryCode);
    const countries=[...new Set(offices.map((x:any)=>x.countryCode))].sort();
    return {offices,countries,source:'LEGACY_FALLBACK',legacyFallback:true};
  }
  async offices(user:ScopeUser){
    this.scope.assertInternal(user);
    return this.officeData();
  }
  private normalizeTerm(v:any){
    const raw=this.text(v||'').toUpperCase().replace(/[\s-]+/g,'_');
    if(raw==='PREPAID')return 'PREPAID_ORIGIN';
    if(raw==='ELSEWHERE'||raw==='PREPAID_ELSEWHERE')return 'PREPAID_ELSEWHERE';
    if(raw==='N/A'||raw==='NA'||raw==='NONE')return 'NOT_APPLICABLE';
    if(!TERMS.has(raw))throw new BadRequestException('Payment term must be PREPAID_ORIGIN, COLLECT, PREPAID_ELSEWHERE or NOT_APPLICABLE');
    return raw;
  }
  private normalizeInstruction(group:string,input:any,offices:any[],countries:string[]){
    const term=this.normalizeTerm(input?.term||input?.paymentTerm||'');
    if(REQUIRED.has(group)&&term==='NOT_APPLICABLE')throw new BadRequestException(group+' payment term is required');
    if(term==='NOT_APPLICABLE')return {chargeGroup:group,term,applicable:false};
    const carrierPayerCode=this.text(input?.carrierPayerCode)||null;
    if(term==='PREPAID_ELSEWHERE'){
      const payerName=this.text(input?.payerName),payerAddress=this.text(input?.payerAddress),payerCountryCode=this.country(input?.payerCountryCode||input?.countryCode);
      if(!payerName||!payerAddress||!payerCountryCode)throw new BadRequestException(group+' Elsewhere requires payer name, address and country');
      if(!countries.includes(payerCountryCode))throw new BadRequestException('Prepaid Elsewhere is permitted only in a country where ANC has an active registered office');
      return {chargeGroup:group,term,applicable:true,payerType:'ANC_REGISTERED_OFFICE_ELSEWHERE',payerName,payerAddress,payerCountryCode,carrierPayerCode,ancOfficeCountryValidated:true};
    }
    const officeKey=this.text(input?.payerOfficeKey||input?.officeKey);
    if(!officeKey)throw new BadRequestException(group+' requires an ANC registered payer office');
    const office=offices.find((x:any)=>x.officeKey===officeKey);
    if(!office)throw new BadRequestException(group+' payer must be an active ANC registered office');
    return {chargeGroup:group,term,applicable:true,payerType:'ANC_REGISTERED_OFFICE',payerOfficeKey:office.officeKey,payerOfficeId:office.id,payerOfficeSource:office.source,payerCode:office.code,payerName:office.name,payerCountryCode:office.countryCode,carrierPayerCode,ancOfficeCountryValidated:true};
  }
  private async latest(bookingId:string){
    const e=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:OBJECT,objectId:bookingId,eventType:'CARRIER_PAYMENT_INSTRUCTIONS_SET'},orderBy:{createdAt:'desc'}});
    return e?{...(e.payload||{}),updatedAt:e.createdAt}:null;
  }
  async get(bookingId:string,user:ScopeUser){
    const booking=await this.booking(bookingId,user);
    const [meta,current]=await Promise.all([this.officeData(),this.latest(bookingId)]);
    const {offices,countries}=meta;
    return {booking:{id:booking.id,bookingNo:booking.bookingNo,carrier:booking.carrier,carrierBookingNo:booking.carrierBookingNo,currency:booking.currency,status:booking.status},chargeGroups:GROUPS,terms:['PREPAID_ORIGIN','COLLECT','PREPAID_ELSEWHERE','NOT_APPLICABLE'],registeredCountries:countries,offices,current,officeSource:meta.source,legacyFallback:meta.legacyFallback};
  }
  async set(bookingId:string,body:any,user:ScopeUser){
    const booking=await this.booking(bookingId,user);
    const {offices,countries}=await this.officeData();
    if(!countries.length)throw new BadRequestException('No active ANC registered office countries are configured');
    const raw=body?.instructions&&typeof body.instructions==='object'?body.instructions:{};
    const instructions:any[]=[];
    for(const group of GROUPS){
      const input=Array.isArray(raw)?raw.find((x:any)=>String(x?.chargeGroup||'').toUpperCase()===group):raw[group];
      if(!input){
        if(REQUIRED.has(group))throw new BadRequestException(group+' payment instruction is required');
        instructions.push({chargeGroup:group,term:'NOT_APPLICABLE',applicable:false});
        continue;
      }
      instructions.push(this.normalizeInstruction(group,input,offices,countries));
    }
    const payload={bookingId,bookingNo:booking.bookingNo,carrier:booking.carrier||null,carrierQuoteRef:booking.rateQuote?.carrierQuoteRef||null,instructions,registeredCountries:countries,customerDataOutbound:false,houseDataOutbound:false,validatedAt:new Date().toISOString(),validatedBy:user.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'CARRIER_PAYMENT_INSTRUCTIONS_SET',externalId:bookingId,objectType:OBJECT,objectId:bookingId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'CARRIER_PAYMENT_INSTRUCTIONS_SET',objectType:OBJECT,objectId:bookingId,bookingId,detail:{instructions:instructions.map((x:any)=>({chargeGroup:x.chargeGroup,term:x.term,payerOfficeKey:x.payerOfficeKey||null,payerCountryCode:x.payerCountryCode||null})),registeredCountries:countries}});
    return payload;
  }
}
