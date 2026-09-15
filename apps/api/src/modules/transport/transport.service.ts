import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const orderTypes=['EMPTY_PICKUP','EXPORT_HAULAGE','IMPORT_DELIVERY','EMPTY_RETURN','PORT_TRANSFER'];

@Injectable()
export class TransportService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private date(v:any,name:string){
    if(v===undefined) return undefined;
    if(v===null||v==='') return null;
    const d=new Date(v);
    if(Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date for ${name}`);
    return d;
  }

  async list(user:ScopeUser){
    const bookings=await this.prisma.booking.findMany({where:bookingScope(user),select:{id:true,bookingNo:true,customerReference:true,origin:true,destination:true,status:true,customer:{select:{name:true}}}});
    const ids=bookings.map(b=>b.id);
    if(!ids.length) return [];
    const orders=await this.prisma.transportOrder.findMany({where:{bookingId:{in:ids}},orderBy:[{plannedPickupAt:'asc'},{createdAt:'desc'}]});
    const containerIds=Array.from(new Set(orders.map(o=>o.containerId).filter(Boolean) as string[]));
    const containers=containerIds.length?await this.prisma.container.findMany({where:{id:{in:containerIds}},select:{id:true,containerNo:true,type:true,status:true,location:true}}):[];
    const byBooking=new Map(bookings.map(b=>[b.id,b]));
    const byContainer=new Map(containers.map(c=>[c.id,c]));
    return orders.map(o=>({...o,booking:byBooking.get(o.bookingId)||null,container:o.containerId?byContainer.get(o.containerId)||null:null}));
  }

  async forBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    const rows=await this.prisma.transportOrder.findMany({where:{bookingId},orderBy:[{plannedPickupAt:'asc'},{createdAt:'desc'}]});
    const containerIds=Array.from(new Set(rows.map(o=>o.containerId).filter(Boolean) as string[]));
    const containers=containerIds.length?await this.prisma.container.findMany({where:{id:{in:containerIds}},select:{id:true,containerNo:true,type:true,status:true,location:true}}):[];
    const byContainer=new Map(containers.map(c=>[c.id,c]));
    return rows.map(o=>({...o,container:o.containerId?byContainer.get(o.containerId)||null:null}));
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const bookingId=String(body?.bookingId||'').trim();
    if(!bookingId) throw new BadRequestException('Booking is required');
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,bookingNo:true}});
    if(!booking) throw new BadRequestException('Booking not found');
    const orderType=String(body?.orderType||'IMPORT_DELIVERY').trim().toUpperCase();
    if(!orderTypes.includes(orderType)) throw new BadRequestException('Unsupported transport order type');
    const pickupLocation=String(body?.pickupLocation||'').trim();
    const deliveryLocation=String(body?.deliveryLocation||'').trim();
    if(!pickupLocation||!deliveryLocation) throw new BadRequestException('Pickup and delivery locations are required');
    const containerId=body?.containerId?String(body.containerId):null;
    if(containerId){
      const container=await this.prisma.container.findFirst({where:{id:containerId,bookingId}});
      if(!container) throw new BadRequestException('Container not found on this booking');
    }
    const orderNo=String(body?.orderNo||`TRN-${Date.now().toString().slice(-10)}`).trim().toUpperCase();
    const duplicate=await this.prisma.transportOrder.findUnique({where:{orderNo}});
    if(duplicate) throw new BadRequestException(`Transport order ${orderNo} already exists`);
    const row=await this.prisma.transportOrder.create({data:{
      orderNo,bookingId,containerId,orderType,
      providerOrgId:body?.providerOrgId?String(body.providerOrgId):null,
      providerName:body?.providerName?String(body.providerName):null,
      driverName:body?.driverName?String(body.driverName):null,
      driverPhone:body?.driverPhone?String(body.driverPhone):null,
      truckNo:body?.truckNo?String(body.truckNo):null,
      trailerNo:body?.trailerNo?String(body.trailerNo):null,
      pickupLocation,deliveryLocation,
      plannedPickupAt:this.date(body?.plannedPickupAt,'plannedPickupAt'),
      plannedDeliveryAt:this.date(body?.plannedDeliveryAt,'plannedDeliveryAt'),
      status:'PLANNED',
      customerReference:body?.customerReference?String(body.customerReference):null,
      providerReference:body?.providerReference?String(body.providerReference):null,
      instructions:body?.instructions?String(body.instructions):null,
      proofOfDeliveryRef:body?.proofOfDeliveryRef?String(body.proofOfDeliveryRef):null,
      createdBy:user.sub
    }});
    await this.audit.log({actorId:user.sub,action:'TRANSPORT_ORDER_CREATE',objectType:'TransportOrder',objectId:row.id,bookingId,detail:{orderNo,rowType:orderType,containerId}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.transportOrder.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Transport order not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    const data:any={};
    const textFields=['providerOrgId','providerName','driverName','driverPhone','truckNo','trailerNo','pickupLocation','deliveryLocation','customerReference','providerReference','instructions','proofOfDeliveryRef'];
    const dateFields=['plannedPickupAt','plannedDeliveryAt','actualPickupAt','actualDeliveryAt'];
    for(const k of textFields) if(body?.[k]!==undefined) data[k]=body[k]===null||body[k]===''?null:String(body[k]);
    for(const k of dateFields) if(body?.[k]!==undefined) data[k]=this.date(body[k],k);
    if(body?.containerId!==undefined){
      const cid=body.containerId?String(body.containerId):null;
      if(cid){const c=await this.prisma.container.findFirst({where:{id:cid,bookingId:current.bookingId}});if(!c) throw new BadRequestException('Container not found on this booking');}
      data.containerId=cid;
    }
    if(!Object.keys(data).length) throw new BadRequestException('No transport fields supplied');
    const updated=await this.prisma.transportOrder.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'TRANSPORT_ORDER_UPDATE',objectType:'TransportOrder',objectId:id,bookingId:current.bookingId,detail:{orderNo:current.orderNo,fields:Object.keys(data)}});
    return updated;
  }

  async dispatch(id:string,user:ScopeUser){return this.transition(id,'DISPATCHED',user);}
  async pickup(id:string,user:ScopeUser){return this.transition(id,'PICKED_UP',user);}
  async deliver(id:string,user:ScopeUser){return this.transition(id,'DELIVERED',user);}
  async cancel(id:string,user:ScopeUser){return this.transition(id,'CANCELLED',user);}

  private async transition(id:string,next:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.transportOrder.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Transport order not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    if(current.status==='CANCELLED') throw new BadRequestException('Cancelled transport order cannot be advanced');
    const now=new Date();
    const data:any={status:next};
    if(next==='PICKED_UP') data.actualPickupAt=now;
    if(next==='DELIVERED') data.actualDeliveryAt=now;

    const updated=await this.prisma.$transaction(async tx=>{
      const order=await tx.transportOrder.update({where:{id},data});
      if(next==='DELIVERED'&&current.containerId){
        const map:any={
          EMPTY_PICKUP:{eventCode:'PICKED_UP',eventLabel:'Empty Picked Up',containerStatus:'PICKED_UP'},
          EXPORT_HAULAGE:{eventCode:'GATED_IN',eventLabel:'Gate In',containerStatus:'GATED_IN'},
          IMPORT_DELIVERY:{eventCode:'DELIVERED',eventLabel:'Delivered',containerStatus:'DELIVERED'},
          EMPTY_RETURN:{eventCode:'EMPTY_RETURNED',eventLabel:'Empty Returned',containerStatus:'EMPTY_RETURNED'},
          PORT_TRANSFER:{eventCode:'GATED_IN',eventLabel:'Gate In',containerStatus:'GATED_IN'}
        };
        const m=map[current.orderType];
        if(m){
          await tx.containerMovement.create({data:{containerId:current.containerId,eventCode:m.eventCode,eventLabel:m.eventLabel,status:m.containerStatus,location:current.deliveryLocation,occurredAt:now,source:'TRANSPORT',reference:current.orderNo,remarks:current.instructions,actorId:user.sub}});
          const cUpdate:any={status:m.containerStatus,location:current.deliveryLocation};
          if(m.eventCode==='PICKED_UP') cUpdate.pickupDate=now;
          if(m.eventCode==='GATED_IN') cUpdate.fullGateInAt=now;
          if(m.eventCode==='DELIVERED') cUpdate.deliveryAt=now;
          if(m.eventCode==='EMPTY_RETURNED') cUpdate.emptyReturnedAt=now;
          await tx.container.update({where:{id:current.containerId},data:cUpdate});
          const milestone=await tx.shipmentMilestone.findFirst({where:{bookingId:current.bookingId,code:m.eventCode},orderBy:{createdAt:'asc'}});
          if(milestone) await tx.shipmentMilestone.update({where:{id:milestone.id},data:{status:'COMPLETED',actualAt:now,location:current.deliveryLocation,source:'TRANSPORT'}});
          else await tx.shipmentMilestone.create({data:{bookingId:current.bookingId,code:m.eventCode,label:m.eventLabel,status:'COMPLETED',actualAt:now,location:current.deliveryLocation,source:'TRANSPORT'}});
        }
      }
      return order;
    });
    await this.audit.log({actorId:user.sub,action:`TRANSPORT_ORDER_${next}`,objectType:'TransportOrder',objectId:id,bookingId:current.bookingId,detail:{orderNo:current.orderNo,from:current.status,to:next,containerId:current.containerId}});
    return updated;
  }
}
