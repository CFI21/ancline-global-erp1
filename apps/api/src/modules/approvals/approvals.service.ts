import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ApprovalsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  list(user:ScopeUser){
    this.scope.assertInternal(user);
    const scoped=bookingScope(user);
    return this.prisma.approval.findMany({
      where:Object.keys(scoped).length?{booking:{is:scoped}}:{},
      include:{booking:{select:{bookingNo:true,origin:true,destination:true}}},
      orderBy:{createdAt:'desc'}
    });
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    if(!body?.type) throw new BadRequestException('Approval type is required');
    if(body.bookingId) await this.scope.assertBookingAccess(user,String(body.bookingId));
    const row=await this.prisma.approval.create({data:{bookingId:body.bookingId||null,type:String(body.type),requesterId:body.requesterId||user.sub,approverId:body.approverId||'Operations Manager',status:'Pending',reason:body.reason||null}});
    await this.audit.log({actorId:user.sub,action:'APPROVAL_REQUEST',objectType:'Approval',objectId:row.id,bookingId:row.bookingId||undefined,detail:{type:row.type,approverId:row.approverId}});
    return row;
  }

  private async decision(id:string,status:'Approved'|'Rejected',user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.approval.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Approval not found');
    if(current.bookingId) await this.scope.assertBookingAccess(user,current.bookingId);
    const row=await this.prisma.approval.update({where:{id},data:{status}});
    await this.audit.log({actorId:user.sub,action:status==='Approved'?'APPROVAL_APPROVE':'APPROVAL_REJECT',objectType:'Approval',objectId:id,bookingId:row.bookingId||undefined,detail:{type:row.type,approverId:row.approverId}});
    return row;
  }

  approve(id:string,user:ScopeUser){return this.decision(id,'Approved',user);}
  reject(id:string,user:ScopeUser){return this.decision(id,'Rejected',user);}
}
