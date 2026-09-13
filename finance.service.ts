import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FinanceService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  async list(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId); this.scope.assertFinanceAccess(user);
    return this.prisma.financeLine.findMany({where:{bookingId},include:{crtLines:{include:{crt:true}}},orderBy:{createdAt:'asc'}});
  }
  async summary(bookingId:string,user:ScopeUser){
    const rows:any[]=await this.list(bookingId,user); let revenue=0,cost=0,wip=0,accrual=0;
    for(const r of rows){const a=Number(r.finalAmount??r.amount); if(r.type==='REVENUE') revenue+=a; else cost+=a; if(r.status==='WIP') wip+=a; if(r.status==='ACCRUED') accrual+=a;}
    return {bookingId,revenue,cost,gp:revenue-cost,marginPct:revenue?((revenue-cost)/revenue)*100:0,wip,accrual,lineCount:rows.length};
  }
  async create(body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,body.bookingId); this.scope.assertFinanceAccess(user);
    const row=await this.prisma.financeLine.create({data:body});
    await this.audit.log({actorId:user.sub,action:'FINANCE_LINE_CREATE',objectType:'FinanceLine',objectId:row.id,bookingId:row.bookingId,detail:{type:row.type,amount:String(row.amount)}}); return row;
  }
  async status(id:string,status:any,user:ScopeUser){
    this.scope.assertFinanceAccess(user); const line=await this.prisma.financeLine.findUnique({where:{id}}); if(!line) return null; await this.scope.assertBookingAccess(user,line.bookingId);
    const out=await this.prisma.financeLine.update({where:{id},data:{status}}); await this.audit.log({actorId:user.sub,action:'FINANCE_STATUS_CHANGE',objectType:'FinanceLine',objectId:id,bookingId:line.bookingId,detail:{from:line.status,to:status}}); return out;
  }
  async createCrt(body:any,user:ScopeUser){
    this.scope.assertFinanceAccess(user); await this.scope.assertBookingAccess(user,body.bookingId); if(!Array.isArray(body.lines)||!body.lines.length) throw new BadRequestException('CRT requires at least one line');
    const crt=await this.prisma.costRevenueTransaction.create({data:{crtNo:body.crtNo,bookingId:body.bookingId,reason:body.reason,requesterId:user.sub,status:'APPROVAL_PENDING',lines:{create:body.lines.map((x:any)=>({financeLineId:x.financeLineId,previousAmount:x.previousAmount,newAmount:x.newAmount,currency:x.currency||'USD'}))}},include:{lines:true}});
    await this.audit.log({actorId:user.sub,action:'CRT_CREATE',objectType:'CostRevenueTransaction',objectId:crt.id,bookingId:body.bookingId,detail:{crtNo:crt.crtNo,lineCount:crt.lines.length}}); return crt;
  }
  async approveCrt(id:string,user:ScopeUser){
    this.scope.assertFinanceAccess(user); const crt=await this.prisma.costRevenueTransaction.findUnique({where:{id},include:{lines:true}}); if(!crt) throw new BadRequestException('CRT not found'); if(crt.requesterId===user.sub) throw new BadRequestException('Requester cannot self-approve CRT'); await this.scope.assertBookingAccess(user,crt.bookingId);
    return this.prisma.$transaction(async tx=>{ for(const l of crt.lines){await tx.financeLine.update({where:{id:l.financeLineId},data:{finalAmount:l.newAmount,status:'APPROVED'}});} const out=await tx.costRevenueTransaction.update({where:{id},data:{status:'APPROVED',approverId:user.sub,approvedAt:new Date()}}); return out; });
  }
}
