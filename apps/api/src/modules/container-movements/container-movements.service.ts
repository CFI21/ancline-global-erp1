import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const milestoneMap:Record<string,{code:string;label:string}>={
  EMPTY_RELEASED:{code:'EMPTY_RELEASED',label:'Empty Released'},
  PICKED_UP:{code:'PICKED_UP',label:'Empty Picked Up'},
  GATED_IN:{code:'GATED_IN',label:'Gate In'},
  VGM_SUBMITTED:{code:'VGM_SUBMITTED',label:'VGM Submitted'},
  LOADED:{code:'LOADED',label:'Loaded on Vessel'},
  DEPARTED:{code:'DEPARTED',label:'Vessel Departed'},
  TRANSSHIPMENT:{code:'TRANSSHIPMENT',label:'Transshipment'},
  DISCHARGED:{code:'DISCHARGED',label:'Discharged'},
  GATED_OUT:{code:'GATED_OUT',label:'Gate Out'},
  DELIVERED:{code:'DELIVERED',label:'Delivered'},
  EMPTY_RETURNED:{code:'EMPTY_RETURNED',label:'Empty Returned'}
};

@Injectable()
export class ContainerMovementsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private exposure(container:any){
    const now=new Date();
    const daysAfter=(freeUntil:any,end:any)=>{
      if(!freeUntil) return 0;
      const a=new Date(freeUntil).getTime();
      const b=new Date(end||now).getTime();
      if(Number.isNaN(a)||Number.isNaN(b)||b<=a) return 0;
      return Math.ceil((b-a)/86400000);
    };
    const demurrageDays=daysAfter(container.demurrageFreeUntil,container.deliveryAt);
    const detentionDays=daysAfter(container.detentionFreeUntil,container.emptyReturnedAt);
    return {
      demurrageDays,
      detentionDays,
      demurrageExposure:demurrageDays*Number(container.demurrageRatePerDay||0),
      detentionExposure:detentionDays*Number(container.detentionRatePerDay||0),
      totalExposure:demurrageDays*Number(container.demurrageRatePerDay||0)+detentionDays*Number(container.detentionRatePerDay||0),
      currency:container.freeTimeCurrency||'USD',
      demurrageAtRisk:Boolean(container.demurrageFreeUntil&&demurrageDays>0&&!container.deliveryAt),
      detentionAtRisk:Boolean(container.detentionFreeUntil&&detentionDays>0&&!container.emptyReturnedAt)
    };
  }

  async listForBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    return this.prisma.containerMovement.findMany({
      where:{container:{bookingId}},
      include:{container:{select:{id:true,containerNo:true,type:true,status:true,location:true}}},
      orderBy:{occurredAt:'desc'}
    });
  }

  async controlForBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    const containers=await this.prisma.container.findMany({where:{bookingId},orderBy:{containerNo:'asc'}});
    return containers.map(c=>({...c,exposure:this.exposure(c)}));
  }

  async updateControl(containerId:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const existing=await this.prisma.container.findUnique({where:{id:containerId}});
    if(!existing||!existing.bookingId) throw new BadRequestException('Container not found on a booking');
    await this.scope.assertBookingAccess(user,existing.bookingId);
    const textFields=['equipmentProvider','allocationRef','allocationStatus','emptyReleaseOrderNo','emptyDepot','fullReturnTerminal','freeTimeCurrency'];
    const dateFields=['emptyReleaseValidUntil','pickupDate','fullGateInAt','dischargeAt','deliveryAt','detentionFreeUntil','demurrageFreeUntil','emptyReturnDue','emptyReturnedAt'];
    const numberFields=['detentionFreeDays','demurrageFreeDays','detentionRatePerDay','demurrageRatePerDay'];
    const data:any={};
    for(const k of textFields) if(body?.[k]!==undefined) data[k]=body[k]===null||body[k]===''?null:String(body[k]);
    for(const k of dateFields) if(body?.[k]!==undefined){
      if(body[k]===null||body[k]==='') data[k]=null;
      else {const d=new Date(body[k]);if(Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date for ${k}`);data[k]=d;}
    }
    for(const k of numberFields) if(body?.[k]!==undefined){
      if(body[k]===null||body[k]==='') data[k]=null;
      else {const n=Number(body[k]);if(!Number.isFinite(n)||n<0) throw new BadRequestException(`Invalid number for ${k}`);data[k]=n;}
    }
    if(!Object.keys(data).length) throw new BadRequestException('No equipment control fields supplied');
    const updated=await this.prisma.container.update({where:{id:containerId},data});
    await this.audit.log({actorId:user.sub,action:'CONTAINER_CONTROL_UPDATE',objectType:'Container',objectId:containerId,bookingId:existing.bookingId,detail:{containerNo:existing.containerNo,fields:Object.keys(data)}});
    return {...updated,exposure:this.exposure(updated)};
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const bookingId=String(body?.bookingId||'');
    const containerId=String(body?.containerId||'');
    if(!bookingId||!containerId) throw new BadRequestException('Booking and container are required');
    await this.scope.assertBookingAccess(user,bookingId);
    const container=await this.prisma.container.findFirst({where:{id:containerId,bookingId}});
    if(!container) throw new BadRequestException('Container not found on this booking');
    const eventCode=String(body?.eventCode||'').trim().toUpperCase();
    const eventLabel=String(body?.eventLabel||'').trim();
    if(!eventCode||!eventLabel) throw new BadRequestException('Event code and label are required');
    const occurredAt=body?.occurredAt?new Date(body.occurredAt):new Date();
    if(Number.isNaN(occurredAt.getTime())) throw new BadRequestException('Invalid movement date/time');

    const result=await this.prisma.$transaction(async tx=>{
      const movement=await tx.containerMovement.create({data:{
        containerId,
        eventCode,
        eventLabel,
        status:body?.status?String(body.status):null,
        location:body?.location?String(body.location):null,
        occurredAt,
        source:String(body?.source||'MANUAL'),
        reference:body?.reference?String(body.reference):null,
        remarks:body?.remarks?String(body.remarks):null,
        actorId:user.sub
      }});
      const update:any={};
      if(body?.status) update.status=String(body.status);
      if(body?.location!==undefined) update.location=body.location?String(body.location):null;
      if(eventCode==='EMPTY_RELEASED') update.allocationStatus='RELEASED';
      if(eventCode==='PICKED_UP') update.pickupDate=occurredAt;
      if(eventCode==='GATED_IN') update.fullGateInAt=occurredAt;
      if(eventCode==='LOADED') update.allocationStatus='UTILIZED';
      if(eventCode==='DISCHARGED') update.dischargeAt=occurredAt;
      if(eventCode==='DELIVERED') update.deliveryAt=occurredAt;
      if(eventCode==='EMPTY_RETURNED') update.emptyReturnedAt=occurredAt;
      if(Object.keys(update).length) await tx.container.update({where:{id:containerId},data:update});

      const mapped=milestoneMap[eventCode];
      if(mapped){
        const existingMilestone=await tx.shipmentMilestone.findFirst({where:{bookingId,code:mapped.code},orderBy:{createdAt:'asc'}});
        if(existingMilestone){
          await tx.shipmentMilestone.update({where:{id:existingMilestone.id},data:{label:mapped.label,status:'COMPLETED',actualAt:occurredAt,location:body?.location?String(body.location):existingMilestone.location,source:String(body?.source||'CONTAINER'),remarks:body?.remarks?String(body.remarks):existingMilestone.remarks}});
        }else{
          await tx.shipmentMilestone.create({data:{bookingId,code:mapped.code,label:mapped.label,status:'COMPLETED',actualAt:occurredAt,location:body?.location?String(body.location):null,source:String(body?.source||'CONTAINER'),remarks:body?.remarks?String(body.remarks):null}});
        }
      }
      if(eventCode==='DEPARTED') await tx.booking.update({where:{id:bookingId},data:{atd:occurredAt,status:'OPERATIONAL'}});
      if(eventCode==='DISCHARGED') await tx.booking.update({where:{id:bookingId},data:{ata:occurredAt}});
      return movement;
    });

    await this.audit.log({actorId:user.sub,action:'CONTAINER_MOVEMENT_ADD',objectType:'ContainerMovement',objectId:result.id,bookingId,detail:{containerNo:container.containerNo,eventCode,eventLabel,status:body?.status||null,location:body?.location||null,milestoneSynced:Boolean(milestoneMap[eventCode])}});
    return result;
  }
}
