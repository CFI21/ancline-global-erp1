import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RoutingService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  async list(user:ScopeUser){
    const bookings=await this.prisma.booking.findMany({where:bookingScope(user),select:{id:true}});
    const ids=bookings.map(b=>b.id);
    if(!ids.length) return [];
    return this.prisma.bookingLeg.findMany({
      where:{bookingId:{in:ids}},
      include:{booking:{select:{id:true,bookingNo:true,origin:true,destination:true,status:true,customer:{select:{name:true}}}}},
      orderBy:[{bookingId:'asc'},{sequence:'asc'}]
    });
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const bookingId=String(body?.bookingId||'');
    if(!bookingId) throw new BadRequestException('Booking is required');
    await this.scope.assertBookingAccess(user,bookingId);
    const sequence=Number(body?.sequence||0);
    if(!sequence || sequence<1) throw new BadRequestException('Sequence must be 1 or greater');
    if(!body?.origin || !body?.destination) throw new BadRequestException('Origin and destination are required');
    const existing=await this.prisma.bookingLeg.findUnique({where:{bookingId_sequence:{bookingId,sequence}}});
    if(existing) throw new BadRequestException(`Routing leg ${sequence} already exists for this booking`);
    const row=await this.prisma.bookingLeg.create({data:{
      bookingId,sequence,legType:String(body.legType||'MAIN'),mode:String(body.mode||'SEA'),
      origin:String(body.origin).trim(),destination:String(body.destination).trim(),carrier:body.carrier||null,
      vessel:body.vessel||null,voyage:body.voyage||null,terminal:body.terminal||null,
      etd:body.etd?new Date(body.etd):null,eta:body.eta?new Date(body.eta):null,
      atd:body.atd?new Date(body.atd):null,ata:body.ata?new Date(body.ata):null,
      status:String(body.status||'PLANNED'),remarks:body.remarks||null
    }});
    await this.audit.log({actorId:user.sub,action:'ROUTING_LEG_CREATE',objectType:'BookingLeg',objectId:row.id,bookingId,detail:{sequence,origin:row.origin,destination:row.destination}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.bookingLeg.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Routing leg not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    const allowed=['sequence','legType','mode','origin','destination','carrier','vessel','voyage','terminal','etd','eta','atd','ata','status','remarks'];
    const data:any={};
    for(const key of allowed){
      if(!Object.prototype.hasOwnProperty.call(body,key)) continue;
      if(key==='sequence') data[key]=Number(body[key]);
      else if(['etd','eta','atd','ata'].includes(key)) data[key]=body[key]?new Date(body[key]):null;
      else data[key]=body[key]||null;
    }
    const row=await this.prisma.bookingLeg.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'ROUTING_LEG_UPDATE',objectType:'BookingLeg',objectId:id,bookingId:current.bookingId,detail:{changedFields:Object.keys(data)}});
    return row;
  }

  async remove(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.bookingLeg.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Routing leg not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    await this.prisma.bookingLeg.delete({where:{id}});
    await this.audit.log({actorId:user.sub,action:'ROUTING_LEG_DELETE',objectType:'BookingLeg',objectId:id,bookingId:current.bookingId,detail:{sequence:current.sequence}});
    return {ok:true};
  }
}
