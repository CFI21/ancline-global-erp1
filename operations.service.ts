import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OperationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  async dashboard(user:ScopeUser){
    this.scope.assertInternal(user);
    const [services,voyages,allocations,legs]=await Promise.all([
      this.prisma.commercialService.findMany({where:{active:true},orderBy:{code:'asc'}}),
      this.prisma.voyage.findMany({include:{service:true,allocations:true},orderBy:{etd:'asc'}}),
      this.prisma.allocation.findMany({include:{voyage:{include:{service:true}}},orderBy:{createdAt:'desc'}}),
      this.prisma.bookingLeg.findMany({include:{booking:true,voyage:true},orderBy:[{bookingId:'asc'},{sequence:'asc'}]})
    ]);
    return {services,voyages,allocations,legs};
  }
  async createService(body:any,user:ScopeUser){ this.scope.assertInternal(user); const row=await this.prisma.commercialService.create({data:body}); await this.audit.log({actorId:user.sub,action:'SERVICE_CREATE',objectType:'CommercialService',objectId:row.id,detail:{code:row.code}}); return row; }
  async createVoyage(body:any,user:ScopeUser){ this.scope.assertInternal(user); const row=await this.prisma.voyage.create({data:{...body,etd:body.etd?new Date(body.etd):null,eta:body.eta?new Date(body.eta):null}}); await this.audit.log({actorId:user.sub,action:'VOYAGE_CREATE',objectType:'Voyage',objectId:row.id,detail:{voyageNo:row.voyageNo}}); return row; }
  async createAllocation(body:any,user:ScopeUser){ this.scope.assertInternal(user); const row=await this.prisma.allocation.create({data:body}); await this.audit.log({actorId:user.sub,action:'ALLOCATION_CREATE',objectType:'Allocation',objectId:row.id,detail:{voyageId:row.voyageId,purchasedTeu:String(row.purchasedTeu)}}); return row; }
  async addLeg(bookingId:string,body:any,user:ScopeUser){ await this.scope.assertBookingAccess(user,bookingId); this.scope.assertInternal(user); const row=await this.prisma.bookingLeg.create({data:{...body,bookingId,etd:body.etd?new Date(body.etd):null,eta:body.eta?new Date(body.eta):null}}); await this.audit.log({actorId:user.sub,action:'BOOKING_LEG_CREATE',objectType:'BookingLeg',objectId:row.id,bookingId,detail:{sequence:row.sequence,fromPort:row.fromPort,toPort:row.toPort}}); return row; }
  async allocationLedger(voyageId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const rows=await this.prisma.allocation.findMany({where:{voyageId},include:{voyage:true}});
    return rows.map(a=>{ const effective=Number(a.standardUsedTeu)+Number(a.oogBaseTeu)+Number(a.slotKillTeu)+Number(a.reeferDgTeu); return {...a,effectiveUsedTeu:effective,remainingTeu:Number(a.purchasedTeu)-effective}; });
  }
  async protectSlot(allocationId:string,teu:number,user:ScopeUser){
    this.scope.assertInternal(user); const a=await this.prisma.allocation.findUnique({where:{id:allocationId}}); if(!a) throw new BadRequestException('Allocation not found');
    const next=Number(a.standardUsedTeu)+Number(teu); const effective=next+Number(a.oogBaseTeu)+Number(a.slotKillTeu)+Number(a.reeferDgTeu); if(effective>Number(a.purchasedTeu)) throw new BadRequestException('Insufficient allocation');
    return this.prisma.allocation.update({where:{id:allocationId},data:{standardUsedTeu:next,status:effective===Number(a.purchasedTeu)?'FULL':'PROTECTED'}});
  }
}
