import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_RATE_PROCUREMENT';
const PROVIDER_OBJECT='CarrierRateProvider';
const OFFER_OBJECT='CarrierRateOffer';
const TERMINAL_BOOKING=new Set(['BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE','CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);

@Injectable()
export class RateProcurementService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private internal(user:ScopeUser){this.scope.assertInternal(user);}
  private text(v:any){return String(v??'').trim();}
  private money(v:any,name='Rate'){const n=Number(v);if(!Number.isFinite(n)||n<0)throw new BadRequestException(`${name} must be a valid positive amount`);return Math.round(n*100)/100;}
  private iso(v:any){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;}
  private payload(row:any){return row?.payload&&typeof row.payload==='object'?row.payload:{};}

  async providers(user:ScopeUser){
    this.internal(user);
    const events=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:PROVIDER_OBJECT,eventType:'PROVIDER_PROFILE_SET'},orderBy:{createdAt:'asc'}});
    const latest=new Map<string,any>();
    for(const e of events)latest.set(e.objectId,{...this.payload(e),providerCode:e.objectId,updatedAt:e.createdAt});
    return [...latest.values()].sort((a:any,b:any)=>String(a.name||a.providerCode).localeCompare(String(b.name||b.providerCode)));
  }

  async setProvider(body:any,user:ScopeUser){
    this.internal(user);
    const providerCode=this.text(body?.providerCode).toUpperCase();
    const name=this.text(body?.name);
    if(!providerCode||!name)throw new BadRequestException('Provider code and name are required');
    const authMode=this.text(body?.authMode||'NONE').toUpperCase();
    if(!['NONE','BASIC','BEARER','API_KEY'].includes(authMode))throw new BadRequestException('Auth mode must be NONE, BASIC, BEARER or API_KEY');
    const endpoint=this.text(body?.endpoint);
    if(endpoint&&!/^https:\/\//i.test(endpoint))throw new BadRequestException('Carrier rate endpoint must use HTTPS');
    const secretEnv=this.text(body?.secretEnv);
    if(authMode!=='NONE'&&!secretEnv)throw new BadRequestException('A secure secret environment key is required for authenticated providers');
    if(authMode==='BASIC'&&!this.text(body?.username))throw new BadRequestException('Username is required for BASIC authentication');
    const defaultMarginPct=Number(body?.defaultMarginPct??0);
    if(!Number.isFinite(defaultMarginPct)||defaultMarginPct<0||defaultMarginPct>500)throw new BadRequestException('Default margin % must be between 0 and 500');
    const payload={
      providerCode,name,carrier:this.text(body?.carrier||name),authMode,
      username:this.text(body?.username)||null,secretEnv:secretEnv||null,
      apiKeyHeader:this.text(body?.apiKeyHeader||'x-api-key')||'x-api-key',
      endpoint:endpoint||null,defaultMarginPct,
      active:body?.active!==false,notes:this.text(body?.notes)||null,updatedBy:user.sub
    };
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'PROVIDER_PROFILE_SET',externalId:providerCode,objectType:PROVIDER_OBJECT,objectId:providerCode,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'CARRIER_RATE_PROVIDER_SET',objectType:PROVIDER_OBJECT,objectId:providerCode,detail:{name,authMode,endpoint:endpoint||null,defaultMarginPct,active:payload.active}});
    return payload;
  }

  private async bookingRow(bookingId:string,user:ScopeUser){
    this.internal(user);
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.db.booking.findUnique({where:{id:bookingId},include:{customer:{select:{id:true,code:true,name:true}},rateQuote:true}});
    if(!booking)throw new NotFoundException('Booking not found');
    return booking;
  }

  private async storedOffers(bookingId:string){
    const rows=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:OFFER_OBJECT,eventType:'RATE_OFFER_RECEIVED'},orderBy:{createdAt:'desc'},take:500});
    return rows.map((e:any)=>({...this.payload(e),offerId:e.objectId,receivedAt:e.createdAt})).filter((x:any)=>x.bookingId===bookingId).slice(0,100);
  }

  async booking(bookingId:string,user:ScopeUser){
    const booking=await this.bookingRow(bookingId,user);
    const [providers,offers]=await Promise.all([this.providers(user),this.storedOffers(bookingId)]);
    return {booking,providers,offers};
  }

  private same(a:any,b:any){return this.text(a).toUpperCase()===this.text(b).toUpperCase();}
  private async contractOffers(booking:any){
    const now=new Date();
    const contracts=await this.db.serviceContract.findMany({
      where:{validFrom:{lte:now},validTo:{gte:now},status:{notIn:['DRAFT','CANCELLED','EXPIRED']}},
      include:{rates:true}
    });
    const origin=this.text(booking.portOfLoading||booking.origin).toUpperCase();
    const destination=this.text(booking.portOfDischarge||booking.destination).toUpperCase();
    const equipment=this.text(booking.equipment).toUpperCase();
    const out:any[]=[];
    for(const c of contracts){
      const lanes=(c.rates||[]).filter((r:any)=>this.same(r.origin,origin)&&this.same(r.destination,destination)&&this.same(r.equipment,equipment)&&r.buyRate!=null);
      if(!lanes.length)continue;
      const org=await this.db.organization.findUnique({where:{id:c.partyId},select:{name:true,code:true}});
      const grouped=new Map<string,any[]>();
      for(const r of lanes){const key=String(r.currency||c.currency||'USD').toUpperCase();if(!grouped.has(key))grouped.set(key,[]);grouped.get(key)!.push(r);}
      for(const [currency,rows] of grouped){
        const buyRate=Math.round(rows.reduce((s:number,r:any)=>s+Number(r.buyRate||0),0)*100)/100;
        out.push({
          offerId:this.id('OFF'),bookingId:booking.id,source:'CONTRACT',providerCode:c.contractNo,
          carrier:org?.name||org?.code||c.partyId,serviceName:c.contractType||'CONTRACT',
          origin,destination,equipment,quantity:Math.max(1,Number(booking.quantity||1)),
          buyRate,currency,validTo:c.validTo.toISOString(),externalQuoteRef:c.contractNo,
          freeTimeOrigin:Math.max(...rows.map((r:any)=>Number(r.freeTimeOrigin||0))),
          freeTimeDestination:Math.max(...rows.map((r:any)=>Number(r.freeTimeDestination||0))),
          surcharges:rows.map((r:any)=>({chargeCode:r.chargeCode,amount:Number(r.buyRate||0),currency}))
        });
      }
    }
    return out;
  }

  private authHeaders(provider:any){
    const headers:any={'content-type':'application/json','accept':'application/json'};
    if(provider.authMode==='NONE')return headers;
    const secret=provider.secretEnv?process.env[String(provider.secretEnv)]:undefined;
    if(!secret)throw new Error(`Secret environment variable ${provider.secretEnv||'(missing)'} is not configured`);
    if(provider.authMode==='BASIC')headers.authorization=`Basic ${Buffer.from(`${provider.username||''}:${secret}`).toString('base64')}`;
    if(provider.authMode==='BEARER')headers.authorization=`Bearer ${secret}`;
    if(provider.authMode==='API_KEY')headers[provider.apiKeyHeader||'x-api-key']=secret;
    return headers;
  }

  private normalizeExternal(provider:any,booking:any,row:any){
    const buyRate=Number(row?.buyRate??row?.rate??row?.amount);
    if(!Number.isFinite(buyRate)||buyRate<0)return null;
    const origin=this.text(row?.origin||booking.portOfLoading||booking.origin).toUpperCase();
    const destination=this.text(row?.destination||booking.portOfDischarge||booking.destination).toUpperCase();
    const equipment=this.text(row?.equipment||booking.equipment).toUpperCase();
    return {
      offerId:this.id('OFF'),bookingId:booking.id,source:'ONLINE',providerCode:provider.providerCode,
      carrier:this.text(row?.carrier||provider.carrier||provider.name),serviceName:this.text(row?.serviceName||row?.service)||null,
      vessel:this.text(row?.vessel)||null,voyage:this.text(row?.voyage)||null,
      origin,destination,equipment,quantity:Math.max(1,Number(row?.quantity||booking.quantity||1)),
      etd:this.iso(row?.etd),eta:this.iso(row?.eta),buyRate:Math.round(buyRate*100)/100,
      currency:this.text(row?.currency||booking.currency||'USD').toUpperCase(),
      validTo:this.iso(row?.validTo||row?.expiry)||new Date(Date.now()+7*86400000).toISOString(),
      externalQuoteRef:this.text(row?.externalQuoteRef||row?.quoteReference||row?.quoteNo)||null,
      freeTimeOrigin:row?.freeTimeOrigin==null?null:Number(row.freeTimeOrigin),
      freeTimeDestination:row?.freeTimeDestination==null?null:Number(row.freeTimeDestination),
      surcharges:Array.isArray(row?.surcharges)?row.surcharges:[],
      rawMeta:row?.meta||null
    };
  }

  private async onlineOffers(provider:any,booking:any){
    if(!provider.endpoint)return {offers:[],error:'No online endpoint configured'};
    const request={
      bookingId:booking.id,bookingNo:booking.bookingNo,
      origin:this.text(booking.origin).toUpperCase(),destination:this.text(booking.destination).toUpperCase(),
      portOfLoading:this.text(booking.portOfLoading||booking.origin).toUpperCase(),
      portOfDischarge:this.text(booking.portOfDischarge||booking.destination).toUpperCase(),
      equipment:this.text(booking.equipment).toUpperCase(),quantity:Math.max(1,Number(booking.quantity||1)),
      commodity:booking.commodity||null,specialCargo:booking.specialCargo||null,
      grossWeight:booking.grossWeight||null,volumeCbm:booking.volumeCbm||null,
      requestedEtd:booking.etd||null,currency:booking.currency||'USD'
    };
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await (globalThis as any).fetch(provider.endpoint,{method:'POST',headers:this.authHeaders(provider),body:JSON.stringify(request),signal:controller.signal});
      const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{};}catch{data={message:text};}
      if(!response.ok)throw new Error(data?.message||`Carrier endpoint returned HTTP ${response.status}`);
      const rows=Array.isArray(data)?data:Array.isArray(data?.offers)?data.offers:Array.isArray(data?.rates)?data.rates:[];
      return {offers:rows.map((x:any)=>this.normalizeExternal(provider,booking,x)).filter(Boolean),error:null};
    }catch(e:any){return {offers:[],error:e?.name==='AbortError'?'Carrier rate request timed out':(e?.message||'Carrier rate request failed')};}
    finally{clearTimeout(timer);}
  }

  async search(bookingId:string,user:ScopeUser){
    const booking=await this.bookingRow(bookingId,user);
    if(!booking.equipment)throw new BadRequestException('Booking equipment is required before rate search');
    const current=String(booking.status);
    if(current==='DRAFT')await this.db.booking.update({where:{id:bookingId},data:{status:'RATE_REQUESTED'}});
    const providers=(await this.providers(user)).filter((p:any)=>p.active!==false&&p.endpoint);
    const contract=await this.contractOffers(booking);
    const external:any[]=[];const providerErrors:any[]=[];
    for(const p of providers){const result=await this.onlineOffers(p,booking);external.push(...result.offers);if(result.error)providerErrors.push({providerCode:p.providerCode,name:p.name,error:result.error});}
    const offers=[...contract,...external];
    if(offers.length){
      await this.db.$transaction(async(tx:any)=>{
        for(const offer of offers)await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'RATE_OFFER_RECEIVED',externalId:bookingId,objectType:OFFER_OBJECT,objectId:offer.offerId,status:'COMPLETED',payload:offer,completedAt:new Date()}});
        if(!TERMINAL_BOOKING.has(current))await tx.booking.update({where:{id:bookingId},data:{status:'RATE_RECEIVED'}});
      });
    }
    await this.audit.log({actorId:user.sub,action:'CARRIER_RATE_SEARCH',objectType:'Booking',objectId:bookingId,bookingId,detail:{providers:providers.map((p:any)=>p.providerCode),contractOffers:contract.length,onlineOffers:external.length,providerErrors}});
    return {bookingId,offers,providerErrors};
  }

  async select(bookingId:string,offerId:string,body:any,user:ScopeUser){
    const booking=await this.bookingRow(bookingId,user);
    const row=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:OFFER_OBJECT,objectId:offerId,eventType:'RATE_OFFER_RECEIVED'},orderBy:{createdAt:'desc'}});
    if(!row)throw new NotFoundException('Carrier rate offer not found');
    const offer:any=this.payload(row);if(offer.bookingId!==bookingId)throw new BadRequestException('Rate offer does not belong to this booking');
    if(offer.validTo&&new Date(offer.validTo).getTime()<Date.now())throw new BadRequestException('Carrier rate offer has expired');
    const provider=(await this.providers(user)).find((p:any)=>p.providerCode===offer.providerCode);
    const marginPct=body?.marginPct==null||body?.marginPct===''?Number(provider?.defaultMarginPct||0):Number(body.marginPct);
    const marginAmount=body?.marginAmount==null||body?.marginAmount===''?null:Number(body.marginAmount);
    if(!Number.isFinite(marginPct)||marginPct<0||marginPct>500)throw new BadRequestException('Margin % must be between 0 and 500');
    if(marginAmount!=null&&(!Number.isFinite(marginAmount)||marginAmount<0))throw new BadRequestException('Margin amount must be positive');
    const buyRate=this.money(offer.buyRate,'Buy rate');
    const sellRate=Math.round((marginAmount!=null?buyRate+marginAmount:buyRate*(1+marginPct/100))*100)/100;
    const quoteNo=this.text(body?.quoteNo)||`Q-${Date.now().toString().slice(-9)}`;
    const validTo=offer.validTo?new Date(offer.validTo):new Date(Date.now()+7*86400000);
    const trade=`${this.text(offer.origin||booking.portOfLoading||booking.origin).toUpperCase()} -> ${this.text(offer.destination||booking.portOfDischarge||booking.destination).toUpperCase()}`;
    const result=await this.db.$transaction(async(tx:any)=>{
      const quote=await tx.rateQuote.create({data:{quoteNo,customerId:booking.customerId,trade,equipment:String(offer.equipment||booking.equipment||'').toUpperCase(),buyRate,sellRate,currency:String(offer.currency||booking.currency||'USD').toUpperCase(),validFrom:new Date(),validTo,status:'DRAFT',source:`CARRIER_${offer.source||'RATE'}:${offer.providerCode||offer.carrier||'UNKNOWN'}`}});
      const bookingData:any={rateQuoteId:quote.id,carrier:offer.carrier||booking.carrier||null,currency:quote.currency};
      if(offer.vessel||offer.voyage)bookingData.vesselVoyage=[offer.vessel,offer.voyage].filter(Boolean).join(' / ');
      if(offer.etd)bookingData.etd=new Date(offer.etd);if(offer.eta)bookingData.eta=new Date(offer.eta);
      if(!TERMINAL_BOOKING.has(String(booking.status)))bookingData.status='RATE_RECEIVED';
      await tx.booking.update({where:{id:bookingId},data:bookingData});
      const leg=await tx.bookingLeg.findFirst({where:{bookingId,legType:'MAIN'},orderBy:{sequence:'asc'}});
      const legData:any={carrier:offer.carrier||null,etd:offer.etd?new Date(offer.etd):null,eta:offer.eta?new Date(offer.eta):null,status:'PLANNED'};
      if(offer.vessel)legData.vessel=offer.vessel;if(offer.voyage)legData.voyage=offer.voyage;
      if(leg)await tx.bookingLeg.update({where:{id:leg.id},data:legData});
      else await tx.bookingLeg.create({data:{bookingId,sequence:1,legType:'MAIN',mode:booking.transportMode||'SEA',origin:booking.portOfLoading||booking.origin,destination:booking.portOfDischarge||booking.destination,...legData}});
      await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'RATE_OFFER_SELECTED',externalId:bookingId,objectType:OFFER_OBJECT,objectId:offerId,status:'COMPLETED',payload:{bookingId,offerId,quoteId:quote.id,quoteNo,buyRate,sellRate,marginPct,marginAmount,externalQuoteRef:offer.externalQuoteRef||null,selectedBy:user.sub},completedAt:new Date()}});
      return quote;
    });
    await this.audit.log({actorId:user.sub,action:'CARRIER_RATE_SELECTED',objectType:'Booking',objectId:bookingId,bookingId,detail:{offerId,providerCode:offer.providerCode,carrier:offer.carrier,externalQuoteRef:offer.externalQuoteRef||null,quoteNo:result.quoteNo,buyRate,sellRate,currency:result.currency,marginPct,marginAmount}});
    return {ok:true,offer,quote:result,margin:{marginPct,marginAmount,grossProfit:Math.round((sellRate-buyRate)*100)/100}};
  }
}
