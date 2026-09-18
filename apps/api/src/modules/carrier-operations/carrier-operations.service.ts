import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SRC='ANCLINE_CARRIER_OPERATIONS';
const DAY=86400000;

@Injectable()
export class CarrierOperationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private p(e:any){return (e?.payload||{}) as any;}
  private internal(u:ScopeUser){this.scope.assertInternal(u);}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(n+' is required');return s;}
  private dt(v:any,n:string){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new BadRequestException(n+' is invalid');return d;}
  private norm(v:any){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  private generatedNo(){return 'CBR-'+Date.now().toString().slice(-10);}
  private shipmentNo(bookingNo:string){return 'SHP-'+String(bookingNo||Date.now()).trim().toUpperCase();}
  private async milestone(tx:any,bookingId:string,code:string,label:string,actualAt:Date,location?:string|null,remarks?:string|null){
    const existing=await tx.shipmentMilestone.findFirst({where:{bookingId,code},orderBy:{createdAt:'asc'}});
    const data={label,status:'COMPLETED',actualAt,location:location||null,source:'CARRIER',remarks:remarks||null};
    if(existing)return tx.shipmentMilestone.update({where:{id:existing.id},data});
    return tx.shipmentMilestone.create({data:{bookingId,code,...data}});
  }
  private async syncMainLeg(tx:any,bookingId:string,schedule:any){
    const main=await tx.bookingLeg.findFirst({where:{bookingId,legType:'MAIN'},orderBy:{sequence:'asc'}});
    const data={mode:'SEA',origin:schedule.portOfLoading,destination:schedule.portOfDischarge,carrier:schedule.carrier,vessel:schedule.vessel,voyage:schedule.voyage,terminal:schedule.terminal,etd:schedule.etd,eta:schedule.eta,atd:schedule.atd||null,ata:schedule.ata||null,status:schedule.status,remarks:'Schedule '+schedule.scheduleNo};
    if(main)return tx.bookingLeg.update({where:{id:main.id},data});
    const last=await tx.bookingLeg.findFirst({where:{bookingId},orderBy:{sequence:'desc'},select:{sequence:true}});
    return tx.bookingLeg.create({data:{bookingId,sequence:(last?.sequence||0)+1,legType:'MAIN',...data}});
  }
  private teu(equipment:any,quantity:any){const e=String(equipment||'20GP').toUpperCase(),q=Math.max(1,Math.trunc(Number(quantity||1)));return q*(e.includes('40')||e.includes('45')?2:1);}

  private statusFor(eventType:string,current:string){
    if(eventType==='CARRIER_BOOKING_REQUESTED')return 'REQUESTED';
    if(eventType==='CARRIER_BOOKING_CONFIRMED')return 'CONFIRMED';
    if(eventType==='SPACE_ALLOCATED')return 'ALLOCATED';
    if(eventType==='EQUIPMENT_RELEASED')return 'EQUIPMENT_RELEASED';
    if(eventType==='CARRIER_BOOKING_ROLLED')return 'ROLLED';
    if(eventType==='CARRIER_BOOKING_CANCELLED')return 'CANCELLED';
    return current||'REQUESTED';
  }

  private async stateMap(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'CarrierBooking'},orderBy:{createdAt:'asc'}});
    const map=new Map<string,any>();
    for(const e of rows){
      const prev=map.get(e.objectId)||{carrierOperationNo:e.objectId,createdAt:e.createdAt};
      const next={...prev,...this.p(e),carrierOperationNo:e.objectId,status:this.statusFor(e.eventType,prev.status),updatedAt:e.createdAt};
      map.set(e.objectId,next);
    }
    return map;
  }

  private async allStates(){return Array.from((await this.stateMap()).values()) as any[];}
  private async accessible(u:ScopeUser){
    this.internal(u);
    const rows=await this.allStates();
    if(['GLOBAL_ADMIN','CONTROL_TOWER','FINANCE'].includes(String(u.role)))return rows;
    const bookings:any[]=await this.db.booking.findMany({where:bookingScope(u),select:{id:true}});
    const allowed=new Set(bookings.map((x:any)=>String(x.id)));
    return rows.filter((x:any)=>allowed.has(String(x.bookingId)));
  }

  private async one(id:string,u:ScopeUser){
    const row=(await this.accessible(u)).find((x:any)=>x.carrierOperationNo===id);
    if(!row)throw new NotFoundException('Carrier booking control record not found');
    return row;
  }

  private async carrier(id:string){
    const v=await this.db.organization.findUnique({where:{id}});
    if(!v||!v.active||!Array.isArray(v.roles)||!v.roles.includes('CARRIER'))throw new BadRequestException('Carrier must be an active CARRIER organization');
    return v;
  }

  private async schedule(id:string){
    const s=await this.db.vesselVoyageSchedule.findUnique({where:{id}});
    if(!s||String(s.status||'').toUpperCase()==='CANCELLED')throw new BadRequestException('Active vessel / voyage schedule not found');
    return s;
  }

  async carriers(u:ScopeUser){
    this.internal(u);
    return this.db.organization.findMany({where:{active:true,roles:{has:'CARRIER'}},select:{id:true,code:true,name:true,countryCode:true},orderBy:{name:'asc'}});
  }

  async bookings(u:ScopeUser){
    this.internal(u);
    return this.db.booking.findMany({where:{...bookingScope(u),status:{not:'CANCELLED'}},select:{id:true,bookingNo:true,shipmentNo:true,origin:true,destination:true,portOfLoading:true,portOfDischarge:true,equipment:true,quantity:true,carrier:true,carrierBookingNo:true,slotStatus:true,equipmentStatus:true,status:true},orderBy:{createdAt:'desc'},take:300});
  }

  async schedules(u:ScopeUser){
    this.internal(u);
    const from=new Date(Date.now()-7*DAY);
    return this.db.vesselVoyageSchedule.findMany({where:{status:{not:'CANCELLED'},etd:{gte:from}},orderBy:{etd:'asc'},take:300});
  }

  async carrierBookings(u:ScopeUser){
    return (await this.accessible(u)).sort((a:any,b:any)=>new Date(b.updatedAt||b.createdAt).getTime()-new Date(a.updatedAt||a.createdAt).getTime());
  }

  private async capacityFor(scheduleId:string,excludeId?:string){
    const schedule=await this.schedule(scheduleId),states=await this.allStates();
    const allocated=states.filter((x:any)=>x.carrierOperationNo!==excludeId&&x.scheduleId===scheduleId&&x.status!=='CANCELLED'&&x.allocationStatus==='ALLOCATED').reduce((s:number,x:any)=>s+Number(x.spaceTeu||0),0);
    const capacity=schedule.capacityTeu==null?null:Number(schedule.capacityTeu);
    const remaining=capacity==null?null:Math.max(0,capacity-allocated);
    return {schedule,allocatedTeu:allocated,capacityTeu:capacity,remainingTeu:remaining,utilizationPct:capacity&&capacity>0?Math.round(allocated/capacity*1000)/10:null};
  }

  async capacity(u:ScopeUser){
    this.internal(u);
    const schedules:any[]=await this.schedules(u),states=await this.allStates(),out:any[]=[];
    for(const s of schedules){
      const allocated=states.filter((x:any)=>x.scheduleId===s.id&&x.status!=='CANCELLED'&&x.allocationStatus==='ALLOCATED').reduce((sum:number,x:any)=>sum+Number(x.spaceTeu||0),0);
      const cap=s.capacityTeu==null?null:Number(s.capacityTeu),remaining=cap==null?null:Math.max(0,cap-allocated);
      out.push({scheduleId:s.id,scheduleNo:s.scheduleNo,carrier:s.carrier,serviceName:s.serviceName,vessel:s.vessel,voyage:s.voyage,portOfLoading:s.portOfLoading,portOfDischarge:s.portOfDischarge,etd:s.etd,eta:s.eta,cyClosing:s.cyClosing,siCutoff:s.siCutoff,vgmCutoff:s.vgmCutoff,capacityTeu:cap,allocatedTeu:allocated,remainingTeu:remaining,utilizationPct:cap&&cap>0?Math.round(allocated/cap*1000)/10:null,status:cap==null?'CAPACITY_UNKNOWN':allocated>cap?'OVERBOOKED':allocated/cap>=0.9?'TIGHT':'AVAILABLE'});
    }
    return out;
  }

  async create(b:any,u:ScopeUser){
    this.internal(u);
    const bookingId=this.req(b?.bookingId,'Booking');
    await this.scope.assertBookingAccess(u,bookingId);
    const booking=await this.db.booking.findUnique({where:{id:bookingId}});
    if(!booking||String(booking.status)==='CANCELLED')throw new BadRequestException('Active booking not found');
    const existing=(await this.allStates()).find((x:any)=>x.bookingId===bookingId&&x.status!=='CANCELLED');
    if(existing)throw new BadRequestException('Booking already has an active carrier booking control record');
    const carrierId=this.req(b?.carrierId,'Carrier'),carrier=await this.carrier(carrierId),scheduleId=this.req(b?.scheduleId,'Schedule'),schedule=await this.schedule(scheduleId);
    const quantity=Math.max(1,Math.trunc(Number(b?.quantity||booking.quantity||1)));
    if(!Number.isFinite(quantity)||quantity<=0)throw new BadRequestException('Quantity must be greater than zero');
    const equipmentType=String(b?.equipmentType||booking.equipment||'20GP').toUpperCase(),spaceTeu=this.teu(equipmentType,quantity),id=this.generatedNo();
    const payload={carrierOperationNo:id,bookingId,bookingNo:booking.bookingNo,shipmentNo:booking.shipmentNo||null,carrierId,carrierCode:carrier.code,carrierName:carrier.name,scheduleId,scheduleNo:schedule.scheduleNo,scheduleCarrier:schedule.carrier,serviceName:schedule.serviceName||null,vessel:schedule.vessel,voyage:schedule.voyage,portOfLoading:schedule.portOfLoading,portOfDischarge:schedule.portOfDischarge,terminal:schedule.terminal||null,etd:schedule.etd,eta:schedule.eta,cyClosing:schedule.cyClosing||null,siCutoff:schedule.siCutoff||null,vgmCutoff:schedule.vgmCutoff||null,docCutoff:schedule.docCutoff||null,equipmentType,quantity,spaceTeu,carrierBookingNo:null,confirmationStatus:'REQUESTED',allocationStatus:'UNALLOCATED',allocationRef:null,equipmentReleaseStatus:'PENDING',releaseOrderNo:null,emptyDepot:null,releaseValidUntil:null,notes:b?.notes?String(b.notes):null,requestedBy:u.sub};
    await this.db.$transaction(async (tx:any)=>{
      await tx.integrationEvent.create({data:{sourceSystem:SRC,eventType:'CARRIER_BOOKING_REQUESTED',externalId:id,objectType:'CarrierBooking',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});
      await tx.booking.update({where:{id:bookingId},data:{carrier:carrier.name,vesselVoyage:String(schedule.vessel)+' / '+String(schedule.voyage),portOfLoading:schedule.portOfLoading,portOfDischarge:schedule.portOfDischarge,etd:schedule.etd,eta:schedule.eta,cyClosing:schedule.cyClosing,siCutoff:schedule.siCutoff,vgmCutoff:schedule.vgmCutoff,docCutoff:schedule.docCutoff,terminal:schedule.terminal,slotStatus:'REQUESTED',equipmentStatus:'PENDING',shipmentStatus:'CARRIER_REQUESTED'}});
      await this.syncMainLeg(tx,bookingId,schedule);
    });
    await this.audit.log({actorId:u.sub,action:'CARRIER_BOOKING_REQUESTED',objectType:'CarrierBooking',objectId:id,bookingId,detail:{carrierId,scheduleId,spaceTeu}});
    return this.one(id,u);
  }

  async confirm(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);
    if(!['REQUESTED','ROLLED'].includes(row.status))throw new BadRequestException('Carrier confirmation is not allowed from '+row.status);
    const carrierBookingNo=this.req(b?.carrierBookingNo,'Carrier booking number'),schedule=await this.schedule(row.scheduleId),confirmedAt=new Date();
    const payload={carrierBookingNo,confirmationStatus:'CONFIRMED',confirmedAt:confirmedAt.toISOString(),confirmedBy:u.sub};
    await this.db.$transaction(async (tx:any)=>{
      await tx.integrationEvent.create({data:{sourceSystem:SRC,eventType:'CARRIER_BOOKING_CONFIRMED',externalId:id,objectType:'CarrierBooking',objectId:id,status:'COMPLETED',payload,completedAt:confirmedAt}});
      const booking=await tx.booking.findUnique({where:{id:row.bookingId}});
      if(!booking)throw new BadRequestException('Booking not found');
      await tx.booking.update({where:{id:row.bookingId},data:{shipmentNo:booking.shipmentNo||this.shipmentNo(booking.bookingNo),shipmentStatus:'CARRIER_CONFIRMED',carrierBookingNo,carrier:row.carrierName,vesselVoyage:String(schedule.vessel)+' / '+String(schedule.voyage),portOfLoading:schedule.portOfLoading,portOfDischarge:schedule.portOfDischarge,etd:schedule.etd,eta:schedule.eta,cyClosing:schedule.cyClosing,siCutoff:schedule.siCutoff,vgmCutoff:schedule.vgmCutoff,docCutoff:schedule.docCutoff,terminal:schedule.terminal,slotStatus:'CONFIRMED'}});
      await this.syncMainLeg(tx,row.bookingId,schedule);
      await this.milestone(tx,row.bookingId,'CARRIER_CONFIRMED','Carrier Booking Confirmed',confirmedAt,schedule.portOfLoading,carrierBookingNo);
    });
    await this.audit.log({actorId:u.sub,action:'CARRIER_BOOKING_CONFIRMED',objectType:'CarrierBooking',objectId:id,bookingId:row.bookingId,detail:{carrierBookingNo}});
    return this.one(id,u);
  }

  async allocate(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);
    if(row.allocationStatus==='ALLOCATED')return row;
    if(row.status!=='CONFIRMED')throw new BadRequestException('Space can only be allocated after carrier confirmation');
    const cap=await this.capacityFor(row.scheduleId,id);
    if(cap.capacityTeu!=null&&Number(row.spaceTeu)>Number(cap.remainingTeu)+0.0005)throw new BadRequestException('Insufficient vessel allocation: requested '+row.spaceTeu+' TEU, remaining '+cap.remainingTeu+' TEU');
    const allocatedAt=new Date(),allocationRef=this.req(b?.allocationRef||row.carrierBookingNo,'Allocation reference'),payload={allocationStatus:'ALLOCATED',allocationRef,allocatedAt:allocatedAt.toISOString(),allocatedBy:u.sub};
    await this.db.$transaction(async (tx:any)=>{
      await tx.integrationEvent.create({data:{sourceSystem:SRC,eventType:'SPACE_ALLOCATED',externalId:id,objectType:'CarrierBooking',objectId:id,status:'COMPLETED',payload,completedAt:allocatedAt}});
      await tx.booking.update({where:{id:row.bookingId},data:{slotStatus:'ALLOCATED',shipmentStatus:'SPACE_ALLOCATED'}});
      await tx.container.updateMany({where:{bookingId:row.bookingId},data:{equipmentProvider:row.carrierName,allocationRef,allocationStatus:'ALLOCATED'}});
      await this.milestone(tx,row.bookingId,'SPACE_ALLOCATED','Carrier Space Allocated',allocatedAt,row.portOfLoading,allocationRef);
    });
    await this.audit.log({actorId:u.sub,action:'CARRIER_SPACE_ALLOCATED',objectType:'CarrierBooking',objectId:id,bookingId:row.bookingId,detail:{allocationRef,spaceTeu:row.spaceTeu,scheduleId:row.scheduleId}});
    return this.one(id,u);
  }

  async release(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);
    if(row.equipmentReleaseStatus==='RELEASED')return row;
    if(row.allocationStatus!=='ALLOCATED')throw new BadRequestException('Equipment release requires allocated space');
    const releaseOrderNo=this.req(b?.releaseOrderNo,'Empty release order'),emptyDepot=this.req(b?.emptyDepot,'Empty depot'),releaseValidUntil=this.dt(b?.releaseValidUntil,'Release valid until');
    if(releaseValidUntil.getTime()<=Date.now())throw new BadRequestException('Release validity must be in the future');
    const releasedAt=new Date(),payload={equipmentReleaseStatus:'RELEASED',releaseOrderNo,emptyDepot,releaseValidUntil:releaseValidUntil.toISOString(),releasedAt:releasedAt.toISOString(),releasedBy:u.sub};
    await this.db.$transaction(async (tx:any)=>{
      await tx.integrationEvent.create({data:{sourceSystem:SRC,eventType:'EQUIPMENT_RELEASED',externalId:id,objectType:'CarrierBooking',objectId:id,status:'COMPLETED',payload,completedAt:releasedAt}});
      await tx.booking.update({where:{id:row.bookingId},data:{equipmentStatus:'RELEASED',shipmentStatus:'EQUIPMENT_RELEASED'}});
      await tx.container.updateMany({where:{bookingId:row.bookingId},data:{equipmentProvider:row.carrierName,allocationRef:row.allocationRef,allocationStatus:'ALLOCATED',emptyReleaseOrderNo:releaseOrderNo,emptyDepot,emptyReleaseValidUntil:releaseValidUntil,status:'RELEASED'}});
      await this.milestone(tx,row.bookingId,'EMPTY_RELEASED','Empty Equipment Released',releasedAt,emptyDepot,releaseOrderNo);
    });
    await this.audit.log({actorId:u.sub,action:'CARRIER_EQUIPMENT_RELEASED',objectType:'CarrierBooking',objectId:id,bookingId:row.bookingId,detail:{releaseOrderNo,emptyDepot,releaseValidUntil}});
    return this.one(id,u);
  }

  async roll(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);
    if(row.status==='CANCELLED')throw new BadRequestException('Cancelled carrier booking cannot be rolled');
    const newScheduleId=this.req(b?.scheduleId,'New schedule');
    if(newScheduleId===row.scheduleId)throw new BadRequestException('Select a different schedule');
    const schedule=await this.schedule(newScheduleId),payload={previousScheduleId:row.scheduleId,previousScheduleNo:row.scheduleNo,scheduleId:newScheduleId,scheduleNo:schedule.scheduleNo,scheduleCarrier:schedule.carrier,serviceName:schedule.serviceName||null,vessel:schedule.vessel,voyage:schedule.voyage,portOfLoading:schedule.portOfLoading,portOfDischarge:schedule.portOfDischarge,terminal:schedule.terminal||null,etd:schedule.etd,eta:schedule.eta,cyClosing:schedule.cyClosing||null,siCutoff:schedule.siCutoff||null,vgmCutoff:schedule.vgmCutoff||null,docCutoff:schedule.docCutoff||null,carrierBookingNo:null,confirmationStatus:'REQUESTED',allocationStatus:'UNALLOCATED',allocationRef:null,equipmentReleaseStatus:'PENDING',releaseOrderNo:null,emptyDepot:null,releaseValidUntil:null,rollReason:this.req(b?.reason,'Roll reason'),rolledAt:new Date().toISOString(),rolledBy:u.sub};
    const rolledAt=new Date();
    await this.db.$transaction(async (tx:any)=>{
      await tx.integrationEvent.create({data:{sourceSystem:SRC,eventType:'CARRIER_BOOKING_ROLLED',externalId:id,objectType:'CarrierBooking',objectId:id,status:'COMPLETED',payload,completedAt:rolledAt}});
      await tx.booking.update({where:{id:row.bookingId},data:{carrierBookingNo:null,shipmentStatus:'CARRIER_ROLLED',vesselVoyage:String(schedule.vessel)+' / '+String(schedule.voyage),portOfLoading:schedule.portOfLoading,portOfDischarge:schedule.portOfDischarge,etd:schedule.etd,eta:schedule.eta,cyClosing:schedule.cyClosing,siCutoff:schedule.siCutoff,vgmCutoff:schedule.vgmCutoff,docCutoff:schedule.docCutoff,terminal:schedule.terminal,slotStatus:'ROLLED',equipmentStatus:'RELEASE_REQUIRED'}});
      await tx.container.updateMany({where:{bookingId:row.bookingId},data:{allocationRef:null,allocationStatus:'UNALLOCATED',emptyReleaseOrderNo:null,emptyReleaseValidUntil:null,emptyDepot:null,status:'PLANNED'}});
      await this.syncMainLeg(tx,row.bookingId,schedule);
      await this.milestone(tx,row.bookingId,'CARRIER_ROLLED','Carrier Booking Rolled',rolledAt,schedule.portOfLoading,payload.rollReason);
    });
    await this.audit.log({actorId:u.sub,action:'CARRIER_BOOKING_ROLLED',objectType:'CarrierBooking',objectId:id,bookingId:row.bookingId,detail:{from:row.scheduleId,to:newScheduleId,reason:payload.rollReason}});
    return this.one(id,u);
  }

  async cancel(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);
    if(row.status==='CANCELLED')return row;
    const reason=this.req(b?.reason,'Cancellation reason'),payload={cancellationReason:reason,cancelledAt:new Date().toISOString(),cancelledBy:u.sub,confirmationStatus:'CANCELLED',allocationStatus:'CANCELLED',equipmentReleaseStatus:'CANCELLED'};
    const cancelledAt=new Date();
    await this.db.$transaction(async (tx:any)=>{
      await tx.integrationEvent.create({data:{sourceSystem:SRC,eventType:'CARRIER_BOOKING_CANCELLED',externalId:id,objectType:'CarrierBooking',objectId:id,status:'COMPLETED',payload,completedAt:cancelledAt}});
      await tx.booking.update({where:{id:row.bookingId},data:{carrierBookingNo:null,shipmentStatus:'CARRIER_CANCELLED',slotStatus:'CANCELLED',equipmentStatus:'CANCELLED'}});
      await tx.container.updateMany({where:{bookingId:row.bookingId},data:{allocationRef:null,allocationStatus:'CANCELLED',emptyReleaseOrderNo:null,emptyReleaseValidUntil:null,emptyDepot:null}});
      await this.milestone(tx,row.bookingId,'CARRIER_BOOKING_CANCELLED','Carrier Booking Cancelled',cancelledAt,row.portOfLoading,reason);
    });
    await this.audit.log({actorId:u.sub,action:'CARRIER_BOOKING_CANCELLED',objectType:'CarrierBooking',objectId:id,bookingId:row.bookingId,detail:{reason}});
    return this.one(id,u);
  }

  async exceptions(u:ScopeUser){
    const rows=await this.accessible(u),schedules:any[]=await this.schedules(u),scheduleMap=new Map(schedules.map((x:any)=>[String(x.id),x])),out:any[]=[];
    const now=Date.now();
    for(const x of rows){
      if(x.status==='CANCELLED')continue;
      const s:any=scheduleMap.get(String(x.scheduleId));
      const cutoffs=[x.cyClosing,x.siCutoff,x.vgmCutoff,x.docCutoff].filter(Boolean).map((v:any)=>new Date(v).getTime()).filter((v:number)=>Number.isFinite(v));
      const nextCutoff=cutoffs.length?Math.min(...cutoffs):null,hoursToCutoff=nextCutoff==null?null:Math.round((nextCutoff-now)/360000)/10;
      const missing:string[]=[];
      if(x.confirmationStatus!=='CONFIRMED')missing.push('CARRIER_CONFIRMATION');
      if(x.allocationStatus!=='ALLOCATED')missing.push('SPACE_ALLOCATION');
      if(x.equipmentReleaseStatus!=='RELEASED')missing.push('EQUIPMENT_RELEASE');
      const sc=this.norm(s?.carrier),carrierNames=[this.norm(x.carrierName),this.norm(x.carrierCode)].filter(Boolean),carrierScheduleMismatch=Boolean(sc&&carrierNames.length&&!carrierNames.some((n:string)=>sc.includes(n)||n.includes(sc)));
      const urgent=hoursToCutoff!=null&&hoursToCutoff<=48&&missing.length>0;
      if(!urgent&&!carrierScheduleMismatch)continue;
      out.push({carrierOperationNo:x.carrierOperationNo,bookingId:x.bookingId,bookingNo:x.bookingNo,carrierName:x.carrierName,scheduleNo:x.scheduleNo,vessel:x.vessel,voyage:x.voyage,etd:x.etd,nextCutoff:nextCutoff?new Date(nextCutoff).toISOString():null,hoursToCutoff,missing,carrierScheduleMismatch,severity:hoursToCutoff!=null&&hoursToCutoff<0?'BREACH':hoursToCutoff!=null&&hoursToCutoff<=24?'CRITICAL':'WARNING'});
    }
    return out.sort((a:any,b:any)=>(a.hoursToCutoff??999999)-(b.hoursToCutoff??999999));
  }

  async dashboard(u:ScopeUser){
    const [rows,exceptions,capacity]=await Promise.all([this.accessible(u),this.exceptions(u),this.capacity(u)]);
    const active=rows.filter((x:any)=>x.status!=='CANCELLED');
    return {activeCarrierBookings:active.length,awaitingConfirmation:active.filter((x:any)=>x.confirmationStatus!=='CONFIRMED').length,awaitingAllocation:active.filter((x:any)=>x.confirmationStatus==='CONFIRMED'&&x.allocationStatus!=='ALLOCATED').length,awaitingEquipmentRelease:active.filter((x:any)=>x.allocationStatus==='ALLOCATED'&&x.equipmentReleaseStatus!=='RELEASED').length,cutoffAlerts:exceptions.length,criticalCutoffAlerts:exceptions.filter((x:any)=>['CRITICAL','BREACH'].includes(x.severity)).length,tightSailings:capacity.filter((x:any)=>x.status==='TIGHT'||x.status==='OVERBOOKED').length};
  }
}
