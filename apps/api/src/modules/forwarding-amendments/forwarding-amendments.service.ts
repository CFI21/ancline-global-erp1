import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_FORWARDING_AMENDMENT';
const OBJECT='ForwardingAmendment';
const RATE_SOURCE='ANCLINE_RATE_PROCUREMENT';
const PROVIDER_OBJECT='CarrierRateProvider';
const ALLOWED_FIELDS=new Set([
  'customerReference','shipperReference','shipper','consignee','notifyParty',
  'origin','destination','placeOfReceipt','portOfLoading','portOfDischarge','placeOfDelivery','transshipmentPort',
  'etd','equipment','quantity','commodity','packageCount','packageType','grossWeight','netWeight','volumeCbm',
  'marksNumbers','hsCode','cargoDescription','incoterm','freightTerms','specialCargo',
  'dgUnNo','dgImoClass','dgPackingGroup','dgProperShippingName',
  'reeferTemperatureC','reeferVentilation','reeferHumidityPct',
  'oogLengthCm','oogWidthCm','oogHeightCm','oogWeightKg'
]);

@Injectable()
export class ForwardingAmendmentsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private id(){return `AMD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;}
  private payload(e:any){return e?.payload&&typeof e.payload==='object'?e.payload:{};}
  private async booking(id:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    const b=await this.db.booking.findUnique({where:{id},include:{rateQuote:true,customer:{select:{id:true,name:true,customerRef:true}}}});
    if(!b)throw new NotFoundException('Booking not found');
    if(String(b.businessModel||'NVOCC').toUpperCase()!=='FORWARDING')throw new BadRequestException('Forwarding amendment workflow is available only for FORWARDING jobs');
    if(['CANCELLED','FINANCIALLY_CLOSED'].includes(String(b.status)))throw new BadRequestException('Cancelled or financially closed jobs cannot be amended');
    if(!b.rateQuote||String(b.rateQuote.status)!=='Customer Accepted'||!b.rateQuote.termsAcceptedAt)throw new BadRequestException('An accepted ANC Forwarding quote and terms are required before booking amendments');
    return b;
  }
  private async provider(b:any){
    const selected=await this.db.integrationEvent.findFirst({where:{sourceSystem:RATE_SOURCE,objectType:'CarrierRateOffer',eventType:'RATE_OFFER_SELECTED',externalId:b.id},orderBy:{createdAt:'desc'}});
    const selectedPayload:any=this.payload(selected);
    const providerCode=String(selectedPayload.providerCode||b.rateQuote?.carrierCode||'').trim().toUpperCase();
    if(!providerCode)return {providerCode:null,profile:null};
    const e=await this.db.integrationEvent.findFirst({where:{sourceSystem:RATE_SOURCE,objectType:PROVIDER_OBJECT,eventType:'PROVIDER_PROFILE_SET',objectId:providerCode},orderBy:{createdAt:'desc'}});
    return {providerCode,profile:e?this.payload(e):null};
  }
  private headers(p:any){
    const h:any={'content-type':'application/json','accept':'application/json'};
    const mode=String(p?.authMode||'NONE').toUpperCase();if(mode==='NONE')return h;
    const secret=p?.secretEnv?process.env[String(p.secretEnv)]:undefined;if(!secret)throw new Error('Carrier integration secret is not configured');
    if(mode==='BASIC')h.authorization=`Basic ${Buffer.from(`${p.username||''}:${secret}`).toString('base64')}`;
    if(mode==='BEARER')h.authorization=`Bearer ${secret}`;
    if(mode==='API_KEY')h[p.apiKeyHeader||'x-api-key']=secret;
    return h;
  }
  private cleanChanges(body:any){
    const input=body?.changes&&typeof body.changes==='object'?body.changes:{};const out:any={};
    for(const [k,v] of Object.entries(input))if(ALLOWED_FIELDS.has(k)){
      if(['etd'].includes(k))out[k]=v?new Date(String(v)):null;
      else if(['quantity','packageCount'].includes(k))out[k]=v==null||v===''?null:Math.max(0,Math.floor(Number(v)));
      else if(['grossWeight','netWeight','volumeCbm','reeferTemperatureC','reeferVentilation','reeferHumidityPct','oogLengthCm','oogWidthCm','oogHeightCm','oogWeightKg'].includes(k))out[k]=v==null||v===''?null:Number(v);
      else out[k]=v==null?null:String(v);
    }
    for(const [k,v] of Object.entries(out))if(typeof v==='number'&&!Number.isFinite(v))throw new BadRequestException(`Invalid numeric value for ${k}`);
    return out;
  }
  private async write(id:string,eventType:string,payload:any,status='COMPLETED'){
    return this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType,objectType:OBJECT,objectId:id,externalId:String(payload.bookingId||''),status,completedAt:status==='COMPLETED'?new Date():null,payload}});
  }
  private async apply(id:string,request:any,user:ScopeUser,carrierResponse:any={}){
    const b=await this.db.booking.findUnique({where:{id:request.bookingId}});if(!b)throw new BadRequestException('Booking not found');
    if(request.requestType==='CANCELLATION'){
      const now=new Date();
      await this.db.booking.update({where:{id:b.id},data:{status:'CANCELLED',cancellationReason:request.reason,cancelledAt:now,cancelledBy:user.sub,shipmentStatus:'CARRIER_CANCELLATION_CONFIRMED'}});
    }else{
      const changes:any={...request.changes,shipmentStatus:'CARRIER_AMENDMENT_CONFIRMED'};
      await this.db.booking.update({where:{id:b.id},data:changes});
    }
    await this.write(id,request.requestType==='CANCELLATION'?'CANCELLATION_CONFIRMED':'AMENDMENT_CONFIRMED',{...request,status:'CONFIRMED',carrierResponse,confirmedAt:new Date().toISOString(),confirmedBy:user.sub});
    await this.audit.log({actorId:user.sub,action:request.requestType==='CANCELLATION'?'FORWARDING_CANCELLATION_CONFIRMED':'FORWARDING_AMENDMENT_CONFIRMED',objectType:OBJECT,objectId:id,bookingId:b.id,detail:{changes:request.changes||{},reason:request.reason,carrierReference:carrierResponse?.reference||carrierResponse?.amendmentReference||carrierResponse?.cancellationReference||null}});
    return {amendmentId:id,status:'CONFIRMED'};
  }
  private async submit(id:string,request:any,b:any,user:ScopeUser){
    const {providerCode,profile}=await this.provider(b);
    const capability=request.requestType==='CANCELLATION'?'CANCELLATION':'AMENDMENT';
    const mode=String(profile?.capabilities?.[capability]||'DISABLED').toUpperCase();
    const endpoint=request.requestType==='CANCELLATION'?profile?.cancellationEndpoint:profile?.amendmentEndpoint;
    const base={...request,providerCode,carrier:b.carrier||profile?.carrier||null,carrierBookingNo:b.carrierBookingNo||null,capabilityMode:mode};
    if(!b.carrierBookingNo){await this.write(id,'AMENDMENT_STATUS_SET',{...base,status:'PENDING_CARRIER_CONFIRMATION',note:'Carrier booking reference not available yet'});return {amendmentId:id,status:'PENDING_CARRIER_CONFIRMATION',providerCode,mode};}
    if(mode==='DISABLED'){await this.write(id,'AMENDMENT_STATUS_SET',{...base,status:'PENDING_CONFIGURATION',note:`${capability} capability is not enabled for this carrier`});return {amendmentId:id,status:'PENDING_CONFIGURATION',providerCode,mode};}
    if(mode==='MANUAL'||mode==='EDI'){const status=mode==='EDI'?'PENDING_EDI':'PENDING_MANUAL';await this.write(id,'AMENDMENT_STATUS_SET',{...base,status});return {amendmentId:id,status,providerCode,mode};}
    if(mode!=='API'||!endpoint){await this.write(id,'AMENDMENT_STATUS_SET',{...base,status:'PENDING_CONFIGURATION',note:'API capability requires a configured endpoint'});return {amendmentId:id,status:'PENDING_CONFIGURATION',providerCode,mode};}
    const body={amendmentId:id,requestType:request.requestType,bookingId:b.id,bookingNo:b.bookingNo,carrierBookingNo:b.carrierBookingNo,ancQuoteRef:b.rateQuote?.quoteNo||null,carrierQuoteRef:b.rateQuote?.carrierQuoteRef||null,reason:request.reason,changes:request.changes||{},requestedBy:user.sub};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await (globalThis as any).fetch(endpoint,{method:'POST',headers:this.headers(profile),body:JSON.stringify(body),signal:controller.signal});
      const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{data={message:raw};}
      if(!response.ok)throw new Error(data?.message||`Carrier endpoint returned HTTP ${response.status}`);
      const carrierStatus=String(data?.status||data?.confirmationStatus||'SUBMITTED').toUpperCase();
      if(['CONFIRMED','ACCEPTED','APPROVED'].includes(carrierStatus))return this.apply(id,request,user,data);
      await this.write(id,'AMENDMENT_STATUS_SET',{...base,status:'SUBMITTED',carrierResponse:data,submittedAt:new Date().toISOString()});
      await this.audit.log({actorId:user.sub,action:'FORWARDING_AMENDMENT_SUBMITTED',objectType:OBJECT,objectId:id,bookingId:b.id,detail:{requestType:request.requestType,providerCode,mode:'API'}});
      return {amendmentId:id,status:'SUBMITTED',providerCode,mode};
    }catch(e:any){
      const reason=e?.name==='AbortError'?'Carrier amendment request timed out':String(e?.message||'Carrier amendment request failed');
      await this.write(id,'AMENDMENT_STATUS_SET',{...base,status:'EXCEPTION',error:reason},'FAILED');
      return {amendmentId:id,status:'EXCEPTION',providerCode,mode,error:reason};
    }finally{clearTimeout(timer);}
  }
  async create(bookingId:string,body:any,user:ScopeUser){
    const b=await this.booking(bookingId,user);
    const requestType=String(body?.requestType||'AMENDMENT').toUpperCase();
    if(!['AMENDMENT','CANCELLATION'].includes(requestType))throw new BadRequestException('Request type must be AMENDMENT or CANCELLATION');
    const reason=String(body?.reason||'').trim();if(!reason)throw new BadRequestException('Reason is required');
    const changes=requestType==='AMENDMENT'?this.cleanChanges(body):{};
    if(requestType==='AMENDMENT'&&!Object.keys(changes).length)throw new BadRequestException('At least one amendment field is required');
    const amendmentId=this.id(),request={amendmentId,bookingId:b.id,bookingNo:b.bookingNo,requestType,reason,changes,requestedAt:new Date().toISOString(),requestedBy:user.sub,customerRef:b.customerRef||b.customer?.customerRef||null,ancQuoteRef:b.rateQuote?.quoteNo||null,carrierQuoteRef:b.rateQuote?.carrierQuoteRef||null};
    await this.write(amendmentId,'AMENDMENT_REQUESTED',request);
    await this.audit.log({actorId:user.sub,action:requestType==='CANCELLATION'?'FORWARDING_CANCELLATION_REQUESTED':'FORWARDING_AMENDMENT_REQUESTED',objectType:OBJECT,objectId:amendmentId,bookingId:b.id,detail:{reason,changes}});
    return this.submit(amendmentId,request,b,user);
  }
  private async rows(user:ScopeUser,bookingId?:string){
    if(bookingId)await this.scope.assertBookingAccess(user,bookingId);
    const events=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:OBJECT,...(bookingId?{externalId:bookingId}:{})},orderBy:{createdAt:'asc'},take:2000});
    const map=new Map<string,any[]>();
    for(const e of events){if(!map.has(e.objectId))map.set(e.objectId,[]);map.get(e.objectId)!.push(e);}
    const out:any[]=[];
    for(const [id,rows] of map){const first=rows.find((e:any)=>e.eventType==='AMENDMENT_REQUESTED');if(!first)continue;const req=this.payload(first);if(!bookingId){try{await this.scope.assertBookingAccess(user,req.bookingId);}catch{continue;}}const last=rows[rows.length-1];const lp=this.payload(last);out.push({...req,...lp,amendmentId:id,status:lp.status||'REQUESTED',createdAt:first.createdAt,updatedAt:last.createdAt});}
    return out.sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime());
  }
  async forBooking(bookingId:string,user:ScopeUser){await this.booking(bookingId,user);return this.rows(user,bookingId);}
  async list(user:ScopeUser){return this.rows(user);}
  async decision(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const events=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:OBJECT,objectId:id},orderBy:{createdAt:'asc'}});
    const first=events.find((e:any)=>e.eventType==='AMENDMENT_REQUESTED');if(!first)throw new NotFoundException('Forwarding amendment not found');
    const req=this.payload(first);await this.scope.assertBookingAccess(user,req.bookingId);
    const decision=String(body?.decision||'').toUpperCase();
    if(decision==='CONFIRM'||decision==='APPROVE')return this.apply(id,req,user,{reference:body?.carrierReference||null,note:body?.note||null,manual:true});
    if(decision==='REJECT'){await this.write(id,'AMENDMENT_STATUS_SET',{...req,status:'REJECTED',reason:body?.note||'Rejected',rejectedBy:user.sub});await this.audit.log({actorId:user.sub,action:'FORWARDING_AMENDMENT_REJECTED',objectType:OBJECT,objectId:id,bookingId:req.bookingId,detail:{note:body?.note||null}});return {amendmentId:id,status:'REJECTED'};}
    throw new BadRequestException('Decision must be CONFIRM or REJECT');
  }
}
