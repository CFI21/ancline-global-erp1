import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FinanceService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  async list(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    this.scope.assertFinanceAccess(user);
    return this.prisma.financeLine.findMany({where:{bookingId},orderBy:{createdAt:'asc'}});
  }
  async create(body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,body.bookingId);
    this.scope.assertFinanceAccess(user);
    const row=await this.prisma.financeLine.create({data:body});
    await this.audit.log({actorId:user.sub,action:'FINANCE_LINE_CREATE',objectType:'FinanceLine',objectId:row.id,bookingId:row.bookingId,detail:{type:row.type,amount:String(row.amount)}});
    return row;
  }
  async status(id:string,status:any,user:ScopeUser){
    this.scope.assertFinanceAccess(user);
    const line=await this.prisma.financeLine.findUnique({where:{id}});
    if(!line) return null;
    await this.scope.assertBookingAccess(user,line.bookingId);
    const out=await this.prisma.financeLine.update({where:{id},data:{status}});
    await this.audit.log({actorId:user.sub,action:'FINANCE_STATUS_CHANGE',objectType:'FinanceLine',objectId:id,bookingId:line.bookingId,detail:{from:line.status,to:status}});
    return out;
  }
}
