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
