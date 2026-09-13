import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const closeoutTemplate=[
  ['OPS_COMPLETE','Operational file complete'],
  ['DOCS_COMPLETE','Required documents complete'],
  ['CONTAINERS_CLOSED','Containers and equipment reconciled'],
  ['REVENUE_FINAL','Revenue finalized'],
  ['COSTS_FINAL','Costs finalized / accrued'],
  ['APPROVALS_CLEAR','Outstanding approvals cleared']
] as const;

@Injectable()
export class OperationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private assertAdmin(user:ScopeUser){if(user.role!=='GLOBAL_ADMIN') throw new ForbiddenException('Global administrator access required');}
  private assertInternal(user:ScopeUser){this.scope.assertInternal(user);}

  async listBranches(user:ScopeUser){this.assertInternal(user);return this.prisma.branch.findMany({orderBy:{code:'asc'}});}
  async createBranch(body:any,user:ScopeUser){
    this.assertAdmin(user);
    if(!body?.code||!body?.name||!body?.countryCode) throw new BadRequestException('Code, name and country code are required');
    return this.prisma.branch.create({data:{code:String(body.code).trim().toUpperCase(),name:String(body.name).trim(),countryCode:String(body.countryCode).trim().toUpperCase(),active:body.active!==false}});
  }

  async listUsers(user:ScopeUser){this.assertAdmin(user);return this.prisma.userAccount.findMany({orderBy:{email:'asc'}});}
  async createUser(body:any,user:ScopeUser){
    this.assertAdmin(user);
    if(!body?.email||!body?.displayName||!body?.role) throw new BadRequestException('Email, display name and role are required');
    return this.prisma.userAccount.create({data:{email:String(body.email).trim().toLowerCase(),displayName:String(body.displayName).trim(),role:String(body.role),branchId:body.branchId||null,agentId:body.agentId||null,customerId:body.customerId||null,active:body.active!==false}});
  }
  async toggleUser(id:string,user:ScopeUser){this.assertAdmin(user);const current=await this.prisma.userAccount.findUnique({where:{id}});if(!current)throw new BadRequestException('User not found');return this.prisma.userAccount.update({where:{id},data:{active:!current.active}});}

  async integrations(user:ScopeUser){this.assertInternal(user);return this.prisma.integrationEvent.findMany({orderBy:{createdAt:'desc'},take:100});}

  async notifications(user:ScopeUser){return this.prisma.notification.findMany({where:{userId:user.sub},orderBy:{createdAt:'desc'},take:100});}
  async markNotificationRead(id:string,user:ScopeUser){const row=await this.prisma.notification.findFirst({where:{id,userId:user.sub}});if(!row)throw new BadRequestException('Notification not found');return this.prisma.notification.update({where:{id},data:{status:'READ',readAt:new Date()}});}
  async markAllRead(user:ScopeUser){return this.prisma.notification.updateMany({where:{userId:user.sub,status:'UNREAD'},data:{status:'READ',readAt:new Date()}});}

  async closeout(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);this.assertInternal(user);
    let rows=await this.prisma.jobCloseoutChecklist.findMany({where:{bookingId},orderBy:{itemCode:'asc'}});
    if(!rows.length){await this.prisma.jobCloseoutChecklist.createMany({data:closeoutTemplate.map(([itemCode,itemLabel])=>({bookingId,itemCode,itemLabel,mandatory:true}))});rows=await this.prisma.jobCloseoutChecklist.findMany({where:{bookingId},orderBy:{itemCode:'asc'}});}
    return rows;
  }
  async toggleCloseout(bookingId:string,itemId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);this.assertInternal(user);
    const item=await this.prisma.jobCloseoutChecklist.findFirst({where:{id:itemId,bookingId}});if(!item)throw new BadRequestException('Checklist item not found');
    const completed=!item.completed;
    const row=await this.prisma.jobCloseoutChecklist.update({where:{id:itemId},data:{completed,completedBy:completed?user.sub:null,completedAt:completed?new Date():null}});
    await this.audit.log({actorId:user.sub,action:completed?'CLOSEOUT_ITEM_COMPLETE':'CLOSEOUT_ITEM_REOPEN',objectType:'JobCloseoutChecklist',objectId:itemId,bookingId,detail:{itemCode:item.itemCode}});
    return row;
  }
  async finalizeCloseout(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);this.assertInternal(user);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId}});if(!booking)throw new BadRequestException('Booking not found');
    const rows=await this.closeout(bookingId,user);const outstanding=rows.filter(x=>x.mandatory&&!x.completed);
    if(outstanding.length) throw new BadRequestException(`${outstanding.length} mandatory closeout item(s) are still outstanding`);
    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{status:'FINANCIALLY_CLOSED'}});
    await this.audit.log({actorId:user.sub,action:'JOB_FINANCIALLY_CLOSED',objectType:'Booking',objectId:bookingId,bookingId,detail:{bookingNo:booking.bookingNo,previousStatus:booking.status}});
    return updated;
  }
}