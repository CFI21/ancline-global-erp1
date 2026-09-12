import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  list(user:ScopeUser){
    return this.prisma.document.findMany({
      where:{booking:bookingScope(user)},
      include:{booking:true},
      orderBy:{createdAt:'desc'}
    });
  }
  async create(body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,body.bookingId);
    this.scope.assertInternal(user);
    const d=await this.prisma.document.create({data:body});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_CREATE',objectType:'Document',objectId:d.id,bookingId:d.bookingId,detail:{type:d.type}});
    return d;
  }
  async release(id:string,user:ScopeUser){
    const d=await this.prisma.document.findUnique({where:{id}});
    if(!d) throw new BadRequestException('Document not found');
    await this.scope.assertBookingAccess(user,d.bookingId);
    this.scope.assertInternal(user);
    if(d.releaseControl && d.releaseControl!=='Clear') throw new BadRequestException('Document release is blocked');
    const out=await this.prisma.document.update({where:{id},data:{status:'Released'}});
    await this.audit.log({actorId:user.sub,action:'DOCUMENT_RELEASE',objectType:'Document',objectId:id,bookingId:d.bookingId,detail:{type:d.type}});
    return out;
  }
}
