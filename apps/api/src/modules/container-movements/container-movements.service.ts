import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ContainerMovementsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  async listForBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    return this.prisma.containerMovement.findMany({
      where:{container:{bookingId}},
      include:{container:{select:{id:true,containerNo:true,type:true,status:true,location:true}}},
      orderBy:{occurredAt:'desc'}
    });
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
      if(Object.keys(update).length) await tx.container.update({where:{id:containerId},data:update});
      return movement;
    });

    await this.audit.log({actorId:user.sub,action:'CONTAINER_MOVEMENT_ADD',objectType:'ContainerMovement',objectId:result.id,bookingId,detail:{containerNo:container.containerNo,eventCode,eventLabel,status:body?.status||null,location:body?.location||null}});
    return result;
  }
}
