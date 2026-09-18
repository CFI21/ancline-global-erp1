import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { evaluateReleaseSecurity } from './release-security';

@Injectable()
export class DocumentsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  list(user:ScopeUser){
    return this.prisma.document.findMany({
      where:{booking:bookingScope(user)},
      include:{booking:{include:{customer:true,containers:true,routingLegs:{orderBy:{sequence:'asc'}}}}},
      orderBy:{updatedAt:'desc'}
    });
  }

  async get(id:string,user:ScopeUser){
    const d=await this.prisma.document.findUnique({
      where:{id},
      include:{booking:{include:{customer:true,containers:true,routingLegs:{orderBy:{sequence:'asc'}},auditEvents:{orderBy:{createdAt:'desc'},take:40}}}}
    });
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    return d;
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const bookingId=String(body?.bookingId||'');
    if(!bookingId) throw new BadRequestException('Booking is required');
    await this.scope.assertBookingAccess(user,bookingId);
    const documentNo=String(body?.documentNo||'').trim().toUpperCase();
    const type=String(body?.type||'').trim().toUpperCase();
    if(!documentNo) throw new BadRequestException('Document number is required');
    if(!type) throw new BadRequestException('Document type is required');
    const exists=await this.prisma.document.findUnique({where:{documentNo}});
    if(exists) throw new BadRequestException('Document number already exists');
    const d=await this.prisma.document.create({data:{
      bookingId,documentNo,type,version:1,status:String(body?.status||'Draft'),releaseControl:String(body?.releaseControl||'Clear'),fileKey:body?.fileKey||null
    }});
    if(type==='HOUSE_BL') await this.prisma.booking.update({where:{id:bookingId},data:{houseBL:documentNo}});
    if(type==='MASTER_BL') await this.prisma.booking.update({where:{id:bookingId},data:{masterBL:documentNo}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_CREATE',objectType:'Document',objectId:d.id,bookingId:d.bookingId,detail:{type:d.type,documentNo:d.documentNo,version:d.version}});
    return d;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    if(d.status==='Released') throw new BadRequestException('Released documents must be amended before editing');
    const data:any={};
    if(Object.prototype.hasOwnProperty.call(body,'releaseControl')) data.releaseControl=String(body.releaseControl||'Clear');
    if(Object.prototype.hasOwnProperty.call(body,'fileKey')) data.fileKey=body.fileKey||null;
    if(Object.prototype.hasOwnProperty.call(body,'status')) data.status=String(body.status||'Draft');
    const out=await this.prisma.document.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_UPDATE',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{changedFields:Object.keys(data)}});
    return out;
  }

  async submitForReview(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    if(!['Draft','Amended','Rejected'].includes(d.status)) throw new BadRequestException(`Document cannot be submitted from ${d.status}`);
    const out=await this.prisma.document.update({where:{id},data:{status:'Pending Review'}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_SUBMIT_REVIEW',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{version:d.version}});
    return out;
  }

  async approve(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    if(d.status!=='Pending Review') throw new BadRequestException('Only documents pending review can be approved');
    const out=await this.prisma.document.update({where:{id},data:{status:'Approved'}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_APPROVE',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{version:d.version}});
    return out;
  }

  async reject(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    if(d.status!=='Pending Review') throw new BadRequestException('Only documents pending review can be rejected');
    const reason=String(body?.reason||'').trim();
    const out=await this.prisma.document.update({where:{id},data:{status:'Rejected'}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_REJECT',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{version:d.version,reason}});
    return out;
  }

  async amend(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    if(!['Approved','Released','Rejected'].includes(d.status)) throw new BadRequestException('Only approved, released or rejected documents can be amended');
    const out=await this.prisma.document.update({where:{id},data:{version:{increment:1},status:'Amended'}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_AMEND',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{fromVersion:d.version,toVersion:d.version+1}});
    return out;
  }

  async release(id:string,user:ScopeUser){
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    this.scope.assertInternal(user);
    if(d.releaseControl && d.releaseControl!=='Clear') throw new BadRequestException(`Document release is blocked: ${d.releaseControl}`);
    if(d.status!=='Approved') throw new BadRequestException('Document must be approved before release');
    const sensitive=['HOUSE_BL','MASTER_BL','DELIVERY_ORDER','TELEX_RELEASE','SEA_WAYBILL'].includes(String(d.type||'').toUpperCase());
    if(sensitive){const security=await evaluateReleaseSecurity(this.prisma as any,d.bookingId);if(!security.clear)throw new BadRequestException(`Payment / security release blocked: ${security.blockers.join('; ')}`);}
    const out=await this.prisma.document.update({where:{id},data:{status:'Released'}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_RELEASE',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{type:d.type,version:d.version}});
    return out;
  }
}
