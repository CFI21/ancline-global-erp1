import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const CASE_TYPE='CUSTOMS_CLEARANCE';
const validStatuses=['DRAFT','SUBMITTED','UNDER_REVIEW','INSPECTION','ON_HOLD','DUTY_PENDING','CLEARED','RELEASED','CANCELLED'];

@Injectable()
export class CustomsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private cleanPayload(body:any,current:any={}){
    const p={...(current||{})};
    const text=['declarationNo','customsOffice','brokerName','brokerReference','clearanceType','entryType','commoditySummary','hsCode','holdReason','inspectionLocation','currency','remarks'];
    for(const k of text) if(body?.[k]!==undefined) p[k]=body[k]===null||body[k]===''?null:String(body[k]);
    const nums=['dutyAmount','taxAmount','otherCharges'];
    for(const k of nums) if(body?.[k]!==undefined){const n=Number(body[k]);if(body[k]===null||body[k]==='')p[k]=null;else if(!Number.isFinite(n)||n<0)throw new BadRequestException(`Invalid ${k}`);else p[k]=n;}
    const dates=['submittedAt','inspectionAt','clearedAt','releasedAt'];
    for(const k of dates) if(body?.[k]!==undefined){if(body[k]===null||body[k]==='')p[k]=null;else{const d=new Date(body[k]);if(Number.isNaN(d.getTime()))throw new BadRequestException(`Invalid date for ${k}`);p[k]=d.toISOString();}}
    return p;
  }

  private expose(row:any,booking:any){return {...row,caseId:row.id,booking,payload:row.payload||{}};}

  async list(user:ScopeUser){
    const bookings=await this.prisma.booking.findMany({where:bookingScope(user),select:{id:true,bookingNo:true,origin:true,destination:true,status:true,customer:{select:{name:true}}}});
    const ids=bookings.map(b=>b.id);if(!ids.length)return [];
    const rows=await this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_CUSTOMS',eventType:CASE_TYPE,objectType:'Booking',objectId:{in:ids}},orderBy:{updatedAt:'desc'}});
    const byBooking=new Map(bookings.map(b=>[b.id,b]));
    return rows.map(r=>this.expose(r,byBooking.get(r.objectId)||null));
  }

  async forBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,bookingNo:true,origin:true,destination:true,status:true,customer:{select:{name:true}}}});
    const rows=await this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_CUSTOMS',eventType:CASE_TYPE,objectType:'Booking',objectId:bookingId},orderBy:{updatedAt:'desc'}});
    return rows.map(r=>this.expose(r,booking));
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const bookingId=String(body?.bookingId||'').trim();if(!bookingId)throw new BadRequestException('Booking is required');
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},select:{bookingNo:true}});if(!booking)throw new BadRequestException('Booking not found');
    const declarationNo=String(body?.declarationNo||'').trim();
    const externalId=declarationNo||`CUS-${Date.now().toString().slice(-10)}`;
    const payload=this.cleanPayload({...body,declarationNo:declarationNo||externalId});
    const row=await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_CUSTOMS',eventType:CASE_TYPE,externalId,objectType:'Booking',objectId:bookingId,status:'DRAFT',payload}});
    await this.audit.log({actorId:user.sub,action:'CUSTOMS_CASE_CREATE',objectType:'CustomsClearance',objectId:row.id,bookingId,detail:{declarationNo:externalId}});
    return this.expose(row,{id:bookingId,bookingNo:booking.bookingNo});
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.integrationEvent.findUnique({where:{id}});if(!current||current.sourceSystem!=='ANCLINE_CUSTOMS'||current.eventType!==CASE_TYPE)throw new BadRequestException('Customs case not found');
    await this.scope.assertBookingAccess(user,current.objectId);
    const payload=this.cleanPayload(body,current.payload as any);
    const status=body?.status!==undefined?String(body.status).toUpperCase():current.status;
    if(!validStatuses.includes(status))throw new BadRequestException('Unsupported customs status');
    const row=await this.prisma.integrationEvent.update({where:{id},data:{status,payload,externalId:payload.declarationNo||current.externalId,completedAt:['CLEARED','RELEASED','CANCELLED'].includes(status)?new Date():null}});
    await this.audit.log({actorId:user.sub,action:'CUSTOMS_CASE_UPDATE',objectType:'CustomsClearance',objectId:id,bookingId:current.objectId,detail:{from:current.status,to:status}});
    return row;
  }

  async transition(id:string,status:string,user:ScopeUser){
    this.scope.assertInternal(user);status=status.toUpperCase();if(!validStatuses.includes(status))throw new BadRequestException('Unsupported customs status');
    const current=await this.prisma.integrationEvent.findUnique({where:{id}});if(!current||current.sourceSystem!=='ANCLINE_CUSTOMS'||current.eventType!==CASE_TYPE)throw new BadRequestException('Customs case not found');
    await this.scope.assertBookingAccess(user,current.objectId);
    const payload:any={...(current.payload as any||{})};const now=new Date();
    if(status==='SUBMITTED'&&!payload.submittedAt)payload.submittedAt=now.toISOString();
    if(status==='INSPECTION'&&!payload.inspectionAt)payload.inspectionAt=now.toISOString();
    if(status==='CLEARED'&&!payload.clearedAt)payload.clearedAt=now.toISOString();
    if(status==='RELEASED'&&!payload.releasedAt)payload.releasedAt=now.toISOString();
    const row=await this.prisma.$transaction(async tx=>{
      const updated=await tx.integrationEvent.update({where:{id},data:{status,payload,completedAt:['CLEARED','RELEASED','CANCELLED'].includes(status)?now:null}});
      if(status==='RELEASED'){
        const milestone=await tx.shipmentMilestone.findFirst({where:{bookingId:current.objectId,code:'CUSTOMS_RELEASED'},orderBy:{createdAt:'asc'}});
        if(milestone)await tx.shipmentMilestone.update({where:{id:milestone.id},data:{status:'COMPLETED',actualAt:now,source:'CUSTOMS',remarks:payload.declarationNo||null}});
        else await tx.shipmentMilestone.create({data:{bookingId:current.objectId,code:'CUSTOMS_RELEASED',label:'Customs Released',status:'COMPLETED',actualAt:now,source:'CUSTOMS',remarks:payload.declarationNo||null}});
      }
      return updated;
    });
    await this.audit.log({actorId:user.sub,action:`CUSTOMS_${status}`,objectType:'CustomsClearance',objectId:id,bookingId:current.objectId,detail:{from:current.status,to:status}});
    return row;
  }
}
