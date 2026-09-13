import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
@Injectable()
export class GovernanceService {
  constructor(private p:PrismaService,private audit:AuditService){}
  private assertInternal(u:any){if(!['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE'].includes(u?.role)) throw new ForbiddenException('Internal access required')}
  private assertAdmin(u:any){if(u?.role!=='GLOBAL_ADMIN') throw new ForbiddenException('Global Admin required')}
  async dashboard(u:any){this.assertInternal(u); const [bookings,orgs,rates,tasks,approvals,finance,exceptions]=await Promise.all([
    this.p.booking.count(),this.p.organization.count(),this.p.rateQuote.count(),this.p.task.count({where:{status:{not:'COMPLETED'}}}),this.p.approval.count({where:{status:'PENDING'}}),this.p.financeLine.count(),this.p.operationalException.count({where:{status:{not:'RESOLVED'}}})
  ]); return {bookings,organizations:orgs,rates,openTasks:tasks,pendingApprovals:approvals,financeLines:finance,openExceptions:exceptions};}
  async reports(u:any){this.assertInternal(u); const [byStatus,byBranch,finance]=await Promise.all([
    this.p.booking.groupBy({by:['status'],_count:{_all:true}}),
    this.p.booking.groupBy({by:['owningBranchId'],_count:{_all:true}}),
    this.p.financeLine.groupBy({by:['type','currency'],_sum:{amount:true},_count:{_all:true}})
  ]); return {bookingByStatus:byStatus,bookingByBranch:byBranch,financeSummary:finance,generatedAt:new Date().toISOString()};}
  async createSnapshot(b:any,u:any){this.assertInternal(u); const payload=await this.reports(u); const r=await this.p.reportSnapshot.create({data:{name:b.name||'Operational Snapshot',reportType:b.reportType||'CONTROL_TOWER',scopeType:b.scopeType||'GLOBAL',scopeId:b.scopeId,payload,createdBy:u.sub||u.userId}}); await this.audit.record({actorId:u.sub||u.userId,action:'REPORT_SNAPSHOT_CREATED',objectType:'ReportSnapshot',objectId:r.id,meta:{name:r.name}}); return r;}
  async masterData(u:any){this.assertInternal(u); const [orgs,branches,changes]=await Promise.all([this.p.organization.findMany({take:100,orderBy:{updatedAt:'desc'}}),this.p.branch.findMany({take:100}),this.p.masterDataChange.findMany({take:100,orderBy:{createdAt:'desc'}})]); return {organizations:orgs,branches,changes};}
  async requestMasterChange(b:any,u:any){this.assertInternal(u); const r=await this.p.masterDataChange.create({data:{entityType:b.entityType,entityId:b.entityId,fieldName:b.fieldName,oldValue:b.oldValue??null,newValue:b.newValue??null,reason:b.reason,requestedBy:u.sub||u.userId,status:'PENDING'}}); await this.audit.record({actorId:u.sub||u.userId,action:'MASTER_DATA_CHANGE_REQUESTED',objectType:b.entityType,objectId:b.entityId,meta:{changeId:r.id,field:b.fieldName}}); return r;}
  async approveMasterChange(id:string,u:any){this.assertAdmin(u); const c=await this.p.masterDataChange.findUnique({where:{id}}); if(!c) return null; if(c.requestedBy===(u.sub||u.userId)) throw new ForbiddenException('Requester cannot self-approve'); const r=await this.p.masterDataChange.update({where:{id},data:{status:'APPROVED',approvedBy:u.sub||u.userId,approvedAt:new Date()}}); await this.audit.record({actorId:u.sub||u.userId,action:'MASTER_DATA_CHANGE_APPROVED',objectType:c.entityType,objectId:c.entityId,meta:{changeId:id}}); return r;}
  async userScopes(u:any){this.assertAdmin(u); return this.p.userScopeAssignment.findMany({take:200,orderBy:{createdAt:'desc'}})}
  async assignScope(b:any,u:any){this.assertAdmin(u); const r=await this.p.userScopeAssignment.create({data:{userId:b.userId,role:b.role,scopeType:b.scopeType,scopeId:b.scopeId,active:b.active!==false,assignedBy:u.sub||u.userId}}); await this.audit.record({actorId:u.sub||u.userId,action:'USER_SCOPE_ASSIGNED',objectType:'UserScopeAssignment',objectId:r.id,meta:{userId:r.userId,role:r.role,scopeType:r.scopeType,scopeId:r.scopeId}}); return r;}
  async auditCenter(u:any){this.assertInternal(u); const [events,changes,scopes]=await Promise.all([this.p.auditEvent.findMany({take:200,orderBy:{createdAt:'desc'}}),this.p.masterDataChange.findMany({take:50,orderBy:{createdAt:'desc'}}),this.p.userScopeAssignment.findMany({take:50,orderBy:{createdAt:'desc'}})]); return {events,masterDataChanges:changes,userScopes:scopes};}
  async releaseControl(u:any){this.assertInternal(u); const [pendingApprovals,openTasks,openExceptions,aiPending]=await Promise.all([this.p.approval.count({where:{status:'PENDING'}}),this.p.task.count({where:{status:{not:'COMPLETED'}}}),this.p.operationalException.count({where:{status:{not:'RESOLVED'}}}),this.p.aIReview.count({where:{status:{notIn:['ACCEPTED','REJECTED']}}})]); return {database:'CONNECTED',api:'LIVE',pendingApprovals,openTasks,openExceptions,aiPending,ready:pendingApprovals===0&&openExceptions===0,checkedAt:new Date().toISOString()};}
}
