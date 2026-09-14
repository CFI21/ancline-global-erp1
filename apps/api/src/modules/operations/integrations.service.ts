import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const EVENT_LABELS:Record<string,string>={
  EMPTY_RELEASED:'Empty Released',PICKED_UP:'Empty Picked Up',GATED_IN:'Gate In',VGM_SUBMITTED:'VGM Submitted',
  LOADED:'Loaded on Vessel',DEPARTED:'Departed',TRANSSHIPMENT:'Transshipment',DISCHARGED:'Discharged',
  GATED_OUT:'Gate Out',DELIVERED:'Delivered',EMPTY_RETURNED:'Empty Returned'
};

@Injectable()
export class IntegrationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private assertInternal(user:ScopeUser){this.scope.assertInternal(user);}
  private text(v:any){return v===undefined||v===null?'':String(v).trim();}
  private date(v:any){if(!v)return new Date();const d=new Date(v);if(Number.isNaN(d.getTime()))throw new BadRequestException(`Invalid event date: ${v}`);return d;}

  async list(user:ScopeUser){
    this.assertInternal(user);
    return this.prisma.integrationEvent.findMany({orderBy:{createdAt:'desc'},take:250});
  }

  async summary(user:ScopeUser){
    this.assertInternal(user);
    const rows=await this.prisma.integrationEvent.findMany({select:{status:true,sourceSystem:true,attemptCount:true}});
    return {
      total:rows.length,
      received:rows.filter(x=>x.status==='RECEIVED').length,
      processing:rows.filter(x=>x.status==='PROCESSING').length,
      completed:rows.filter(x=>x.status==='COMPLETED').length,
      failed:rows.filter(x=>x.status==='FAILED').length,
      retries:rows.reduce((n,x)=>n+Math.max(0,x.attemptCount-1),0),
      sources:Array.from(new Set(rows.map(x=>x.sourceSystem))).filter(Boolean).length
    };
  }

  async ingest(body:any,user:ScopeUser){
    this.assertInternal(user);
    const sourceSystem=this.text(body?.sourceSystem).toUpperCase();
    const eventType=this.text(body?.eventType).toUpperCase();
    const externalId=this.text(body?.externalId)||null;
    const payload=body?.payload&&typeof body.payload==='object'?body.payload:{};
    if(!sourceSystem||!eventType) throw new BadRequestException('Source system and event type are required');

    if(externalId){
      const duplicate=await this.prisma.integrationEvent.findFirst({where:{sourceSystem,eventType,externalId,status:'COMPLETED'},orderBy:{createdAt:'desc'}});
      if(duplicate) return {...duplicate,duplicate:true};
    }

    const objectId=this.text(payload.bookingId||payload.bookingNo||payload.containerNo||externalId)||'UNMATCHED';
    const row=await this.prisma.integrationEvent.create({data:{sourceSystem,eventType,externalId,objectType:'EDI_EVENT',objectId,status:'RECEIVED',payload,attemptCount:0}});
    await this.audit.log({actorId:user.sub,action:'INTEGRATION_EVENT_RECEIVED',objectType:'IntegrationEvent',objectId:row.id,detail:{sourceSystem,eventType,externalId}});
    return this.process(row.id,user,false);
  }

  async retry(id:string,user:ScopeUser){
    this.assertInternal(user);
    const row=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!row) throw new BadRequestException('Integration event not found');
    if(row.status==='COMPLETED') throw new BadRequestException('Event already completed. Use reprocess if you intentionally want to run it again.');
    return this.process(id,user,false);
  }

  async reprocess(id:string,user:ScopeUser){
    this.assertInternal(user);
    const row=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!row) throw new BadRequestException('Integration event not found');
    await this.audit.log({actorId:user.sub,action:'INTEGRATION_EVENT_REPROCESS',objectType:'IntegrationEvent',objectId:id,detail:{previousStatus:row.status,attemptCount:row.attemptCount}});
    return this.process(id,user,true);
  }

  private async findBooking(payload:any){
    const bookingId=this.text(payload?.bookingId);
    if(bookingId){const b=await this.prisma.booking.findUnique({where:{id:bookingId}});if(b)return b;}
    const refs=[this.text(payload?.bookingNo),this.text(payload?.carrierBookingNo),this.text(payload?.houseBL),this.text(payload?.masterBL)].filter(Boolean);
    if(!refs.length)return null;
    return this.prisma.booking.findFirst({where:{OR:[
      payload?.bookingNo?{bookingNo:this.text(payload.bookingNo)}:undefined,
      payload?.carrierBookingNo?{carrierBookingNo:this.text(payload.carrierBookingNo)}:undefined,
      payload?.houseBL?{houseBL:this.text(payload.houseBL)}:undefined,
      payload?.masterBL?{masterBL:this.text(payload.masterBL)}:undefined
    ].filter(Boolean) as any[]}});
  }

  private async upsertMilestone(tx:any,bookingId:string,code:string,label:string,occurredAt:Date,location:string|null,source:string,remarks:string|null){
    const existing=await tx.shipmentMilestone.findFirst({where:{bookingId,code}});
    const data={label,location,actualAt:occurredAt,status:'COMPLETED',source,remarks};
    if(existing)return tx.shipmentMilestone.update({where:{id:existing.id},data});
    return tx.shipmentMilestone.create({data:{bookingId,code,...data}});
  }

  private async processContainerMovement(event:any,payload:any,booking:any){
    const containerNo=this.text(payload.containerNo).toUpperCase();
    if(!containerNo)throw new BadRequestException('Container movement requires containerNo');
    const container=await this.prisma.container.findFirst({where:{containerNo,...(booking?{bookingId:booking.id}:{})}});
    if(!container)throw new BadRequestException(`Container ${containerNo} was not found${booking?' on the matched booking':''}`);
    const eventCode=this.text(payload.eventCode||payload.code).toUpperCase();
    if(!eventCode)throw new BadRequestException('Container movement requires eventCode');
    const occurredAt=this.date(payload.occurredAt||payload.eventDate||payload.timestamp);
    const location=this.text(payload.location)||null;
    const status=this.text(payload.status)||null;
    const reference=this.text(payload.reference||event.externalId)||null;
    const remarks=this.text(payload.remarks)||null;
    const label=this.text(payload.eventLabel)||EVENT_LABELS[eventCode]||eventCode.replace(/_/g,' ');
    const bookingId=container.bookingId||booking?.id;
    if(!bookingId)throw new BadRequestException('Container is not assigned to a booking');

    await this.prisma.$transaction(async tx=>{
      const duplicate=await tx.containerMovement.findFirst({where:{containerId:container.id,eventCode,occurredAt,...(reference?{reference}:{})}});
      if(!duplicate)await tx.containerMovement.create({data:{containerId:container.id,eventCode,eventLabel:label,status,location,occurredAt,source:event.sourceSystem,reference,remarks,actorId:'INTEGRATION'}});
      const update:any={};
      if(status)update.status=status;
      if(location!==null)update.location=location;
      if(eventCode==='EMPTY_RELEASED')update.allocationStatus='RELEASED';
      if(eventCode==='PICKED_UP')update.pickupDate=occurredAt;
      if(eventCode==='GATED_IN')update.fullGateInAt=occurredAt;
      if(eventCode==='LOADED')update.allocationStatus='UTILIZED';
      if(eventCode==='DISCHARGED')update.dischargeAt=occurredAt;
      if(eventCode==='DELIVERED')update.deliveryAt=occurredAt;
      if(eventCode==='EMPTY_RETURNED')update.emptyReturnedAt=occurredAt;
      if(Object.keys(update).length)await tx.container.update({where:{id:container.id},data:update});
      await this.upsertMilestone(tx,bookingId,eventCode,label,occurredAt,location,event.sourceSystem,remarks);
      if(eventCode==='DEPARTED')await tx.booking.update({where:{id:bookingId},data:{atd:occurredAt,status:'OPERATIONAL'}});
      if(eventCode==='DISCHARGED')await tx.booking.update({where:{id:bookingId},data:{ata:occurredAt}});
    });
    return {bookingId,containerId:container.id,objectType:'Container',objectId:container.id};
  }

  private async processMilestone(event:any,payload:any,booking:any){
    if(!booking)throw new BadRequestException('Could not match milestone event to a booking');
    const code=this.text(payload.code||payload.eventCode).toUpperCase();
    if(!code)throw new BadRequestException('Tracking milestone requires code');
    const occurredAt=this.date(payload.actualAt||payload.occurredAt||payload.timestamp);
    const label=this.text(payload.label||payload.eventLabel)||EVENT_LABELS[code]||code.replace(/_/g,' ');
    const location=this.text(payload.location)||null;
    const remarks=this.text(payload.remarks)||null;
    await this.prisma.$transaction(async tx=>{
      await this.upsertMilestone(tx,booking.id,code,label,occurredAt,location,event.sourceSystem,remarks);
      if(code==='DEPARTED')await tx.booking.update({where:{id:booking.id},data:{atd:occurredAt,status:'OPERATIONAL'}});
      if(code==='ARRIVED'||code==='DISCHARGED')await tx.booking.update({where:{id:booking.id},data:{ata:occurredAt}});
    });
    return {bookingId:booking.id,objectType:'Booking',objectId:booking.id};
  }

  private async processSchedule(event:any,payload:any,booking:any){
    if(!booking)throw new BadRequestException('Could not match schedule update to a booking');
    const data:any={};
    if(payload.carrier!==undefined)data.carrier=this.text(payload.carrier)||null;
    if(payload.vesselVoyage!==undefined)data.vesselVoyage=this.text(payload.vesselVoyage)||null;
    if(payload.terminal!==undefined)data.terminal=this.text(payload.terminal)||null;
    if(payload.etd)data.etd=this.date(payload.etd);
    if(payload.eta)data.eta=this.date(payload.eta);
    if(payload.atd)data.atd=this.date(payload.atd);
    if(payload.ata)data.ata=this.date(payload.ata);
    if(!Object.keys(data).length)throw new BadRequestException('Schedule update contains no recognized schedule fields');
    await this.prisma.$transaction(async tx=>{
      await tx.booking.update({where:{id:booking.id},data});
      const leg=await tx.bookingLeg.findFirst({where:{bookingId:booking.id,sequence:1}});
      if(leg){const legData:any={};if(data.carrier!==undefined)legData.carrier=data.carrier;if(data.terminal!==undefined)legData.terminal=data.terminal;if(data.etd)legData.etd=data.etd;if(data.eta)legData.eta=data.eta;if(data.atd)legData.atd=data.atd;if(data.ata)legData.ata=data.ata;if(Object.keys(legData).length)await tx.bookingLeg.update({where:{id:leg.id},data:legData});}
    });
    return {bookingId:booking.id,objectType:'Booking',objectId:booking.id};
  }

  private async process(id:string,user:ScopeUser,force:boolean){
    const event=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!event)throw new BadRequestException('Integration event not found');
    if(event.status==='PROCESSING'&&!force)throw new BadRequestException('Integration event is already processing');
    const attemptCount=event.attemptCount+1;
    await this.prisma.integrationEvent.update({where:{id},data:{status:'PROCESSING',attemptCount,completedAt:null}});
    const payload:any=(event.payload&&typeof event.payload==='object')?event.payload:{};
    try{
      const booking=await this.findBooking(payload);
      const type=event.eventType.toUpperCase();
      let result:any;
      if(['CONTAINER_MOVEMENT','CONTAINER_EVENT','CODECO','COARRI'].includes(type))result=await this.processContainerMovement(event,payload,booking);
      else if(['TRACKING_MILESTONE','MILESTONE','IFTSTA'].includes(type))result=await this.processMilestone(event,payload,booking);
      else if(['SCHEDULE_UPDATE','VESSEL_UPDATE','IFTSAI'].includes(type))result=await this.processSchedule(event,payload,booking);
      else throw new BadRequestException(`Unsupported integration event type: ${event.eventType}`);

      const cleanPayload={...payload,_processing:{lastAttemptAt:new Date().toISOString(),lastError:null,result}};
      const completed=await this.prisma.integrationEvent.update({where:{id},data:{status:'COMPLETED',completedAt:new Date(),objectType:result.objectType,objectId:result.objectId,payload:cleanPayload}});
      await this.audit.log({actorId:user.sub,action:'INTEGRATION_EVENT_COMPLETED',objectType:'IntegrationEvent',objectId:id,bookingId:result.bookingId,detail:{sourceSystem:event.sourceSystem,eventType:event.eventType,attemptCount}});
      return completed;
    }catch(e:any){
      const message=e?.message||'Integration processing failed';
      const failedPayload={...payload,_processing:{lastAttemptAt:new Date().toISOString(),lastError:message}};
      const failed=await this.prisma.integrationEvent.update({where:{id},data:{status:'FAILED',payload:failedPayload}});
      await this.audit.log({actorId:user.sub,action:'INTEGRATION_EVENT_FAILED',objectType:'IntegrationEvent',objectId:id,detail:{sourceSystem:event.sourceSystem,eventType:event.eventType,attemptCount,error:message}});
      return failed;
    }
  }
}
