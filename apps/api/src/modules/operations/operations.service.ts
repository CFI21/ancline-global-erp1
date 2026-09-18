import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { AlertEngineService } from './alert-engine.service';

const closeoutTemplate=[
  ['OPS_COMPLETE','Operational file complete'],
  ['DOCS_COMPLETE','Required documents complete'],
  ['CONTAINERS_CLOSED','Containers and equipment reconciled'],
  ['REVENUE_FINAL','Revenue finalized'],
  ['COSTS_FINAL','Costs finalized / accrued'],
  ['APPROVALS_CLEAR','Outstanding approvals cleared']
] as const;
const USER_ROLES=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER','SHIPPER','CONSIGNEE'] as const;

@Injectable()
export class OperationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService,private alerts:AlertEngineService){}

  private assertAdmin(user:ScopeUser){if(user.role!=='GLOBAL_ADMIN') throw new ForbiddenException('Global administrator access required');}
  private assertInternal(user:ScopeUser){this.scope.assertInternal(user);}

  private async normalizedUser(body:any,current?:any){
    const role=String(body?.role??current?.role??'').trim().toUpperCase();
    if(!USER_ROLES.includes(role as any)) throw new BadRequestException('Unsupported user role');
    const email=String(body?.email??current?.email??'').trim().toLowerCase();
    const displayName=String(body?.displayName??current?.displayName??'').trim();
    if(!email||!displayName) throw new BadRequestException('Email and display name are required');

    let branchId=body?.branchId!==undefined?(body.branchId||null):(current?.branchId||null);
    let agentId=body?.agentId!==undefined?(body.agentId||null):(current?.agentId||null);
    let customerId=body?.customerId!==undefined?(body.customerId||null):(current?.customerId||null);
    let partyId=body?.partyId!==undefined?(body.partyId||null):(current?.partyId||null);

    if(role==='BRANCH_OPS'){
      if(!branchId) throw new BadRequestException('Branch Operations users must be assigned to a branch');
      const branch=await this.prisma.branch.findUnique({where:{id:String(branchId)}});
      if(!branch||!branch.active) throw new BadRequestException('Selected branch is invalid or inactive');
      agentId=null;customerId=null;partyId=null;
    }else if(role==='AGENT'){
      if(!agentId) throw new BadRequestException('Agent users must be assigned to an agent organization');
      const org=await this.prisma.organization.findUnique({where:{id:String(agentId)}});
      if(!org||!org.active||!org.roles.includes('AGENT')) throw new BadRequestException('Selected organization is not an active agent');
      branchId=null;customerId=null;partyId=null;
    }else if(role==='CUSTOMER'){
      if(!customerId) throw new BadRequestException('Customer users must be assigned to a customer organization');
      const org=await this.prisma.organization.findUnique({where:{id:String(customerId)}});
      if(!org||!org.active||!org.roles.includes('CUSTOMER')) throw new BadRequestException('Selected organization is not an active customer');
      branchId=null;agentId=null;partyId=null;
    }else if(role==='SHIPPER'||role==='CONSIGNEE'){
      if(!partyId) throw new BadRequestException(`${role==='SHIPPER'?'Shipper':'Consignee'} users must be assigned to a forwarding party organization`);
      const org=await this.prisma.organization.findUnique({where:{id:String(partyId)}});
      if(!org||!org.active||!org.roles.includes(role as any)) throw new BadRequestException(`Selected organization is not an active ${role.toLowerCase()}`);
      branchId=null;agentId=null;customerId=null;
    }else{
      agentId=null;customerId=null;partyId=null;
      if(role!=='FINANCE') branchId=null;
      if(branchId){
        const branch=await this.prisma.branch.findUnique({where:{id:String(branchId)}});
        if(!branch||!branch.active) throw new BadRequestException('Selected branch is invalid or inactive');
      }
    }

    return {email,displayName,role,branchId,agentId,customerId,partyId,active:body?.active!==undefined?Boolean(body.active):(current?.active??true)};
  }

  async listBranches(user:ScopeUser){this.assertInternal(user);return this.prisma.branch.findMany({orderBy:{code:'asc'}});}
  async createBranch(body:any,user:ScopeUser){
    this.assertAdmin(user);
    if(!body?.code||!body?.name||!body?.countryCode) throw new BadRequestException('Code, name and country code are required');
    const row=await this.prisma.branch.create({data:{code:String(body.code).trim().toUpperCase(),name:String(body.name).trim(),countryCode:String(body.countryCode).trim().toUpperCase(),active:body.active!==false}});
    await this.audit.log({actorId:user.sub,action:'BRANCH_CREATE',objectType:'Branch',objectId:row.id,detail:{code:row.code,name:row.name}});
    return row;
  }

  async listUsers(user:ScopeUser){this.assertAdmin(user);return this.prisma.userAccount.findMany({orderBy:{email:'asc'}});}
  async createUser(body:any,user:ScopeUser){
    this.assertAdmin(user);
    const data=await this.normalizedUser(body);
    const row=await this.prisma.userAccount.create({data});
    await this.audit.log({actorId:user.sub,action:'USER_CREATE',objectType:'UserAccount',objectId:row.id,detail:{email:row.email,role:row.role,branchId:row.branchId,agentId:row.agentId,customerId:row.customerId,partyId:row.partyId}});
    return row;
  }
  async updateUser(id:string,body:any,user:ScopeUser){
    this.assertAdmin(user);
    const current=await this.prisma.userAccount.findUnique({where:{id}});
    if(!current) throw new BadRequestException('User not found');
    const data=await this.normalizedUser(body,current);
    const row=await this.prisma.userAccount.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'USER_UPDATE',objectType:'UserAccount',objectId:id,detail:{email:row.email,role:row.role,branchId:row.branchId,agentId:row.agentId,customerId:row.customerId,partyId:row.partyId,active:row.active}});
    return row;
  }
  async toggleUser(id:string,user:ScopeUser){
    this.assertAdmin(user);
    const current=await this.prisma.userAccount.findUnique({where:{id}});if(!current)throw new BadRequestException('User not found');
    if(current.id===user.sub&&current.active) throw new BadRequestException('You cannot deactivate your own active administrator account');
    const row=await this.prisma.userAccount.update({where:{id},data:{active:!current.active}});
    await this.audit.log({actorId:user.sub,action:row.active?'USER_ACTIVATE':'USER_DEACTIVATE',objectType:'UserAccount',objectId:id,detail:{email:row.email,role:row.role}});
    return row;
  }

  async integrations(user:ScopeUser){this.assertInternal(user);return this.prisma.integrationEvent.findMany({orderBy:{createdAt:'desc'},take:100});}

  async scanNotifications(user:ScopeUser){
    this.assertInternal(user);
    const result=await this.alerts.scan(user);
    await this.audit.log({actorId:user.sub,action:'OPERATIONAL_ALERT_SCAN',objectType:'Notification',objectId:user.sub,detail:result});
    return result;
  }
  async notifications(user:ScopeUser){
    this.assertInternal(user);
    await this.alerts.scan(user);
    return this.prisma.notification.findMany({where:{userId:user.sub},orderBy:{updatedAt:'desc'},take:200});
  }
  async notificationSummary(user:ScopeUser){
    this.assertInternal(user);
    const rows=await this.prisma.notification.findMany({where:{userId:user.sub,status:{not:'RESOLVED'}},select:{status:true,category:true}});
    return {
      active:rows.length,
      unread:rows.filter(x=>x.status==='UNREAD').length,
      critical:rows.filter(x=>String(x.category).startsWith('CRITICAL')).length,
      warning:rows.filter(x=>String(x.category).startsWith('WARNING')).length,
      info:rows.filter(x=>String(x.category).startsWith('INFO')).length
    };
  }
  async markNotificationRead(id:string,user:ScopeUser){const row=await this.prisma.notification.findFirst({where:{id,userId:user.sub}});if(!row)throw new BadRequestException('Notification not found');if(row.status==='RESOLVED')return row;return this.prisma.notification.update({where:{id},data:{status:'READ',readAt:new Date()}});}
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
