import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { assertAncCarrierOutboundPayload } from '../carrier-outbound-policy';

const SOURCE='ANCLINE_RATE_PROCUREMENT';
const PROVIDER_OBJECT='CarrierRateProvider';
const OFFER_OBJECT='CarrierRateOffer';
const SEARCH_OBJECT='CarrierRateSearch';
const TERMINAL_BOOKING=new Set(['BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE','CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);

@Injectable()
export class RateProcurementService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private internal(user:ScopeUser){this.scope.assertInternal(user);}
  private external(user:ScopeUser){return ['CUSTOMER','SHIPPER','CONSIGNEE'].includes(String(user.role||'').toUpperCase());}
  private admin(user:ScopeUser){if(String(user.role||'').toUpperCase()!=='GLOBAL_ADMIN')throw new ForbiddenException('Global Admin access required for carrier rate provider configuration');}
  private assertRateAccess(booking:any,user:ScopeUser){
    const model=String(booking?.businessModel||'NVOCC').toUpperCase(),role=String(user?.role||'').toUpperCase();
    if(model!=='FORWARDING')throw new BadRequestException('Global carrier rate procurement is Forwarding-only; use the NVOCC Portal for ANC NVOCC tariffs');
    if(!['CUSTOMER','SHIPPER','CONSIGNEE','GLOBAL_ADMIN'].includes(role))throw new BadRequestException('Global Forwarding online rate access denied for this role');
  }

  private text(v:any){return String(v??'').trim();}
  private money(v:any,name='Rate'){const n=Number(v);if(!Number.isFinite(n)||n<0)throw new BadRequestException(`${name} must be a valid positive amount`);return Math.round(n*100)/100;}
  private round(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private iso(v:any){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;}
  private payload(row:any){return row?.payload&&typeof row.payload==='object'?row.payload:{};}
  private path(obj:any,path:any){const p=this.text(path);if(!p)return undefined;let cur=obj;for(const key of p.replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean)){if(cur==null)return undefined;cur=cur[key];}return cur;}
  private mapped(provider:any,row:any,key:string,fallbacks:string[]){const configured=provider?.fieldMap?.[key];if(configured){const v=this.path(row,configured);if(v!==undefined&&v!==null&&v!=='')return v;}for(const f of fallbacks){const v=this.path(row,f);if(v!==undefined&&v!==null&&v!=='')return v;}return undefined;}
  private unitAmount(v:any,basis:any,quantity:number){const n=Number(v);if(!Number.isFinite(n)||n<0)return null;return this.round(String(basis||'PER_UNIT').toUpperCase()==='TOTAL_BOOKING'?n/Math.max(1,quantity):n);}
  private aggregateLines(lines:any[]){const m=new Map<string,any>();for(const x of lines){const chargeCode=this.text(x?.chargeCode||'SURCHARGE').toUpperCase().replace(/\s+/g,'_'),unitRate=this.round(x?.unitRate);if(unitRate<0)continue;const key=chargeCode;if(!m.has(key))m.set(key,{chargeCode,description:x?.description||chargeCode,unitRate:0});const row=m.get(key);row.unitRate=this.round(row.unitRate+unitRate);}return [...m.values()].filter((x:any)=>x.unitRate>0.0005);}
  private readiness(p:any){const secretConfigured=p.authMode==='NONE'||Boolean(p.secretEnv&&process.env[String(p.secretEnv)]);return {secretConfigured,connectionReady:p.active!==false&&Boolean(p.endpoint)&&secretConfigured};}

  private async providerProfiles(){
    const events=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:PROVIDER_OBJECT,eventType:'PROVIDER_PROFILE_SET'},orderBy:{createdAt:'asc'}});
    const latest=new Map<string,any>();
    for(const e of events){const p={...this.payload(e),providerCode:e.objectId,updatedAt:e.createdAt};latest.set(e.objectId,{...p,...this.readiness(p)});}
    return [...latest.values()].sort((a:any,b:any)=>String(a.name||a.providerCode).localeCompare(String(b.name||b.providerCode)));
  }

  async providers(user:ScopeUser){this.admin(user);return this.providerProfiles();}

  async carriers(user:ScopeUser){
    this.admin(user);
    return this.db.organization.findMany({where:{active:true,roles:{has:'CARRIER'}},select:{id:true,code:true,name:true,countryCode:true},orderBy:{name:'asc'}});
  }

  async setProvider(body:any,user:ScopeUser){
    this.admin(user);
    const providerCode=this.text(body?.providerCode).toUpperCase(),name=this.text(body?.name);
    if(!providerCode||!name)throw new BadRequestException('Provider code and name are required');
    const authMode=this.text(body?.authMode||'NONE').toUpperCase();
    if(!['NONE','BASIC','BEARER','API_KEY'].includes(authMode))throw new BadRequestException('Auth mode must be NONE, BASIC, BEARER or API_KEY');
    const endpoint=this.text(body?.endpoint),bookingEndpoint=this.text(body?.bookingEndpoint),amendmentEndpoint=this.text(body?.amendmentEndpoint),cancellationEndpoint=this.text(body?.cancellationEndpoint),vgmEndpoint=this.text(body?.vgmEndpoint),shippingInstructionsEndpoint=this.text(body?.shippingInstructionsEndpoint),blDraftEndpoint=this.text(body?.blDraftEndpoint),trackingEndpoint=this.text(body?.trackingEndpoint),secretEnv=this.text(body?.secretEnv);
    if(endpoint&&!/^https:\/\//i.test(endpoint))throw new BadRequestException('Carrier rate endpoint must use HTTPS');
    if(bookingEndpoint&&!/^https:\/\//i.test(bookingEndpoint))throw new BadRequestException('Carrier booking endpoint must use HTTPS');
    for(const [label,value] of [['Amendment',amendmentEndpoint],['Cancellation',cancellationEndpoint],['VGM',vgmEndpoint],['Shipping Instructions',shippingInstructionsEndpoint],['B/L Draft',blDraftEndpoint],['Tracking',trackingEndpoint]] as any[]){if(value&&!/^https:\/\//i.test(value))throw new BadRequestException(`${label} endpoint must use HTTPS`);}
    if(secretEnv&&!/^[A-Z][A-Z0-9_]*$/.test(secretEnv))throw new BadRequestException('Secret environment key must use A-Z, 0-9 and underscore');
    if(authMode!=='NONE'&&!secretEnv)throw new BadRequestException('A secure secret environment key is required for authenticated providers');
    if(authMode==='BASIC'&&!this.text(body?.username))throw new BadRequestException('Username is required for BASIC authentication');
    const carrierOrgId=this.text(body?.carrierOrgId)||null;
    if(carrierOrgId){const org=await this.db.organization.findUnique({where:{id:carrierOrgId}});if(!org||!org.active||!Array.isArray(org.roles)||!org.roles.includes('CARRIER'))throw new BadRequestException('Carrier organization must be an active CARRIER');}
    const rateBasis=this.text(body?.rateBasis||'PER_UNIT').toUpperCase();
    if(!['PER_UNIT','TOTAL_BOOKING'].includes(rateBasis))throw new BadRequestException('Rate basis must be PER_UNIT or TOTAL_BOOKING');
    const defaultPricingMethod=this.text(body?.defaultPricingMethod||'MARKUP_PCT').toUpperCase();
    if(!['MARKUP_PCT','GROSS_MARGIN_PCT','FIXED_AMOUNT'].includes(defaultPricingMethod))throw new BadRequestException('Invalid default pricing method');
    const defaultPricingValue=Number(body?.defaultPricingValue??body?.defaultMarginPct??0),minimumMarkupPct=Number(body?.minimumMarkupPct??0);
    if(!Number.isFinite(defaultPricingValue)||defaultPricingValue<0||defaultPricingValue>500)throw new BadRequestException('Default pricing value must be between 0 and 500');
    if(defaultPricingMethod==='GROSS_MARGIN_PCT'&&defaultPricingValue>=100)throw new BadRequestException('Gross margin % must be below 100');
    if(!Number.isFinite(minimumMarkupPct)||minimumMarkupPct<0||minimumMarkupPct>500)throw new BadRequestException('Minimum markup % must be between 0 and 500');
    const paymentTermsDays=Number(body?.paymentTermsDays??30),prepaidPct=Number(body?.prepaidPct??0),creditLimit=body?.creditLimit==null||body.creditLimit===''?null:Number(body.creditLimit);
    if(!Number.isFinite(paymentTermsDays)||paymentTermsDays<0||paymentTermsDays>365)throw new BadRequestException('Payment terms must be between 0 and 365 days');
    if(!Number.isFinite(prepaidPct)||prepaidPct<0||prepaidPct>100)throw new BadRequestException('Prepaid % must be between 0 and 100');
    if(creditLimit!=null&&(!Number.isFinite(creditLimit)||creditLimit<0))throw new BadRequestException('Carrier credit limit is invalid');
    const creditCurrency=this.text(body?.creditCurrency||'USD').toUpperCase();if(!/^[A-Z]{3}$/.test(creditCurrency))throw new BadRequestException('Credit currency must be a 3-letter code');
    const carrierIdentity={
      accountName:this.text(body?.carrierIdentity?.accountName||body?.carrierAccountName||'ANC')||'ANC',
      accountCode:this.text(body?.carrierIdentity?.accountCode||body?.carrierAccountCode)||null,
      masterShipperName:this.text(body?.carrierIdentity?.masterShipperName||body?.masterShipperName||body?.carrierIdentity?.accountName||body?.carrierAccountName||'ANC')||'ANC',
      masterConsigneeName:this.text(body?.carrierIdentity?.masterConsigneeName||body?.masterConsigneeName)||null,
      masterNotifyPartyName:this.text(body?.carrierIdentity?.masterNotifyPartyName||body?.masterNotifyPartyName)||null
    };
    const dataProtection={identityShield:'STRICT',customerKycOutbound:false,customerReferenceOutbound:false,customerPartyOutbound:false,houseDocumentDataOutbound:false};
    const capMode=(value:any,fallback='DISABLED')=>{const mode=this.text(value||fallback).toUpperCase();if(!['DISABLED','API','EDI','MANUAL'].includes(mode))throw new BadRequestException('Carrier capability mode must be DISABLED, API, EDI or MANUAL');return mode;};
    const capabilities={
      RATES:capMode(body?.capabilities?.RATES,endpoint?'API':'DISABLED'),
      BOOKING:capMode(body?.capabilities?.BOOKING,bookingEndpoint?'API':'DISABLED'),
      AMENDMENT:capMode(body?.capabilities?.AMENDMENT,amendmentEndpoint?'API':'DISABLED'),
      CANCELLATION:capMode(body?.capabilities?.CANCELLATION,cancellationEndpoint?'API':'DISABLED'),
      VGM:capMode(body?.capabilities?.VGM,vgmEndpoint?'API':'DISABLED'),
      SHIPPING_INSTRUCTIONS:capMode(body?.capabilities?.SHIPPING_INSTRUCTIONS,shippingInstructionsEndpoint?'API':'DISABLED'),
      BL_DRAFT:capMode(body?.capabilities?.BL_DRAFT,blDraftEndpoint?'API':'DISABLED'),
      TRACKING:capMode(body?.capabilities?.TRACKING,trackingEndpoint?'API':'DISABLED')
    };
    const optionalCapabilities={
      ADDITIONAL_FREE_TIME:capMode(body?.optionalCapabilities?.ADDITIONAL_FREE_TIME,'DISABLED'),
      GREEN_PRODUCT:capMode(body?.optionalCapabilities?.GREEN_PRODUCT,'DISABLED'),
      SHIPPING_GUARANTEE:capMode(body?.optionalCapabilities?.SHIPPING_GUARANTEE,'DISABLED'),
      LIVE_REEFER:capMode(body?.optionalCapabilities?.LIVE_REEFER,'DISABLED'),
      INLAND_RATE:capMode(body?.optionalCapabilities?.INLAND_RATE,'DISABLED'),
      LOCAL_CHARGES:capMode(body?.optionalCapabilities?.LOCAL_CHARGES,'DISABLED')
    };
    const fieldMap:any={},surchargeFieldMap:any={};
    for(const k of ['buyRate','currency','carrier','serviceName','vessel','voyage','origin','destination','equipment','quantity','etd','eta','validTo','externalQuoteRef','surcharges']){const v=this.text(body?.fieldMap?.[k]??body?.[`${k}Path`]);if(v)fieldMap[k]=v;}
    for(const k of ['chargeCode','description','amount','currency']){const v=this.text(body?.surchargeFieldMap?.[k]??body?.[`surcharge${k.charAt(0).toUpperCase()+k.slice(1)}Path`]);if(v)surchargeFieldMap[k]=v;}
    const payload={
      providerCode,name,carrier:this.text(body?.carrier||name),carrierOrgId,authMode,
      username:this.text(body?.username)||null,secretEnv:secretEnv||null,apiKeyHeader:this.text(body?.apiKeyHeader||'x-api-key')||'x-api-key',
      endpoint:endpoint||null,bookingEndpoint:bookingEndpoint||null,amendmentEndpoint:amendmentEndpoint||null,cancellationEndpoint:cancellationEndpoint||null,vgmEndpoint:vgmEndpoint||null,shippingInstructionsEndpoint:shippingInstructionsEndpoint||null,blDraftEndpoint:blDraftEndpoint||null,trackingEndpoint:trackingEndpoint||null,capabilities,optionalCapabilities,carrierIdentity,dataProtection,responseArrayPath:this.text(body?.responseArrayPath)||null,fieldMap,surchargeFieldMap,bookingFieldMap:{carrierBookingNo:this.text(body?.carrierBookingNoPath)||null},
      rateBasis,buyIncludesSurcharges:Boolean(body?.buyIncludesSurcharges),
      defaultPricingMethod,defaultPricingValue,defaultMarginPct:defaultPricingMethod==='MARKUP_PCT'?defaultPricingValue:0,minimumMarkupPct,
      paymentTermsDays:Math.round(paymentTermsDays),paymentMethod:this.text(body?.paymentMethod||'BANK_TRANSFER').toUpperCase(),
      prepaidPct:this.round(prepaidPct),creditLimit:creditLimit==null?null:this.round(creditLimit),creditCurrency,
      active:body?.active!==false,notes:this.text(body?.notes)||null,updatedBy:user.sub
    };
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'PROVIDER_PROFILE_SET',externalId:providerCode,objectType:PROVIDER_OBJECT,objectId:providerCode,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'CARRIER_RATE_PROVIDER_SET',objectType:PROVIDER_OBJECT,objectId:providerCode,detail:{name,carrierOrgId,authMode,endpoint:endpoint||null,bookingEndpoint:bookingEndpoint||null,capabilities,optionalCapabilities,carrierIdentity,dataProtection,rateBasis,defaultPricingMethod,defaultPricingValue,minimumMarkupPct,paymentTermsDays:payload.paymentTermsDays,active:payload.active}});
    return {...payload,...this.readiness(payload)};
  }

  private async bookingRow(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.db.booking.findUnique({where:{id:bookingId},include:{customer:{select:{id:true,code:true,name:true}},rateQuote:true}});
    if(!booking)throw new NotFoundException('Booking not found');
    this.assertRateAccess(booking,user);
    return booking;
  }

  private enrichOffer(x:any){const buy=this.round(x?.allInBuyRate??x?.buyRate),base=this.round(x?.baseBuyRate??buy),surcharge=this.round(x?.surchargeTotal??Math.max(0,buy-base));return {...x,baseBuyRate:base,surchargeTotal:surcharge,allInBuyRate:buy,buyRate:buy,costLines:Array.isArray(x?.costLines)&&x.costLines.length?x.costLines:[{chargeCode:'OCEAN_FREIGHT',description:'Ocean freight',unitRate:buy}]};}
  private async storedOffers(bookingId:string){const rows=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:OFFER_OBJECT,eventType:'RATE_OFFER_RECEIVED'},orderBy:{createdAt:'desc'},take:800});return rows.map((e:any)=>this.enrichOffer({...this.payload(e),offerId:e.objectId,receivedAt:e.createdAt})).filter((x:any)=>x.bookingId===bookingId).slice(0,150);}
  private async selected(bookingId:string){const e=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:OFFER_OBJECT,eventType:'RATE_OFFER_SELECTED',externalId:bookingId},orderBy:{createdAt:'desc'}});return e?{...this.payload(e),selectedAt:e.createdAt}:null;}
  private async lastSearch(bookingId:string){const e=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:SEARCH_OBJECT,eventType:'RATE_SEARCH_COMPLETED',externalId:bookingId},orderBy:{createdAt:'desc'}});return e?{...this.payload(e),searchedAt:e.createdAt}:null;}

  private priceForOffer(offer:any,provider:any){
    const buy=this.round(offer?.allInBuyRate??offer?.buyRate);
    if(offer?.filedSellRate!=null&&Number.isFinite(Number(offer.filedSellRate))&&Number(offer.filedSellRate)>=buy)return this.round(offer.filedSellRate);
    const method=this.text(provider?.defaultPricingMethod||'MARKUP_PCT').toUpperCase(),value=Number(provider?.defaultPricingValue??provider?.defaultMarginPct??0);
    if(method==='GROSS_MARGIN_PCT'&&value>=0&&value<100)return this.round(buy/(1-value/100));
    if(method==='FIXED_AMOUNT'&&value>=0)return this.round(buy+value);
    return this.round(buy*(1+Math.max(0,value)/100));
  }
  private publicOffer(offer:any,provider:any){
    if(offer?.filedSellRate==null&&!provider)return null;
    const sellRate=this.priceForOffer(offer,provider);
    if(!Number.isFinite(Number(sellRate))||Number(sellRate)<=0)return null;
    return {offerId:offer.offerId,bookingId:offer.bookingId,source:offer.source,carrier:offer.carrier,serviceName:offer.serviceName||null,vessel:offer.vessel||null,voyage:offer.voyage||null,origin:offer.origin,destination:offer.destination,equipment:offer.equipment,quantity:offer.quantity,etd:offer.etd||null,eta:offer.eta||null,sellRate,currency:offer.currency,validTo:offer.validTo||null,freeTimeOrigin:offer.freeTimeOrigin??null,freeTimeDestination:offer.freeTimeDestination??null};
  }

  async booking(bookingId:string,user:ScopeUser){
    const booking=await this.bookingRow(bookingId,user),offers=await this.storedOffers(bookingId),selection=await this.selected(bookingId),lastSearch=await this.lastSearch(bookingId);
    if(this.external(user)){
      const profiles=await this.providerProfiles(),byCode=new Map(profiles.map((p:any)=>[String(p.providerCode),p]));
      return {booking:{id:booking.id,bookingNo:booking.bookingNo,businessModel:booking.businessModel,bookingChannel:booking.bookingChannel,status:booking.status,origin:booking.origin,destination:booking.destination,portOfLoading:booking.portOfLoading,portOfDischarge:booking.portOfDischarge,equipment:booking.equipment,quantity:booking.quantity,commodity:booking.commodity,specialCargo:booking.specialCargo,etd:booking.etd,currency:booking.currency,carrier:booking.carrier,rateQuote:booking.rateQuote?{id:booking.rateQuote.id,quoteNo:booking.rateQuote.quoteNo,sellRate:booking.rateQuote.sellRate,currency:booking.rateQuote.currency,status:booking.rateQuote.status,validTo:booking.rateQuote.validTo}:null,customer:booking.customer},providers:[],carriers:[],offers:offers.map((o:any)=>this.publicOffer(o,byCode.get(String(o.providerCode)))).filter(Boolean),selection:selection?{offerId:selection.offerId,quoteNo:selection.quoteNo,sellRate:selection.sellRate,currency:selection.currency,selectedAt:selection.selectedAt}:null,lastSearch:lastSearch?{searchedAt:lastSearch.searchedAt,totalOffers:lastSearch.totalOffers}:null};
    }
    const [providers,carriers]=await Promise.all([this.providerProfiles(),this.carriers(user)]);return {booking,providers,offers,carriers,selection,lastSearch};
  }

  private same(a:any,b:any){return this.text(a).toUpperCase()===this.text(b).toUpperCase();}
  private async contractOffers(booking:any){
    const now=new Date(),contracts=await this.db.serviceContract.findMany({where:{validFrom:{lte:now},validTo:{gte:now},status:{notIn:['DRAFT','CANCELLED','EXPIRED']}},include:{rates:true}});
    const origin=this.text(booking.portOfLoading||booking.origin).toUpperCase(),destination=this.text(booking.portOfDischarge||booking.destination).toUpperCase(),equipment=this.text(booking.equipment).toUpperCase(),out:any[]=[];
    for(const c of contracts){
      const lanes=(c.rates||[]).filter((r:any)=>this.same(r.origin,origin)&&this.same(r.destination,destination)&&this.same(r.equipment,equipment)&&r.buyRate!=null);if(!lanes.length)continue;
      const org=await this.db.organization.findUnique({where:{id:c.partyId},select:{id:true,name:true,code:true,active:true}});
      const grouped=new Map<string,any[]>();for(const r of lanes){const key=String(r.currency||c.currency||'USD').toUpperCase();if(!grouped.has(key))grouped.set(key,[]);grouped.get(key)!.push(r);}
      for(const [currency,rows] of grouped){
        const costLines=this.aggregateLines(rows.map((r:any)=>({chargeCode:r.chargeCode||'OCEAN_FREIGHT',description:r.chargeCode||'Contract charge',unitRate:Number(r.buyRate||0)}))),allInBuyRate=this.round(costLines.reduce((s:number,x:any)=>s+Number(x.unitRate||0),0)),baseBuyRate=this.round(costLines.filter((x:any)=>x.chargeCode==='OCEAN_FREIGHT').reduce((s:number,x:any)=>s+x.unitRate,0)),surchargeTotal=this.round(allInBuyRate-baseBuyRate),filedSellRate=rows.every((r:any)=>r.sellRate!=null)?this.round(rows.reduce((s:number,r:any)=>s+Number(r.sellRate||0),0)):null;
        out.push({offerId:this.id('OFF'),bookingId:booking.id,source:'CONTRACT',providerCode:c.contractNo,carrier:org?.name||org?.code||c.partyId,carrierOrgId:org?.id||c.partyId,serviceName:c.contractType||'CONTRACT',origin,destination,equipment,quantity:Math.max(1,Number(booking.quantity||1)),rateBasis:'PER_UNIT',baseBuyRate,surchargeTotal,allInBuyRate,buyRate:allInBuyRate,filedSellRate,currency,validTo:c.validTo.toISOString(),externalQuoteRef:c.contractNo,freeTimeOrigin:Math.max(...rows.map((r:any)=>Number(r.freeTimeOrigin||0))),freeTimeDestination:Math.max(...rows.map((r:any)=>Number(r.freeTimeDestination||0))),costLines,surcharges:costLines.filter((x:any)=>x.chargeCode!=='OCEAN_FREIGHT')});
      }
    }return out;
  }

  private authHeaders(provider:any){const headers:any={'content-type':'application/json','accept':'application/json'};if(provider.authMode==='NONE')return headers;const secret=provider.secretEnv?process.env[String(provider.secretEnv)]:undefined;if(!secret)throw new Error(`Secret environment variable ${provider.secretEnv||'(missing)'} is not configured`);if(provider.authMode==='BASIC')headers.authorization=`Basic ${Buffer.from(`${provider.username||''}:${secret}`).toString('base64')}`;if(provider.authMode==='BEARER')headers.authorization=`Bearer ${secret}`;if(provider.authMode==='API_KEY')headers[provider.apiKeyHeader||'x-api-key']=secret;return headers;}

  private normalizeSurcharges(provider:any,row:any,quantity:number,mainCurrency:string){
    const raw=this.mapped(provider,row,'surcharges',['surcharges','charges','chargeLines']);const list=Array.isArray(raw)?raw:[];const lines:any[]=[];
    for(const x of list){if(x?.excluded===true||x?.included===false)continue;const amountRaw=provider?.surchargeFieldMap?.amount?this.path(x,provider.surchargeFieldMap.amount):(x?.amount??x?.rate??x?.buyRate);const unitRate=this.unitAmount(amountRaw,provider.rateBasis,quantity);if(unitRate==null)continue;const currency=this.text(provider?.surchargeFieldMap?.currency?this.path(x,provider.surchargeFieldMap.currency):(x?.currency||mainCurrency)).toUpperCase();if(currency&&currency!==mainCurrency)throw new Error(`Carrier offer contains mixed surcharge currency ${currency}; FX normalization is required before quoting`);const chargeCode=this.text(provider?.surchargeFieldMap?.chargeCode?this.path(x,provider.surchargeFieldMap.chargeCode):(x?.chargeCode||x?.code||x?.name||'SURCHARGE')).toUpperCase().replace(/\s+/g,'_');const description=this.text(provider?.surchargeFieldMap?.description?this.path(x,provider.surchargeFieldMap.description):(x?.description||x?.name||chargeCode));lines.push({chargeCode,description,unitRate});}
    return this.aggregateLines(lines);
  }

  private normalizeExternal(provider:any,booking:any,row:any){
    const quantity=Math.max(1,Number(this.mapped(provider,row,'quantity',['quantity'])||booking.quantity||1)),basis=provider.rateBasis||'PER_UNIT';
    const rawBuy=this.mapped(provider,row,'buyRate',['buyRate','rate','amount','price']);const normalizedBuy=this.unitAmount(rawBuy,basis,quantity);if(normalizedBuy==null)return null;
    const currency=this.text(this.mapped(provider,row,'currency',['currency'])||booking.currency||'USD').toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error('Carrier offer currency is invalid');
    const surchargeLines=this.normalizeSurcharges(provider,row,quantity,currency),surchargeTotal=this.round(surchargeLines.reduce((s:number,x:any)=>s+Number(x.unitRate||0),0));
    let baseBuyRate=normalizedBuy,allInBuyRate=this.round(normalizedBuy+surchargeTotal);
    if(provider.buyIncludesSurcharges){if(surchargeTotal-normalizedBuy>0.005)throw new Error('Carrier surcharge detail exceeds the all-in buy amount');allInBuyRate=normalizedBuy;baseBuyRate=this.round(normalizedBuy-surchargeTotal);}
    const costLines=this.aggregateLines([{chargeCode:'OCEAN_FREIGHT',description:'Ocean freight',unitRate:baseBuyRate},...surchargeLines]);
    const origin=this.text(this.mapped(provider,row,'origin',['origin'])||booking.portOfLoading||booking.origin).toUpperCase(),destination=this.text(this.mapped(provider,row,'destination',['destination'])||booking.portOfDischarge||booking.destination).toUpperCase(),equipment=this.text(this.mapped(provider,row,'equipment',['equipment'])||booking.equipment).toUpperCase();
    return {offerId:this.id('OFF'),bookingId:booking.id,source:'ONLINE',providerCode:provider.providerCode,carrier:this.text(this.mapped(provider,row,'carrier',['carrier'])||provider.carrier||provider.name),carrierOrgId:provider.carrierOrgId||null,serviceName:this.text(this.mapped(provider,row,'serviceName',['serviceName','service']))||null,vessel:this.text(this.mapped(provider,row,'vessel',['vessel']))||null,voyage:this.text(this.mapped(provider,row,'voyage',['voyage']))||null,origin,destination,equipment,quantity,rateBasis:'PER_UNIT',etd:this.iso(this.mapped(provider,row,'etd',['etd'])),eta:this.iso(this.mapped(provider,row,'eta',['eta'])),baseBuyRate,surchargeTotal,allInBuyRate,buyRate:allInBuyRate,currency,validTo:this.iso(this.mapped(provider,row,'validTo',['validTo','expiry']))||new Date(Date.now()+7*86400000).toISOString(),externalQuoteRef:this.text(this.mapped(provider,row,'externalQuoteRef',['externalQuoteRef','quoteReference','quoteNo']))||null,freeTimeOrigin:row?.freeTimeOrigin==null?null:Number(row.freeTimeOrigin),freeTimeDestination:row?.freeTimeDestination==null?null:Number(row.freeTimeDestination),costLines,surcharges:surchargeLines,rawMeta:row?.meta||null};
  }

  private async onlineOffers(provider:any,booking:any){
    if(!provider.endpoint)return {offers:[],error:'No online endpoint configured'};
    const ancRef=this.text(booking.bookingNo||booking.requestId||booking.id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
    const request={
      requestReference:'ANC-RATE-'+ancRef,
      bookingParty:{name:provider?.carrierIdentity?.accountName||'ANC',accountCode:provider?.carrierIdentity?.accountCode||null},
      origin:this.text(booking.origin).toUpperCase(),destination:this.text(booking.destination).toUpperCase(),
      portOfLoading:this.text(booking.portOfLoading||booking.origin).toUpperCase(),portOfDischarge:this.text(booking.portOfDischarge||booking.destination).toUpperCase(),
      equipment:this.text(booking.equipment).toUpperCase(),quantity:Math.max(1,Number(booking.quantity||1)),
      commodity:booking.commodity||null,specialCargo:booking.specialCargo||null,grossWeight:booking.grossWeight||null,volumeCbm:booking.volumeCbm||null,
      requestedEtd:booking.etd||null,currency:booking.currency||'USD'
    };
    assertAncCarrierOutboundPayload(request);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000),started=Date.now();
    try{
      const response=await (globalThis as any).fetch(provider.endpoint,{method:'POST',headers:this.authHeaders(provider),body:JSON.stringify(request),signal:controller.signal});const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{};}catch{data={message:text};}
      if(!response.ok)throw new Error(data?.message||`Carrier endpoint returned HTTP ${response.status}`);
      const mappedArray=provider.responseArrayPath?this.path(data,provider.responseArrayPath):undefined,rows=Array.isArray(mappedArray)?mappedArray:Array.isArray(data)?data:Array.isArray(data?.offers)?data.offers:Array.isArray(data?.rates)?data.rates:[];
      const offers=rows.map((x:any)=>this.normalizeExternal(provider,booking,x)).filter(Boolean);return {offers,error:null,latencyMs:Date.now()-started};
    }catch(e:any){return {offers:[],error:e?.name==='AbortError'?'Carrier rate request timed out':(e?.message||'Carrier rate request failed'),latencyMs:Date.now()-started};}finally{clearTimeout(timer);}
  }

  async search(bookingId:string,user:ScopeUser){
    const booking=await this.bookingRow(bookingId,user);if(!booking.equipment)throw new BadRequestException('Booking equipment is required before rate search');const current=String(booking.status);if(current==='DRAFT')await this.db.booking.update({where:{id:bookingId},data:{status:'RATE_REQUESTED'}});
    const allProfiles=await this.providerProfiles(),providers=allProfiles.filter((p:any)=>p.active!==false&&p.endpoint),contract=await this.contractOffers(booking),external:any[]=[],providerErrors:any[]=[],providerResults:any[]=[];
    for(const p of providers){const result=await this.onlineOffers(p,booking);external.push(...result.offers);providerResults.push({providerCode:p.providerCode,name:p.name,offers:result.offers.length,latencyMs:result.latencyMs,status:result.error?'ERROR':'OK'});if(result.error)providerErrors.push({providerCode:p.providerCode,name:p.name,error:result.error});}
    const offers=[...contract,...external],searchId=this.id('RSEARCH');
    await this.db.$transaction(async(tx:any)=>{
      for(const offer of offers)await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'RATE_OFFER_RECEIVED',externalId:bookingId,objectType:OFFER_OBJECT,objectId:offer.offerId,status:'COMPLETED',payload:offer,completedAt:new Date()}});
      await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'RATE_SEARCH_COMPLETED',externalId:bookingId,objectType:SEARCH_OBJECT,objectId:searchId,status:providerErrors.length?'COMPLETED_WITH_WARNINGS':'COMPLETED',payload:{bookingId,searchId,contractOffers:contract.length,onlineOffers:external.length,totalOffers:offers.length,providerResults,providerErrors,searchedBy:user.sub},completedAt:new Date()}});
      if(offers.length&&!TERMINAL_BOOKING.has(current))await tx.booking.update({where:{id:bookingId},data:{status:'RATE_RECEIVED'}});
    });
    await this.audit.log({actorId:user.sub,action:'CARRIER_RATE_SEARCH',objectType:'Booking',objectId:bookingId,bookingId,detail:{businessModel:booking.businessModel||'NVOCC',bookingChannel:booking.bookingChannel||'INTERNAL',providers:providers.map((p:any)=>p.providerCode),contractOffers:contract.length,onlineOffers:external.length,providerErrors}});
    if(this.external(user)){const byCode=new Map(allProfiles.map((p:any)=>[String(p.providerCode),p]));return {bookingId,offers:offers.map((o:any)=>this.publicOffer(o,byCode.get(String(o.providerCode)))).filter(Boolean),providerErrors:providerErrors.map((x:any)=>({carrier:x.name||x.providerCode,error:'Rate source temporarily unavailable'})),providerResults:providerResults.map((x:any)=>({carrier:x.name,offers:x.offers,status:x.status}))};}
    return {bookingId,offers,providerErrors,providerResults};
  }

  async select(bookingId:string,offerId:string,body:any,user:ScopeUser){
    const booking=await this.bookingRow(bookingId,user),row=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:OFFER_OBJECT,objectId:offerId,eventType:'RATE_OFFER_RECEIVED'},orderBy:{createdAt:'desc'}});if(!row)throw new NotFoundException('Carrier rate offer not found');
    const offer:any=this.enrichOffer(this.payload(row));if(offer.bookingId!==bookingId)throw new BadRequestException('Rate offer does not belong to this booking');if(offer.validTo&&new Date(offer.validTo).getTime()<Date.now())throw new BadRequestException('Carrier rate offer has expired');
    const provider=(await this.providerProfiles()).find((p:any)=>p.providerCode===offer.providerCode),isExternal=this.external(user);
    if(isExternal&&offer.filedSellRate==null&&!provider)throw new BadRequestException('This carrier rate is not approved for external selling');
    let pricingMethod=this.text(provider?.defaultPricingMethod||'MARKUP_PCT').toUpperCase();let pricingValue=Number(provider?.defaultPricingValue??provider?.defaultMarginPct??0);
    if(!isExternal){pricingMethod=this.text(body?.pricingMethod||pricingMethod).toUpperCase();pricingValue=body?.pricingValue==null||body?.pricingValue===''?pricingValue:Number(body.pricingValue);}
    if(!isExternal&&body?.marginAmount!=null&&body.marginAmount!==''){pricingMethod='FIXED_AMOUNT';pricingValue=Number(body.marginAmount);}else if(!isExternal&&body?.marginPct!=null&&body.marginPct!==''&&body?.pricingValue==null){pricingMethod='MARKUP_PCT';pricingValue=Number(body.marginPct);}
    if(!['MARKUP_PCT','GROSS_MARGIN_PCT','FIXED_AMOUNT'].includes(pricingMethod))throw new BadRequestException('Invalid pricing method');if(!Number.isFinite(pricingValue)||pricingValue<0)throw new BadRequestException('Pricing value must be positive');if(pricingMethod==='GROSS_MARGIN_PCT'&&pricingValue>=100)throw new BadRequestException('Gross margin % must be below 100');if(pricingMethod==='MARKUP_PCT'&&pricingValue>500)throw new BadRequestException('Markup % must be 500 or below');
    const buyRate=this.money(offer.allInBuyRate??offer.buyRate,'All-in buy rate');let sellRate=isExternal&&offer.filedSellRate!=null?this.round(offer.filedSellRate):buyRate;if(!(isExternal&&offer.filedSellRate!=null)){if(pricingMethod==='MARKUP_PCT')sellRate=this.round(buyRate*(1+pricingValue/100));if(pricingMethod==='GROSS_MARGIN_PCT')sellRate=this.round(buyRate/(1-pricingValue/100));if(pricingMethod==='FIXED_AMOUNT')sellRate=this.round(buyRate+pricingValue);}
    const markupPct=buyRate?this.round((sellRate-buyRate)/buyRate*100):0,grossMarginPct=sellRate?this.round((sellRate-buyRate)/sellRate*100):0,minimumMarkupPct=Number(provider?.minimumMarkupPct||0);if(markupPct+0.005<minimumMarkupPct)throw new BadRequestException(`Selected sell rate is below provider minimum markup of ${minimumMarkupPct}%`);
    const quoteNo=this.text(body?.quoteNo)||`Q-${Date.now().toString().slice(-9)}`,validTo=offer.validTo?new Date(offer.validTo):new Date(Date.now()+7*86400000),trade=`${this.text(offer.origin||booking.portOfLoading||booking.origin).toUpperCase()} -> ${this.text(offer.destination||booking.portOfDischarge||booking.destination).toUpperCase()}`,quantity=Math.max(1,Number(booking.quantity||offer.quantity||1));
    const commercialTerms={carrierOrgId:offer.carrierOrgId||provider?.carrierOrgId||null,paymentTermsDays:Number(provider?.paymentTermsDays??30),paymentMethod:provider?.paymentMethod||'BANK_TRANSFER',prepaidPct:Number(provider?.prepaidPct||0),creditLimit:provider?.creditLimit??null,creditCurrency:provider?.creditCurrency||offer.currency||booking.currency||'USD'};
    const costLines=this.aggregateLines(Array.isArray(offer.costLines)?offer.costLines:[{chargeCode:'OCEAN_FREIGHT',description:'Ocean freight',unitRate:buyRate}]);
    const result=await this.db.$transaction(async(tx:any)=>{
      const quote=await tx.rateQuote.create({data:{quoteNo,customerId:booking.customerId,trade,equipment:String(offer.equipment||booking.equipment||'').toUpperCase(),buyRate,sellRate,currency:String(offer.currency||booking.currency||'USD').toUpperCase(),validFrom:new Date(),validTo,status:isExternal?'Quote Sent':'DRAFT',source:`CARRIER_${offer.source||'RATE'}:${offer.providerCode||offer.carrier||'UNKNOWN'}`}});
      const bookingData:any={rateQuoteId:quote.id,carrier:offer.carrier||booking.carrier||null,currency:quote.currency};if(offer.vessel||offer.voyage)bookingData.vesselVoyage=[offer.vessel,offer.voyage].filter(Boolean).join(' / ');if(offer.etd)bookingData.etd=new Date(offer.etd);if(offer.eta)bookingData.eta=new Date(offer.eta);if(!TERMINAL_BOOKING.has(String(booking.status)))bookingData.status=isExternal?'QUOTE_SENT':'RATE_RECEIVED';await tx.booking.update({where:{id:bookingId},data:bookingData});
      const leg=await tx.bookingLeg.findFirst({where:{bookingId,legType:'MAIN'},orderBy:{sequence:'asc'}}),legData:any={carrier:offer.carrier||null,etd:offer.etd?new Date(offer.etd):null,eta:offer.eta?new Date(offer.eta):null,status:'PLANNED'};if(offer.vessel)legData.vessel=offer.vessel;if(offer.voyage)legData.voyage=offer.voyage;if(leg)await tx.bookingLeg.update({where:{id:leg.id},data:legData});else await tx.bookingLeg.create({data:{bookingId,sequence:1,legType:'MAIN',mode:booking.transportMode||'SEA',origin:booking.portOfLoading||booking.origin,destination:booking.portOfDischarge||booking.destination,...legData}});
      await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'RATE_OFFER_SELECTED',externalId:bookingId,objectType:OFFER_OBJECT,objectId:offerId,status:'COMPLETED',payload:{bookingId,offerId,quoteId:quote.id,quoteNo,providerCode:offer.providerCode||null,carrier:offer.carrier||null,externalQuoteRef:offer.externalQuoteRef||null,baseBuyRate:this.round(offer.baseBuyRate),surchargeTotal:this.round(offer.surchargeTotal),allInBuyRate:buyRate,buyRate,sellRate,quantity,totalBuyAmount:this.round(buyRate*quantity),totalSellAmount:this.round(sellRate*quantity),pricingMethod,pricingValue,markupPct,grossMarginPct,costLines,commercialTerms,selectedBy:user.sub},completedAt:new Date()}});
      return quote;
    });
    await this.audit.log({actorId:user.sub,action:'CARRIER_RATE_SELECTED',objectType:'Booking',objectId:bookingId,bookingId,detail:{businessModel:booking.businessModel||'NVOCC',bookingChannel:booking.bookingChannel||'INTERNAL',offerId,providerCode:offer.providerCode,carrier:offer.carrier,externalQuoteRef:offer.externalQuoteRef||null,quoteNo:result.quoteNo,buyRate,sellRate,currency:result.currency,pricingMethod,pricingValue,markupPct,grossMarginPct,costLineCount:costLines.length,commercialTerms}});
    if(isExternal)return {ok:true,offer:this.publicOffer(offer,provider),quote:{id:result.id,quoteNo:result.quoteNo,sellRate:result.sellRate,currency:result.currency,validTo:result.validTo,status:result.status}};
    return {ok:true,offer,quote:result,pricing:{pricingMethod,pricingValue,markupPct,grossMarginPct,grossProfit:this.round(sellRate-buyRate)},commercialTerms,costLines};
  }

  private forwardingPortalRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if(['CUSTOMER','SHIPPER','CONSIGNEE','GLOBAL_ADMIN'].includes(role))return role;
    if(role==='AGENT'&&Array.isArray(user.permissions)&&user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE'))return role;
    throw new ForbiddenException('Forwarding quote access is not granted for this user');
  }

  private async forwardingCustomer(body:any,user:ScopeUser){
    const role=this.forwardingPortalRole(user);
    let customerId=this.text(body?.customerId);
    if(role==='CUSTOMER')customerId=this.text(user.customerId);
    if(role==='SHIPPER'||role==='CONSIGNEE')customerId=this.text(user.partyId);
    if(role==='AGENT')customerId=this.text(user.agentId);
    if(!customerId)throw new BadRequestException('ANC registered customer is required for Forwarding quote');
    const org=await this.db.organization.findUnique({where:{id:customerId}});
    if(!org||!org.active||org.kycStatus!=='APPROVED'||!org.customerRef)throw new BadRequestException('Forwarding quote requires approved KYC and an ANC customer reference');
    let costCenterCode=this.text(body?.costCenterCode||user.costCenterCode||org.costCenterCode).toUpperCase();
    if(!costCenterCode)throw new BadRequestException('Forwarding cost center is required');
    let forwardingTradeType=this.text(body?.forwardingTradeType||'STANDARD').toUpperCase();
    if(!['STANDARD','DIRECT_COLOAD','CROSS_TRADE'].includes(forwardingTradeType))throw new BadRequestException('Forwarding trade type must be STANDARD, DIRECT_COLOAD or CROSS_TRADE');
    if(role==='AGENT'){
      if(!['DIRECT_COLOAD','CROSS_TRADE'].includes(forwardingTradeType))throw new ForbiddenException('Agent Forwarding access is limited to direct co-load or cross-trade jobs');
      if(!Array.isArray(user.permissions)||!user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE'))throw new ForbiddenException('Agent Forwarding right is not assigned');
      costCenterCode=this.text(user.costCenterCode).toUpperCase();
      if(!costCenterCode)throw new BadRequestException('Agent Forwarding requires an assigned user cost center');
    }
    return {role,org,customerId,customerRef:org.customerRef,costCenterCode,forwardingTradeType};
  }

  async searchForwarding(body:any,user:ScopeUser){
    const access=await this.forwardingCustomer(body,user);
    const origin=this.text(body?.origin).toUpperCase(),destination=this.text(body?.destination).toUpperCase(),equipment=this.text(body?.equipment).toUpperCase();
    if(!origin||!destination||!equipment)throw new BadRequestException('Origin, destination and equipment are required');
    if(origin===destination)throw new BadRequestException('Origin and destination must be different');
    const quantity=Math.max(1,Math.min(999,Math.floor(Number(body?.quantity||1))));
    const requestId=this.id('FQR');
    const requestData={
      requestId,customerId:access.customerId,customerRef:access.customerRef,costCenterCode:access.costCenterCode,
      forwardingTradeType:access.forwardingTradeType,origin,destination,
      portOfLoading:this.text(body?.portOfLoading||origin).toUpperCase(),portOfDischarge:this.text(body?.portOfDischarge||destination).toUpperCase(),
      placeOfReceipt:this.text(body?.placeOfReceipt)||null,placeOfDelivery:this.text(body?.placeOfDelivery)||null,
      equipment,quantity,commodity:this.text(body?.commodity)||null,grossWeight:body?.grossWeight==null||body?.grossWeight===''?null:Number(body.grossWeight),
      volumeCbm:body?.volumeCbm==null||body?.volumeCbm===''?null:Number(body.volumeCbm),specialCargo:this.text(body?.specialCargo||'NONE').toUpperCase(),
      bookingType:this.text(body?.bookingType||'FCL').toUpperCase(),transportMode:this.text(body?.transportMode||'SEA').toUpperCase(),
      serviceType:this.text(body?.serviceType||'PORT_TO_PORT').toUpperCase(),freightTerms:this.text(body?.freightTerms||'PREPAID').toUpperCase(),
      currency:this.text(body?.currency||'USD').toUpperCase(),customerReference:this.text(body?.customerReference)||null,
      shipper:this.text(body?.shipper)||null,consignee:this.text(body?.consignee)||null,etd:this.iso(body?.etd),
      createdBy:user.sub
    };
    const shell:any={id:requestId,businessModel:'FORWARDING',bookingChannel:'FORWARDING_QUOTE_REQUEST',...requestData};
    const allProfiles=await this.providerProfiles(),providers=allProfiles.filter((p:any)=>p.active!==false&&p.endpoint);
    const contract=await this.contractOffers(shell),external:any[]=[],providerErrors:any[]=[],providerResults:any[]=[];
    for(const p of providers){
      const result=await this.onlineOffers(p,shell);external.push(...result.offers);
      providerResults.push({providerCode:p.providerCode,name:p.name,offers:result.offers.length,latencyMs:result.latencyMs,status:result.error?'ERROR':'OK'});
      if(result.error)providerErrors.push({providerCode:p.providerCode,name:p.name,error:result.error});
    }
    const offers=[...contract,...external];
    await this.db.$transaction(async(tx:any)=>{
      for(const offer of offers)await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'RATE_OFFER_RECEIVED',externalId:requestId,objectType:OFFER_OBJECT,objectId:offer.offerId,status:'COMPLETED',payload:{...offer,bookingId:requestId,requestId,customerId:access.customerId,customerRef:access.customerRef,costCenterCode:access.costCenterCode,forwardingTradeType:access.forwardingTradeType},completedAt:new Date()}});
      await tx.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'FORWARDING_QUOTE_SEARCH_COMPLETED',externalId:access.customerId,objectType:SEARCH_OBJECT,objectId:requestId,status:providerErrors.length?'COMPLETED_WITH_WARNINGS':'COMPLETED',payload:{...requestData,totalOffers:offers.length,contractOffers:contract.length,onlineOffers:external.length,providerResults,providerErrors},completedAt:new Date()}});
    });
    await this.audit.log({actorId:user.sub,action:'FORWARDING_QUOTE_RATE_SEARCH',objectType:'ForwardingQuoteRequest',objectId:requestId,detail:{customerRef:access.customerRef,costCenterCode:access.costCenterCode,forwardingTradeType:access.forwardingTradeType,origin,destination,equipment,quantity,totalOffers:offers.length}});
    const byCode=new Map(allProfiles.map((p:any)=>[String(p.providerCode),p]));
    return {requestId,customerRef:access.customerRef,costCenterCode:access.costCenterCode,forwardingTradeType:access.forwardingTradeType,offers:offers.map((o:any)=>this.publicOffer(o,byCode.get(String(o.providerCode)))).filter(Boolean),providerErrors:providerErrors.map((x:any)=>({carrier:x.name||x.providerCode,error:'Rate source temporarily unavailable'})),providerResults:providerResults.map((x:any)=>({carrier:x.name,offers:x.offers,status:x.status}))};
  }

  async selectForwarding(requestId:string,offerId:string,body:any,user:ScopeUser){
    const search=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:SEARCH_OBJECT,objectId:requestId,eventType:'FORWARDING_QUOTE_SEARCH_COMPLETED'},orderBy:{createdAt:'desc'}});
    if(!search)throw new NotFoundException('Forwarding quote request not found');
    const request:any=this.payload(search),access=await this.forwardingCustomer({customerId:request.customerId,costCenterCode:request.costCenterCode,forwardingTradeType:request.forwardingTradeType},user);
    if(access.customerId!==request.customerId)throw new ForbiddenException('Forwarding quote request is outside your customer scope');
    const row=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:OFFER_OBJECT,objectId:offerId,eventType:'RATE_OFFER_RECEIVED',externalId:requestId},orderBy:{createdAt:'desc'}});
    if(!row)throw new NotFoundException('Carrier rate offer not found');
    const offer:any=this.enrichOffer(this.payload(row));if(offer.validTo&&new Date(offer.validTo).getTime()<Date.now())throw new BadRequestException('Carrier rate offer has expired');
    const provider=(await this.providerProfiles()).find((p:any)=>p.providerCode===offer.providerCode);
    if(offer.filedSellRate==null&&!provider)throw new BadRequestException('This carrier rate is not approved for external selling');
    const buyRate=this.money(offer.allInBuyRate??offer.buyRate,'All-in buy rate');
    let pricingMethod=this.text(provider?.defaultPricingMethod||'MARKUP_PCT').toUpperCase(),pricingValue=Number(provider?.defaultPricingValue??provider?.defaultMarginPct??0);
    if(access.role==='GLOBAL_ADMIN'&&body?.pricingMethod){pricingMethod=this.text(body.pricingMethod).toUpperCase();pricingValue=Number(body?.pricingValue??pricingValue);}
    let sellRate=offer.filedSellRate!=null?this.round(offer.filedSellRate):buyRate;
    if(offer.filedSellRate==null){
      if(pricingMethod==='MARKUP_PCT')sellRate=this.round(buyRate*(1+pricingValue/100));
      else if(pricingMethod==='GROSS_MARGIN_PCT'){if(pricingValue>=100)throw new BadRequestException('Gross margin % must be below 100');sellRate=this.round(buyRate/(1-pricingValue/100));}
      else if(pricingMethod==='FIXED_AMOUNT')sellRate=this.round(buyRate+pricingValue);
      else throw new BadRequestException('Invalid pricing method');
    }
    const providerCode=this.text(offer.providerCode||provider?.providerCode||offer.carrier).toUpperCase();
    const carrierQuoteRef=this.text(offer.externalQuoteRef);
    if(!providerCode||!carrierQuoteRef)throw new BadRequestException('Carrier code and carrier quote / contract reference are required before ANC can issue a Forwarding quote');
    const quoteNo=`ANC-FWD-Q-${Date.now().toString().slice(-10)}`,validTo=offer.validTo?new Date(offer.validTo):new Date(Date.now()+7*86400000);
    const trade=`${this.text(offer.origin||request.origin).toUpperCase()} -> ${this.text(offer.destination||request.destination).toUpperCase()}`;
    const termsVersion='ANC-FWD-TERMS-2026.1';
    const carrierOfferData={offerId,providerCode,carrier:offer.carrier||null,carrierQuoteRef,serviceName:offer.serviceName||null,vessel:offer.vessel||null,voyage:offer.voyage||null,etd:offer.etd||null,eta:offer.eta||null,baseBuyRate:this.round(offer.baseBuyRate),surchargeTotal:this.round(offer.surchargeTotal),allInBuyRate:buyRate,costLines:Array.isArray(offer.costLines)?offer.costLines:[]};
    const quote=await this.db.rateQuote.create({data:{
      quoteNo,customerId:access.customerId,customerRef:access.customerRef,costCenterCode:access.costCenterCode,trade,
      equipment:String(offer.equipment||request.equipment||'').toUpperCase(),buyRate,sellRate,currency:String(offer.currency||request.currency||'USD').toUpperCase(),
      validFrom:new Date(),validTo,status:'Quote Sent',source:`FORWARDING_CARRIER:${providerCode}`,carrierCode:providerCode,carrierQuoteRef,
      termsVersion,requestData:request,carrierOfferData
    }});
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'FORWARDING_ANC_QUOTE_ISSUED',externalId:requestId,objectType:'RateQuote',objectId:quote.id,status:'COMPLETED',payload:{quoteId:quote.id,quoteNo,customerRef:access.customerRef,costCenterCode:access.costCenterCode,providerCode,carrierQuoteRef,sellRate,currency:quote.currency,termsVersion},completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'FORWARDING_ANC_QUOTE_ISSUED',objectType:'RateQuote',objectId:quote.id,detail:{requestId,quoteNo,customerRef:access.customerRef,costCenterCode:access.costCenterCode,carrierCode:providerCode,carrierQuoteRef,termsVersion}});
    return {quote:{id:quote.id,quoteNo:quote.quoteNo,customerRef:quote.customerRef,carrierCode:quote.carrierCode,carrierQuoteRef:quote.carrierQuoteRef,sellRate:quote.sellRate,currency:quote.currency,validTo:quote.validTo,status:quote.status,termsVersion:quote.termsVersion},requestId};
  }

}
