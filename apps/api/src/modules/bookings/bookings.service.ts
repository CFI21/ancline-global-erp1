import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const states = [
  'DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED',
  'BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE',
  'CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED'
];

@Injectable()
export class BookingsService {
  constructor(
    private prisma:PrismaService,
    private scope:ScopeService,
    private audit:AuditService
  ){}

  list(user:ScopeUser){
    return this.prisma.booking.findMany({
      where:bookingScope(user),
      include:{customer:true,producingAgent:true},
      orderBy:{createdAt:'desc'}
    });
  }

  async get(id:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    return this.prisma.booking.findUnique({
      where:{id},
      include:{customer:true,producingAgent:true,documents:true,containers:true,financeLines:true,tasks:true,approvals:true,auditEvents:true}
    });
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const row=await this.prisma.booking.create({data:body});
    await this.audit.log({actorId:user.sub,action:'BOOKING_CREATE',objectType:'Booking',objectId:row.id,bookingId:row.id,detail:{bookingNo:row.bookingNo}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    this.scope.assertInternal(user);
    const existing=await this.prisma.booking.findUnique({where:{id}});
    if(!existing) throw new BadRequestException('Booking not found');

    const allowed=[
      'bookingNo','customerId','producingAgentId','owningBranchId','bookingType','transportMode','serviceType','bookingDate',
      'customerReference','shipperReference','carrierBookingNo','houseBL','masterBL','shipper','consignee','notifyParty',
      'origin','destination','placeOfReceipt','portOfLoading','portOfDischarge','placeOfDelivery','transshipmentPort','terminal',
      'polAgent','podAgent','etd','eta','atd','ata','cyClosing','siCutoff','vgmCutoff','docCutoff','portCutoff',
      'carrier','vesselVoyage','equipment','quantity','containerOwner','throughBL','commodity','packageCount','packageType',
      'grossWeight','netWeight','volumeCbm','marksNumbers','hsCode','cargoDescription','incoterm','freightTerms','currency',
      'specialCargo','notes','creditStatus','slotStatus','equipmentStatus','status'
    ];
    const data:any={};
    for(const key of allowed){ if(Object.prototype.hasOwnProperty.call(body,key)) data[key]=body[key]; }

    const updated=await this.prisma.booking.update({where:{id},data});
    await this.audit.log({
      actorId:user.sub,
      action:'BOOKING_UPDATE',
      objectType:'Booking',
      objectId:id,
      bookingId:id,
      detail:{bookingNo:updated.bookingNo,changedFields:Object.keys(data)}
    });
    return updated;
  }

  async addContainer(id:string,body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    this.scope.assertInternal(user);
    if(!body?.containerNo || !body?.type) throw new BadRequestException('Container number and type are required');
    const row=await this.prisma.container.create({
      data:{
        containerNo:String(body.containerNo).trim().toUpperCase(),
        bookingId:id,
        type:String(body.type),
        ownership:String(body.ownership || 'CARRIER'),
        status:String(body.status || 'PLANNED'),
        location:body.location ? String(body.location) : null,
        sealNo:body.sealNo ? String(body.sealNo) : null,
        vgm:body.vgm !== '' && body.vgm != null ? Number(body.vgm) : null,
        grossWeight:body.grossWeight !== '' && body.grossWeight != null ? Number(body.grossWeight) : null,
        pickupDate:body.pickupDate ? new Date(body.pickupDate) : null,
        emptyDepot:body.emptyDepot ? String(body.emptyDepot) : null,
        fullReturnTerminal:body.fullReturnTerminal ? String(body.fullReturnTerminal) : null
      }
    });
    await this.audit.log({actorId:user.sub,action:'CONTAINER_ADD',objectType:'Container',objectId:row.id,bookingId:id,detail:{containerNo:row.containerNo,type:row.type}});
    return row;
  }

  async updateContainer(id:string,containerId:string,body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    this.scope.assertInternal(user);
    const current=await this.prisma.container.findFirst({where:{id:containerId,bookingId:id}});
    if(!current) throw new BadRequestException('Container not found');
    const data:any={};
    const allowed=['containerNo','type','ownership','status','location','sealNo','vgm','grossWeight','pickupDate','emptyDepot','fullReturnTerminal'];
    for(const key of allowed){
      if(!Object.prototype.hasOwnProperty.call(body,key)) continue;
      if(key==='containerNo') data[key]=String(body[key]).trim().toUpperCase();
      else if(key==='vgm'||key==='grossWeight') data[key]=body[key]!==''&&body[key]!=null?Number(body[key]):null;
      else if(key==='pickupDate') data[key]=body[key]?new Date(body[key]):null;
      else data[key]=body[key]||null;
    }
    const updated=await this.prisma.container.update({where:{id:containerId},data});
    await this.audit.log({actorId:user.sub,action:'CONTAINER_UPDATE',objectType:'Container',objectId:containerId,bookingId:id,detail:{changedFields:Object.keys(data)}});
    return updated;
  }

  async deleteContainer(id:string,containerId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    this.scope.assertInternal(user);
    const current=await this.prisma.container.findFirst({where:{id:containerId,bookingId:id}});
    if(!current) throw new BadRequestException('Container not found');
    await this.prisma.container.delete({where:{id:containerId}});
    await this.audit.log({actorId:user.sub,action:'CONTAINER_DELETE',objectType:'Container',objectId:containerId,bookingId:id,detail:{containerNo:current.containerNo}});
    return {ok:true};
  }

  async advance(id:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,id);
    this.scope.assertInternal(user);
    const b=await this.prisma.booking.findUnique({where:{id}});
    if(!b) throw new BadRequestException('Booking not found');
    const i=states.indexOf(b.status as any);
    if(i<0 || i===states.length-1) return b;
    const next=states[i+1] as any;
    if(next==='CONFIRMED' && (b.creditStatus!=='Passed'||b.slotStatus!=='Protected'||b.equipmentStatus!=='Available'))
      throw new BadRequestException('Credit, slot and equipment must be clear before confirmation');
    const updated=await this.prisma.booking.update({where:{id},data:{status:next}});
    await this.audit.log({actorId:user.sub,action:'BOOKING_STATUS_ADVANCE',objectType:'Booking',objectId:id,bookingId:id,detail:{from:b.status,to:next}});
    return updated;
  }
}
