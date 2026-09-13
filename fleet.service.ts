import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
@Injectable()
export class FleetService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  list(user:ScopeUser){ this.scope.assertInternal(user); return this.prisma.container.findMany({include:{booking:true,events:{orderBy:{eventAt:'desc'},take:3}},orderBy:{containerNo:'asc'}}); }
  async events(containerId:string,user:ScopeUser){ this.scope.assertInternal(user); return this.prisma.containerEvent.findMany({where:{containerId},orderBy:{eventAt:'asc'}}); }
  async addEvent(containerId:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user); const c=await this.prisma.container.findUnique({where:{id:containerId}}); if(!c) throw new BadRequestException('Container not found');
    const row=await this.prisma.containerEvent.create({data:{...body,containerId,eventAt:new Date(body.eventAt||Date.now())}});
    await this.prisma.container.update({where:{id:containerId},data:{location:body.location||c.location,status:body.eventType||c.status}});
    await this.audit.log({actorId:user.sub,action:'CONTAINER_EVENT',objectType:'ContainerEvent',objectId:row.id,bookingId:c.bookingId||undefined,detail:{containerNo:c.containerNo,eventType:row.eventType,location:row.location}}); return row;
  }
  async correct(containerId:string,body:any,user:ScopeUser){ return this.addEvent(containerId,{...body,eventType:'CORRECTION',isCorrection:true},user); }
}
