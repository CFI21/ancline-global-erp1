import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TrackingService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  list(user:ScopeUser){
    return this.prisma.shipmentMilestone.findMany({
      where:{booking:bookingScope(user)},
      include:{booking:{select:{id:true,bookingNo:true,origin:true,destination:true,status:true,customer:{select:{name:true}},carrier:true,vesselVoyage:true}}},
      orderBy:[{plannedAt:'asc'},{createdAt:'asc'}]
    });
  }

  async byBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    return this.prisma.shipmentMilestone.findMany({where:{bookingId},orderBy:[{plannedAt:'asc'},{createdAt:'asc'}]});
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    if(!body?.bookingId||!body?.code||!body?.label) throw new BadRequestException('Booking, milestone code and label are required');
    await this.scope.assertBookingAccess(user,String(body.bookingId));
    const row=await this.prisma.shipmentMilestone.create({data:{
      bookingId:String(body.bookingId),code:String(body.code).trim().toUpperCase(),label:String(body.label).trim(),
      location:body.location?String(body.location).trim():null,plannedAt:body.plannedAt?new Date(body.plannedAt):null,
      actualAt:body.actualAt?new Date(body.actualAt):null,status:String(body.status||'PLANNED').toUpperCase(),
      source:String(body.source||'MANUAL'),remarks:body.remarks?String(body.remarks):null
    }});
    await this.audit.log({actorId:user.sub,action:'MILESTONE_CREATE',objectType:'ShipmentMilestone',objectId:row.id,bookingId:row.bookingId,detail:{code:row.code,label:row.label,status:row.status}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.shipmentMilestone.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Milestone not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    const data:any={};
    for(const key of ['code','label','location','status','source','remarks']) if(Object.prototype.hasOwnProperty.call(body,key)) data[key]=body[key]||null;
    if(data.code) data.code=String(data.code).trim().toUpperCase();
    if(data.status) data.status=String(data.status).toUpperCase();
    if(Object.prototype.hasOwnProperty.call(body,'plannedAt')) data.plannedAt=body.plannedAt?new Date(body.plannedAt):null;
    if(Object.prototype.hasOwnProperty.call(body,'actualAt')) data.actualAt=body.actualAt?new Date(body.actualAt):null;
    const row=await this.prisma.shipmentMilestone.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'MILESTONE_UPDATE',objectType:'ShipmentMilestone',objectId:id,bookingId:row.bookingId,detail:{changedFields:Object.keys(data),status:row.status}});
    return row;
  }

  async complete(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.shipmentMilestone.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Milestone not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    const row=await this.prisma.shipmentMilestone.update({where:{id},data:{status:'COMPLETED',actualAt:body?.actualAt?new Date(body.actualAt):new Date(),location:body?.location??current.location,remarks:body?.remarks??current.remarks}});
    await this.audit.log({actorId:user.sub,action:'MILESTONE_COMPLETE',objectType:'ShipmentMilestone',objectId:id,bookingId:row.bookingId,detail:{code:row.code,actualAt:row.actualAt}});
    return row;
  }

  async remove(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.shipmentMilestone.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Milestone not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    await this.prisma.shipmentMilestone.delete({where:{id}});
    await this.audit.log({actorId:user.sub,action:'MILESTONE_DELETE',objectType:'ShipmentMilestone',objectId:id,bookingId:current.bookingId,detail:{code:current.code,label:current.label}});
    return {ok:true};
  }
}
