import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const MAX_ATTEMPTS=5;
const movementLabels:Record<string,string>={
  EMPTY_RELEASED:'Empty Released',PICKED_UP:'Empty Picked Up',GATED_IN:'Gate In',VGM_SUBMITTED:'VGM Submitted',
  LOADED:'Loaded on Vessel',DEPARTED:'Departed',TRANSSHIPMENT:'Transshipment',DISCHARGED:'Discharged',
  GATED_OUT:'Gate Out',DELIVERED:'Delivered',EMPTY_RETURNED:'Empty Returned'
};

@Injectable()
export class IntegrationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private assertInternal(user:ScopeUser){this.scope.assertInternal(user);}
  private text(v:any){return v===undefined||v===null?'':String(v).trim();}
  private deterministicId(sourceSystem:string,externalId:string){return `INGEST_${createHash('sha256').update(sourceSystem+'|'+externalId).digest('hex')}`;}
  private uniqueError(e:any){return String(e?.code||'')==='P2002';}
  private sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
  private date(v:any){if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))throw new BadRequestException(`Invalid date/time: ${v}`);return d;}
  private externalClaimId(sourceSystem:string,externalId:string){return 'ievt_'+createHash('sha256').update(sourceSystem+':'+externalId).digest('hex').slice(0,24);}

  async list(user:ScopeUser){
    this.assertInternal(user);
    return this.prisma.integrationEvent.findMany({orderBy:{createdAt:'desc'},take:250});
  }

  async get(id:string,user:ScopeUser){
    this.assertInternal(user);
    const row=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!row) throw new BadRequestException('Integration event not found');
    return row;
  }

  async summary(user:ScopeUser){
    this.assertInternal(user);
    const rows=await this.prisma.integrationEvent.findMany({select:{status:true,sourceSystem:true,attemptCount:true}});
    const statuses=(s:string)=>rows.filter(r=>r.status===s).length;
    return {
      total:rows.length,
      received:statuses('RECEIVED'),
      processing:statuses('PROCESSING'),
      completed:statuses('COMPLETED'),
      failed:statuses('FAILED'),
      deadLetter:statuses('DEAD_LETTER'),
      retryEligible:rows.filter(r=>r.status==='FAILED'&&r.attemptCount<MAX_ATTEMPTS).length,
      retries:rows.reduce((n,r)=>n+Math.max(0,r.attemptCount-1),0),
      sources:new Set(rows.map(r=>r.sourceSystem)).size,
      maxAttempts:MAX_ATTEMPTS
    };
  }

  private async findBooking(payload:any){
    const bookingNo=this.text(payload?.bookingNo);
    const carrierBookingNo=this.text(payload?.carrierBookingNo);
    const houseBL=this.text(payload?.houseBL||payload?.hbl);
    const masterBL=this.text(payload?.masterBL||payload?.mbl);
    if(!bookingNo&&!carrierBookingNo&&!houseBL&&!masterBL) throw new BadRequestException('Booking reference is required (bookingNo, carrierBookingNo, houseBL or masterBL)');
    const booking=await this.prisma.booking.findFirst({where:{OR:[
      ...(bookingNo?[{bookingNo}]:[]),...(carrierBookingNo?[{carrierBookingNo}]:[]),...(houseBL?[{houseBL}]:[]),...(masterBL?[{masterBL}]:[])
    ]}});
    if(!booking) throw new BadRequestException('No booking matched the supplied reference');
    return booking;
  }

  private normalize(type:string,payload:any){
    const t=type.toUpperCase();
    if(t==='CODECO'){
      const raw=this.text(payload?.eventCode||payload?.movementType||payload?.status).toUpperCase();
      const eventCode=raw.includes('OUT')?'GATED_OUT':raw.includes('EMPTY')&&raw.includes('RETURN')?'EMPTY_RETURNED':raw.includes('PICK')?'PICKED_UP':'GATED_IN';
      return {kind:'CONTAINER_MOVEMENT',payload:{...payload,eventCode,eventLabel:payload?.eventLabel||movementLabels[eventCode],source:payload?.source||'TERMINAL_EDI'}};
    }
    if(t==='COARRI'){
      const raw=this.text(payload?.eventCode||payload?.movementType||payload?.status).toUpperCase();
      const eventCode=raw.includes('DIS')||raw.includes('ARR')?'DISCHARGED':raw.includes('DEP')?'DEPARTED':'LOADED';
      return {kind:'CONTAINER_MOVEMENT',payload:{...payload,eventCode,eventLabel:payload?.eventLabel||movementLabels[eventCode],source:payload?.source||'CARRIER_EDI'}};
    }
    if(t==='IFTSTA'){
      if(payload?.containerNo){
        const raw=this.text(payload?.eventCode||payload?.status).toUpperCase();
        const known=Object.keys(movementLabels).find(x=>raw.includes(x))||raw.replace(/\s+/g,'_')||'CUSTOM';
        return {kind:'CONTAINER_MOVEMENT',payload:{...payload,eventCode:known,eventLabel:payload?.eventLabel||movementLabels[known]||payload?.status||'Status Update',source:payload?.source||'CARRIER_EDI'}};
      }
      return {kind:'TRACKING_MILESTONE',payload:{...payload,code:payload?.code||payload?.eventCode||'STATUS_UPDATE',label:payload?.label||payload?.status||'Status Update',source:payload?.source||'CARRIER_EDI'}};
    }
    if(t==='IFTSAI') return {kind:'SCHEDULE_UPDATE',payload};
    return {kind:t,payload};
  }

  private async syncMilestone(tx:any,bookingId:string,code:string,label:string,occurredAt:Date,location:string|null,source:string,remarks:string|null){
    const existing=await tx.shipmentMilestone.findFirst({where:{bookingId,code},orderBy:{createdAt:'desc'}});
    const data={label,location,actualAt:occurredAt,status:'COMPLETED',source,remarks};
    if(existing) return tx.shipmentMilestone.update({where:{id:existing.id},data});
    return tx.shipmentMilestone.create({data:{bookingId,code,...data}});
  }

  private async processMovement(payload:any){
    const booking=await this.findBooking(payload);
    const containerNo=this.text(payload?.containerNo).toUpperCase();
    if(!containerNo) throw new BadRequestException('containerNo is required for container movement events');
    const container=await this.prisma.container.findUnique({where:{containerNo}});
    if(!container||container.bookingId!==booking.id) throw new BadRequestException(`Container ${containerNo} is not assigned to matched booking ${booking.bookingNo}`);
    const eventCode=this.text(payload?.eventCode).toUpperCase();
    if(!eventCode) throw new BadRequestException('eventCode is required');
    const eventLabel=this.text(payload?.eventLabel)||movementLabels[eventCode]||eventCode;
    const occurredAt=this.date(payload?.occurredAt)||new Date();
    const location=this.text(payload?.location)||null;
    const source=this.text(payload?.source)||'EDI';
    const reference=this.text(payload?.reference)||null;
    const remarks=this.text(payload?.remarks)||null;
    const status=this.text(payload?.status)||null;

    return this.prisma.$transaction(async tx=>{
      const movement=await tx.containerMovement.create({data:{containerId:container.id,eventCode,eventLabel,status,location,occurredAt,source,reference,remarks,actorId:`INTEGRATION:${source}`}});
      const cupdate:any={};
      if(status)cupdate.status=status;
      if(location)cupdate.location=location;
      if(eventCode==='EMPTY_RELEASED')cupdate.allocationStatus='RELEASED';
      if(eventCode==='PICKED_UP')cupdate.pickupDate=occurredAt;
      if(eventCode==='GATED_IN')cupdate.fullGateInAt=occurredAt;
      if(eventCode==='LOADED')cupdate.allocationStatus='UTILIZED';
      if(eventCode==='DISCHARGED')cupdate.dischargeAt=occurredAt;
      if(eventCode==='DELIVERED')cupdate.deliveryAt=occurredAt;
      if(eventCode==='EMPTY_RETURNED')cupdate.emptyReturnedAt=occurredAt;
      if(Object.keys(cupdate).length)await tx.container.update({where:{id:container.id},data:cupdate});

      const milestoneCodes=['PICKED_UP','GATED_IN','LOADED','DEPARTED','TRANSSHIPMENT','DISCHARGED','GATED_OUT','DELIVERED','EMPTY_RETURNED'];
      if(milestoneCodes.includes(eventCode)) await this.syncMilestone(tx,booking.id,eventCode,eventLabel,occurredAt,location,source,remarks);
      const bupdate:any={};
      if(eventCode==='DEPARTED'){bupdate.atd=occurredAt;if(!['COMPLETED','FINANCIALLY_CLOSED','CANCELLED'].includes(String(booking.status)))bupdate.status='OPERATIONAL';}
      if(eventCode==='DISCHARGED')bupdate.ata=occurredAt;
      if(Object.keys(bupdate).length)await tx.booking.update({where:{id:booking.id},data:bupdate});
      return {objectType:'ContainerMovement',objectId:movement.id,bookingId:booking.id,bookingNo:booking.bookingNo,containerNo,eventCode};
    });
  }

  private async processMilestone(payload:any){
    const booking=await this.findBooking(payload);
    const code=this.text(payload?.code||payload?.eventCode).toUpperCase();
    const label=this.text(payload?.label)||code;
    if(!code)throw new BadRequestException('Milestone code is required');
    const actualAt=this.date(payload?.actualAt||payload?.occurredAt)||new Date();
    const location=this.text(payload?.location)||null;
    const source=this.text(payload?.source)||'EDI';
    const remarks=this.text(payload?.remarks)||null;
    const row=await this.prisma.$transaction(tx=>this.syncMilestone(tx,booking.id,code,label,actualAt,location,source,remarks));
    const update:any={};
    if(code==='DEPARTED'){update.atd=actualAt;if(!['COMPLETED','FINANCIALLY_CLOSED','CANCELLED'].includes(String(booking.status)))update.status='OPERATIONAL';}
    if(code==='ARRIVED'||code==='DISCHARGED')update.ata=actualAt;
    if(Object.keys(update).length)await this.prisma.booking.update({where:{id:booking.id},data:update});
    return {objectType:'ShipmentMilestone',objectId:row.id,bookingId:booking.id,bookingNo:booking.bookingNo,code};
  }

  private async processSchedule(payload:any){
    const booking=await this.findBooking(payload);
    const data:any={};
    for(const k of ['carrier','vesselVoyage','terminal']) if(payload?.[k]!==undefined)data[k]=payload[k]||null;
    for(const k of ['etd','eta','atd','ata','cyClosing','siCutoff','vgmCutoff','docCutoff','portCutoff']) if(payload?.[k]!==undefined)data[k]=this.date(payload[k]);
    if(!Object.keys(data).length)throw new BadRequestException('No schedule fields supplied');
    await this.prisma.$transaction(async tx=>{
      await tx.booking.update({where:{id:booking.id},data});
      const leg=await tx.bookingLeg.findFirst({where:{bookingId:booking.id,legType:'MAIN'},orderBy:{sequence:'asc'}});
      if(leg){
        const legData:any={};
        if(data.carrier!==undefined)legData.carrier=data.carrier;
        if(data.terminal!==undefined)legData.terminal=data.terminal;
        if(data.etd!==undefined)legData.etd=data.etd;
        if(data.eta!==undefined)legData.eta=data.eta;
        if(data.atd!==undefined)legData.atd=data.atd;
        if(data.ata!==undefined)legData.ata=data.ata;
        if(data.vesselVoyage){const parts=String(data.vesselVoyage).split('/');legData.vessel=parts[0]?.trim()||data.vesselVoyage;legData.voyage=parts.slice(1).join('/').trim()||null;}
        await tx.bookingLeg.update({where:{id:leg.id},data:legData});
      }
    });
    return {objectType:'Booking',objectId:booking.id,bookingId:booking.id,bookingNo:booking.bookingNo,changedFields:Object.keys(data)};
  }

  private async execute(type:string,payload:any){
    const normalized=this.normalize(type,payload||{});
    if(normalized.kind==='CONTAINER_MOVEMENT')return this.processMovement(normalized.payload);
    if(normalized.kind==='TRACKING_MILESTONE')return this.processMilestone(normalized.payload);
    if(normalized.kind==='SCHEDULE_UPDATE')return this.processSchedule(normalized.payload);
    throw new BadRequestException(`Unsupported integration event type: ${type}`);
  }

  private async processEvent(id:string,user:ScopeUser,force=false){
    this.assertInternal(user);
    const row=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!row)throw new BadRequestException('Integration event not found');
    if(row.status==='PROCESSING')throw new BadRequestException('Integration event is already processing');
    if(row.status==='COMPLETED'&&!force)return {...row,duplicate:true};
    if(row.status==='DEAD_LETTER'&&!force)throw new BadRequestException('Event is in dead-letter state. Use Reprocess to run it again.');
    if(!force&&row.attemptCount>=MAX_ATTEMPTS){
      const original:any=row.payload&&typeof row.payload==='object'?row.payload:{};
      const clean={...original};delete clean._processing;
      const payload={...clean,_processing:{...(original?._processing||{}),lastError:original?._processing?.lastError||'Maximum retry attempts reached',deadLetteredAt:new Date().toISOString(),maxAttempts:MAX_ATTEMPTS}};
      await this.prisma.integrationEvent.update({where:{id},data:{status:'DEAD_LETTER',payload}});
      throw new BadRequestException('Maximum retry attempts reached. Event moved to dead-letter state.');
    }

    const original:any=row.payload&&typeof row.payload==='object'?row.payload:{};
    const clean={...original};delete clean._processing;
    const attempt=row.attemptCount+1;
    const claimed=await this.prisma.integrationEvent.updateMany({where:{id,status:row.status,attemptCount:row.attemptCount},data:{status:'PROCESSING',attemptCount:{increment:1},completedAt:null,payload:{...clean,_processing:{processingStartedAt:new Date().toISOString(),attempt,maxAttempts:MAX_ATTEMPTS}}}});
    if(claimed.count!==1){
      const current=await this.prisma.integrationEvent.findUnique({where:{id}});
      if(current?.status==='COMPLETED')return {...current,duplicate:true};
      throw new BadRequestException('Integration event state changed concurrently; retry from current state');
    }
    try{
      const result=await this.execute(row.eventType,clean);
      const payload:any={...clean,_processing:{result,processedAt:new Date().toISOString(),attempt,maxAttempts:MAX_ATTEMPTS,lastError:null}};
      const updated=await this.prisma.integrationEvent.update({where:{id},data:{status:'COMPLETED',objectType:result.objectType,objectId:result.objectId,payload,completedAt:new Date()}});
      await this.audit.log({actorId:user.sub,action:'INTEGRATION_EVENT_COMPLETE',objectType:'IntegrationEvent',objectId:id,bookingId:result.bookingId||undefined,detail:{sourceSystem:row.sourceSystem,eventType:row.eventType,externalId:row.externalId,attempt,result}});
      return updated;
    }catch(e:any){
      const message=e?.message||'Integration processing failed';
      const deadLetter=attempt>=MAX_ATTEMPTS;
      const nextRetryAt=deadLetter?null:new Date(Date.now()+Math.min(30,Math.pow(2,Math.max(0,attempt-1)))*60000).toISOString();
      const payload:any={...clean,_processing:{lastError:message,failedAt:new Date().toISOString(),attempt,maxAttempts:MAX_ATTEMPTS,nextRetryAt,deadLetteredAt:deadLetter?new Date().toISOString():null}};
      await this.prisma.integrationEvent.update({where:{id},data:{status:deadLetter?'DEAD_LETTER':'FAILED',payload}});
      await this.audit.log({actorId:user.sub,action:deadLetter?'INTEGRATION_EVENT_DEAD_LETTER':'INTEGRATION_EVENT_FAILED',objectType:'IntegrationEvent',objectId:id,detail:{sourceSystem:row.sourceSystem,eventType:row.eventType,externalId:row.externalId,attempt,error:message}});
      throw new BadRequestException(deadLetter?`${message} Event moved to dead-letter state after ${attempt} attempts.`:message);
    }
  }

  async ingest(body:any,user:ScopeUser){
    this.assertInternal(user);
    const sourceSystem=this.text(body?.sourceSystem).toUpperCase();
    const eventType=this.text(body?.eventType).toUpperCase();
    const externalId=this.text(body?.externalId)||null;
    if(!sourceSystem||!eventType)throw new BadRequestException('Source system and event type are required');
    if(!body?.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new BadRequestException('Payload must be a JSON object');
    if(externalId){
      const prior=await this.prisma.integrationEvent.findFirst({where:{sourceSystem,externalId},orderBy:{createdAt:'desc'}});
      if(prior)return {...prior,duplicate:true,duplicateReason:'Duplicate event',retryRequired:['FAILED','DEAD_LETTER'].includes(String(prior.status))};
    }
    const dedupeId=externalId?this.deterministicId(sourceSystem,externalId):null;
    let row:any;
    try{
      row=await this.prisma.integrationEvent.create({data:{id:dedupeId||undefined,sourceSystem,eventType,externalId,objectType:'UNMATCHED',objectId:externalId||'PENDING',status:'RECEIVED',payload:body.payload}});
    }catch(e:any){
      if(!this.uniqueError(e)||!dedupeId)throw e;
      const prior=await this.prisma.integrationEvent.findUnique({where:{id:dedupeId}});
      if(prior)return {...prior,duplicate:true,duplicateReason:'Duplicate event',retryRequired:['FAILED','DEAD_LETTER'].includes(String(prior.status))};
      throw e;
    }
    await this.audit.log({actorId:user.sub,action:'INTEGRATION_EVENT_RECEIVED',objectType:'IntegrationEvent',objectId:row.id,detail:{sourceSystem,eventType,externalId}});
    return this.processEvent(row.id,user,false);
  }

  async retry(id:string,user:ScopeUser){
    const row=await this.get(id,user);
    if(!['FAILED','RECEIVED'].includes(row.status)) throw new BadRequestException(`Only FAILED or RECEIVED events can be retried. Current status: ${row.status}`);
    return this.processEvent(id,user,false);
  }

  async reprocess(id:string,user:ScopeUser){return this.processEvent(id,user,true);}

  async retryFailed(user:ScopeUser){
    this.assertInternal(user);
    const rows=await this.prisma.integrationEvent.findMany({where:{status:'FAILED',attemptCount:{lt:MAX_ATTEMPTS}},orderBy:{createdAt:'asc'},take:50});
    let completed=0,failed=0;
    const errors:any[]=[];
    for(const row of rows){
      try{await this.processEvent(row.id,user,false);completed++;}
      catch(e:any){failed++;errors.push({id:row.id,sourceSystem:row.sourceSystem,eventType:row.eventType,error:e?.message||'Retry failed'});}
    }
    const result={selected:rows.length,completed,failed,errors:errors.slice(0,10)};
    await this.audit.log({actorId:user.sub,action:'INTEGRATION_BULK_RETRY',objectType:'IntegrationEvent',objectId:'FAILED_QUEUE',detail:result});
    return result;
  }
}
