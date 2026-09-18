import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SRC='ANCLINE_BULK_OPERATIONS';
const DAY=86400000;
const BULK_TYPES=['BREAKBULK','BULK','PROJECT_CARGO','RORO'];

@Injectable()
export class BulkOperationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private p(e:any){return (e?.payload||{}) as any;}
  private internal(u:ScopeUser){this.scope.assertInternal(u);}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(n+' is required');return s;}
  private num(v:any,n:string,zero=false){const x=Number(v);if(!Number.isFinite(x)||(zero?x<0:x<=0))throw new BadRequestException(n+' must be '+(zero?'zero or greater':'greater than zero'));return x;}
  private dt(v:any,n:string){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new BadRequestException(n+' is invalid');return d;}
  private generatedNo(){return 'BLK-'+Date.now().toString().slice(-10);}

  private async stateMap(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'BulkShipment'},orderBy:{createdAt:'asc'}});
    const map=new Map<string,any>();
    for(const e of rows){
      const p=this.p(e),prev=map.get(e.objectId)||{bulkOperationNo:e.objectId,cargoLots:[],loadedQuantity:0,dischargedQuantity:0,createdAt:e.createdAt,status:'PLANNED'};
      let next={...prev,updatedAt:e.createdAt};
      if(e.eventType==='BULK_OPERATION_CREATED')next={...next,...p,status:'PLANNED'};
      else if(e.eventType==='BULK_CARGO_LOT_ADDED')next={...next,cargoLots:[...(prev.cargoLots||[]),p]};
      else if(e.eventType==='BULK_VESSEL_NOMINATED')next={...next,...p,status:'VESSEL_NOMINATED'};
      else if(e.eventType==='BULK_NOR_TENDERED')next={...next,...p,status:prev.status==='PLANNED'?'VESSEL_NOMINATED':prev.status};
      else if(e.eventType==='BULK_LOADING_RECORDED')next={...next,loadedQuantity:Number(prev.loadedQuantity||0)+Number(p.quantity||0),lastLoadingAt:p.occurredAt,loadingStartedAt:prev.loadingStartedAt||p.occurredAt,loadingCompletedAt:p.final?p.occurredAt:prev.loadingCompletedAt,status:p.final?'LOADED':'LOADING'};
      else if(e.eventType==='BULK_DISCHARGE_RECORDED')next={...next,dischargedQuantity:Number(prev.dischargedQuantity||0)+Number(p.quantity||0),lastDischargeAt:p.occurredAt,dischargeStartedAt:prev.dischargeStartedAt||p.occurredAt,dischargeCompletedAt:p.final?p.occurredAt:prev.dischargeCompletedAt,status:p.final?'DISCHARGED':'DISCHARGING'};
      else if(e.eventType==='BULK_OPERATION_CLOSED')next={...next,...p,status:'CLOSED',closedAt:p.closedAt||e.createdAt};
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
    const row=(await this.accessible(u)).find((x:any)=>x.bulkOperationNo===id);
    if(!row)throw new NotFoundException('Bulk operation not found');
    return row;
  }
  private metrics(x:any){
    const booked=Number(x.bookedQuantity||0),loaded=Number(x.loadedQuantity||0),discharged=Number(x.dischargedQuantity||0);
    const remainingLoad=Math.max(0,booked-loaded),remainingDischarge=Math.max(0,loaded-discharged);
    const layStart=x.laytimeCommencedAt?new Date(x.laytimeCommencedAt).getTime():null;
    const layEnd=x.loadingCompletedAt?new Date(x.loadingCompletedAt).getTime():(layStart?Date.now():null);
    const laytimeUsedHours=layStart&&layEnd?Math.max(0,(layEnd-layStart)/3600000):0;
    const allowed=Number(x.laytimeAllowedHours||0),excessHours=Math.max(0,laytimeUsedHours-allowed);
    const demurrageRate=Number(x.demurrageRatePerDay||0),estimatedDemurrage=demurrageRate>0?Math.round((excessHours/24)*demurrageRate*100)/100:0;
    const laycanTo=x.laycanTo?new Date(x.laycanTo).getTime():null;
    const laycanRisk=laycanTo&&['PLANNED','VESSEL_NOMINATED'].includes(String(x.status))?laycanTo<Date.now()?'OVERDUE':laycanTo-Date.now()<2*DAY?'DUE_48H':'CLEAR':'CLEAR';
    return {...x,remainingLoad,remainingDischarge,loadPct:booked?Math.round(loaded/booked*1000)/10:0,dischargePct:booked?Math.round(discharged/booked*1000)/10:0,laytimeUsedHours:Math.round(laytimeUsedHours*10)/10,laytimeExcessHours:Math.round(excessHours*10)/10,estimatedDemurrage,laycanRisk};
  }

  async bookings(u:ScopeUser){
    this.internal(u);
    return this.db.booking.findMany({where:{...bookingScope(u),status:{not:'CANCELLED'},bookingType:{in:BULK_TYPES}},select:{id:true,bookingNo:true,shipmentNo:true,bookingType:true,status:true,shipmentStatus:true,customer:true,origin:true,destination:true,portOfLoading:true,portOfDischarge:true,commodity:true,cargoDescription:true,grossWeight:true,volumeCbm:true,currency:true,carrier:true,vesselVoyage:true,etd:true,eta:true},orderBy:{createdAt:'desc'},take:300});
  }
  async operations(u:ScopeUser){return (await this.accessible(u)).map(x=>this.metrics(x)).sort((a:any,b:any)=>new Date(b.updatedAt||b.createdAt).getTime()-new Date(a.updatedAt||a.createdAt).getTime());}
  async dashboard(u:ScopeUser){
    const rows=await this.operations(u),active=rows.filter((x:any)=>x.status!=='CLOSED');
    return {
      active:active.length,
      planned:active.filter((x:any)=>x.status==='PLANNED').length,
      vesselNominated:active.filter((x:any)=>x.status==='VESSEL_NOMINATED').length,
      loading:active.filter((x:any)=>['LOADING','LOADED'].includes(x.status)).length,
      discharging:active.filter((x:any)=>['DISCHARGING','DISCHARGED'].includes(x.status)).length,
      laycanAlerts:active.filter((x:any)=>x.laycanRisk!=='CLEAR').length,
      bookedQuantity:Math.round(active.reduce((s:number,x:any)=>s+Number(x.bookedQuantity||0),0)*100)/100,
      loadedQuantity:Math.round(active.reduce((s:number,x:any)=>s+Number(x.loadedQuantity||0),0)*100)/100,
      dischargedQuantity:Math.round(active.reduce((s:number,x:any)=>s+Number(x.dischargedQuantity||0),0)*100)/100,
      estimatedDemurrage:Math.round(active.reduce((s:number,x:any)=>s+Number(x.estimatedDemurrage||0),0)*100)/100
    };
  }

  async create(b:any,u:ScopeUser){
    this.internal(u);
    const bookingId=this.req(b?.bookingId,'Booking');await this.scope.assertBookingAccess(u,bookingId);
    const booking=await this.db.booking.findUnique({where:{id:bookingId},include:{customer:true}});
    if(!booking||booking.status==='CANCELLED')throw new BadRequestException('Active booking not found');
    if(!BULK_TYPES.includes(String(booking.bookingType||'').toUpperCase()))throw new BadRequestException('Booking type must be BREAKBULK, BULK, PROJECT_CARGO or RORO');
    const existing=(await this.allStates()).find((x:any)=>x.bookingId===bookingId&&x.status!=='CLOSED');
    if(existing)throw new BadRequestException('Booking already has an active bulk operation');
    const bookedQuantity=this.num(b?.bookedQuantity??(booking.grossWeight?Number(booking.grossWeight)/1000:null),'Booked quantity');
    const laycanFrom=this.dt(b?.laycanFrom,'Laycan from'),laycanTo=this.dt(b?.laycanTo,'Laycan to');if(laycanTo<=laycanFrom)throw new BadRequestException('Laycan to must be after laycan from');
    const id=this.generatedNo(),payload={bulkOperationNo:id,bookingId,bookingNo:booking.bookingNo,shipmentNo:booking.shipmentNo||null,customerId:booking.customerId,customerName:booking.customer?.name||null,bookingType:booking.bookingType,cargoType:String(b?.cargoType||booking.bookingType||'BREAKBULK').toUpperCase(),commodity:this.req(b?.commodity||booking.commodity||booking.cargoDescription,'Commodity'),bookedQuantity,quantityUnit:String(b?.quantityUnit||'MT').toUpperCase(),volumeCbm:b?.volumeCbm==null?(booking.volumeCbm||null):this.num(b.volumeCbm,'Volume',true),loadPort:this.req(b?.loadPort||booking.portOfLoading||booking.origin,'Load port'),dischargePort:this.req(b?.dischargePort||booking.portOfDischarge||booking.destination,'Discharge port'),laycanFrom:laycanFrom.toISOString(),laycanTo:laycanTo.toISOString(),cargoReadinessDate:b?.cargoReadinessDate?this.dt(b.cargoReadinessDate,'Cargo readiness date').toISOString():null,freightRate:b?.freightRate==null?null:this.num(b.freightRate,'Freight rate',true),freightRateBasis:String(b?.freightRateBasis||'PER_MT'),currency:String(b?.currency||booking.currency||'USD').toUpperCase(),laytimeAllowedHours:b?.laytimeAllowedHours==null?null:this.num(b.laytimeAllowedHours,'Laytime allowed',true),demurrageRatePerDay:b?.demurrageRatePerDay==null?null:this.num(b.demurrageRatePerDay,'Demurrage rate',true),despatchRatePerDay:b?.despatchRatePerDay==null?null:this.num(b.despatchRatePerDay,'Despatch rate',true),charterPartyNo:b?.charterPartyNo?String(b.charterPartyNo):null,notes:b?.notes?String(b.notes):null,createdBy:u.sub};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_OPERATION_CREATED',externalId:id,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.booking.update({where:{id:bookingId},data:{shipmentStatus:'BULK_PLANNED'}})
    ]);
    await this.audit.log({actorId:u.sub,action:'BULK_OPERATION_CREATE',objectType:'BulkShipment',objectId:id,bookingId,detail:{bookedQuantity,quantityUnit:payload.quantityUnit,laycanFrom:payload.laycanFrom,laycanTo:payload.laycanTo}});
    return this.one(id,u);
  }

  async addCargoLot(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);if(row.status==='CLOSED')throw new BadRequestException('Closed operation cannot be changed');
    const lotNo=this.req(b?.lotNo||('LOT-'+Date.now().toString().slice(-6)),'Lot number'),quantity=this.num(b?.quantity,'Lot quantity');
    const payload={lotNo,description:this.req(b?.description||row.commodity,'Lot description'),quantity,unit:String(b?.unit||row.quantityUnit||'MT').toUpperCase(),weightMt:b?.weightMt==null?null:this.num(b.weightMt,'Weight',true),volumeCbm:b?.volumeCbm==null?null:this.num(b.volumeCbm,'Volume',true),marks:b?.marks?String(b.marks):null,readinessDate:b?.readinessDate?this.dt(b.readinessDate,'Readiness date').toISOString():null,status:String(b?.status||'PLANNED').toUpperCase(),addedBy:u.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_CARGO_LOT_ADDED',externalId:id+':'+lotNo,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:u.sub,action:'BULK_CARGO_LOT_ADD',objectType:'BulkShipment',objectId:id,bookingId:row.bookingId,detail:{lotNo,quantity,unit:payload.unit}});
    return this.one(id,u);
  }

  async nominate(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);if(row.status==='CLOSED')throw new BadRequestException('Closed operation cannot be changed');
    const vesselName=this.req(b?.vesselName,'Vessel name'),voyage=b?.voyage?String(b.voyage):null,etaLoad=b?.etaLoad?this.dt(b.etaLoad,'ETA load port'):null,etdLoad=b?.etdLoad?this.dt(b.etdLoad,'ETD load port'):null;
    const payload={vesselName,imoNo:b?.imoNo?String(b.imoNo):null,voyage,carrier:b?.carrier?String(b.carrier):null,loadPortAgent:b?.loadPortAgent?String(b.loadPortAgent):null,dischargePortAgent:b?.dischargePortAgent?String(b.dischargePortAgent):null,etaLoad:etaLoad?.toISOString()||null,etdLoad:etdLoad?.toISOString()||null,nominatedAt:new Date().toISOString(),nominatedBy:u.sub};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_VESSEL_NOMINATED',externalId:id,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.booking.update({where:{id:row.bookingId},data:{carrier:payload.carrier||row.carrier||null,vesselVoyage:[vesselName,voyage].filter(Boolean).join(' / '),etd:etdLoad||undefined,eta:etaLoad||undefined,shipmentStatus:'VESSEL_NOMINATED'}})
    ]);
    await this.audit.log({actorId:u.sub,action:'BULK_VESSEL_NOMINATE',objectType:'BulkShipment',objectId:id,bookingId:row.bookingId,detail:{vesselName,voyage,imoNo:payload.imoNo}});
    return this.one(id,u);
  }

  async tenderNor(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);if(row.status==='CLOSED')throw new BadRequestException('Closed operation cannot be changed');
    const norTenderedAt=this.dt(b?.norTenderedAt||new Date(),'NOR tendered at'),laytimeCommencedAt=b?.laytimeCommencedAt?this.dt(b.laytimeCommencedAt,'Laytime commenced at'):norTenderedAt;
    const payload={norTenderedAt:norTenderedAt.toISOString(),laytimeCommencedAt:laytimeCommencedAt.toISOString(),norLocation:b?.norLocation?String(b.norLocation):row.loadPort,norRemarks:b?.remarks?String(b.remarks):null,norTenderedBy:u.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_NOR_TENDERED',externalId:id,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:u.sub,action:'BULK_NOR_TENDER',objectType:'BulkShipment',objectId:id,bookingId:row.bookingId,detail:{norTenderedAt:payload.norTenderedAt,laytimeCommencedAt:payload.laytimeCommencedAt}});
    return this.one(id,u);
  }

  async recordLoading(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);if(['DISCHARGING','DISCHARGED','CLOSED'].includes(row.status))throw new BadRequestException('Loading cannot be recorded from '+row.status);
    const quantity=this.num(b?.quantity,'Loaded quantity'),remaining=Math.max(0,Number(row.bookedQuantity||0)-Number(row.loadedQuantity||0));if(quantity>remaining+0.0005&&!b?.allowOverage)throw new BadRequestException('Loaded quantity exceeds remaining booked quantity');
    const occurredAt=this.dt(b?.occurredAt||new Date(),'Loading time'),final=Boolean(b?.final)||quantity>=remaining-0.0005,payload={quantity,occurredAt:occurredAt.toISOString(),final,location:b?.location?String(b.location):row.loadPort,reference:b?.reference?String(b.reference):null,remarks:b?.remarks?String(b.remarks):null,recordedBy:u.sub};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_LOADING_RECORDED',externalId:id,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.booking.update({where:{id:row.bookingId},data:{shipmentStatus:final?'LOADED':'LOADING',atd:final?occurredAt:undefined}})
    ]);
    await this.audit.log({actorId:u.sub,action:'BULK_LOADING_RECORD',objectType:'BulkShipment',objectId:id,bookingId:row.bookingId,detail:{quantity,final,occurredAt:payload.occurredAt}});
    return this.one(id,u);
  }

  async recordDischarge(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=await this.one(id,u);if(!['LOADED','DISCHARGING','DISCHARGED'].includes(row.status))throw new BadRequestException('Cargo must be loaded before discharge');
    if(row.status==='CLOSED')throw new BadRequestException('Closed operation cannot be changed');
    const quantity=this.num(b?.quantity,'Discharged quantity'),remaining=Math.max(0,Number(row.loadedQuantity||0)-Number(row.dischargedQuantity||0));if(quantity>remaining+0.0005&&!b?.allowOverage)throw new BadRequestException('Discharged quantity exceeds loaded quantity');
    const occurredAt=this.dt(b?.occurredAt||new Date(),'Discharge time'),final=Boolean(b?.final)||quantity>=remaining-0.0005,payload={quantity,occurredAt:occurredAt.toISOString(),final,location:b?.location?String(b.location):row.dischargePort,reference:b?.reference?String(b.reference):null,remarks:b?.remarks?String(b.remarks):null,recordedBy:u.sub};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_DISCHARGE_RECORDED',externalId:id,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.booking.update({where:{id:row.bookingId},data:{shipmentStatus:final?'DISCHARGED':'DISCHARGING',ata:final?occurredAt:undefined}})
    ]);
    await this.audit.log({actorId:u.sub,action:'BULK_DISCHARGE_RECORD',objectType:'BulkShipment',objectId:id,bookingId:row.bookingId,detail:{quantity,final,occurredAt:payload.occurredAt}});
    return this.one(id,u);
  }

  async close(id:string,b:any,u:ScopeUser){
    this.internal(u);const row=this.metrics(await this.one(id,u));if(row.status==='CLOSED')return row;
    const booked=Number(row.bookedQuantity||0),discharged=Number(row.dischargedQuantity||0),shortfall=Math.max(0,booked-discharged);if(shortfall>0.0005&&!b?.acceptVariance)throw new BadRequestException('Discharged quantity is below booked quantity. Accept variance to close.');
    const payload={closedAt:new Date().toISOString(),closedBy:u.sub,quantityVariance:Math.round((discharged-booked)*1000)/1000,varianceReason:b?.varianceReason?String(b.varianceReason):null,finalDemurrage:b?.finalDemurrage==null?row.estimatedDemurrage:this.num(b.finalDemurrage,'Final demurrage',true),notes:b?.notes?String(b.notes):null};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BULK_OPERATION_CLOSED',externalId:id,objectType:'BulkShipment',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.booking.update({where:{id:row.bookingId},data:{shipmentStatus:'COMPLETED'}})
    ]);
    await this.audit.log({actorId:u.sub,action:'BULK_OPERATION_CLOSE',objectType:'BulkShipment',objectId:id,bookingId:row.bookingId,detail:{quantityVariance:payload.quantityVariance,finalDemurrage:payload.finalDemurrage}});
    return this.one(id,u);
  }
}
