import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { createHash } from 'crypto';
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
const ACCESS_RIGHTS=[
  'NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS','CARRIER_SPACE_CONTROL',
  'FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS','FORWARDING_DIRECT_COLOAD_CROSS_TRADE',
  'KYC_APPROVAL','RATE_PROVIDER_ADMIN','JOB_MODEL_CONVERT','FINANCE',
  'GL_VIEW','GL_CREATE','GL_EDIT','GL_DISABLE','GL_POST','JOURNAL_CREATE','JOURNAL_APPROVE',
  'PERIOD_CLOSE','ACCOUNT_MAPPING_MANAGE','COST_PROFIT_CENTER_MANAGE','TAX_CURRENCY_MANAGE','FINANCE_CONFIG_ADMIN'
] as const;
const ROLE_DEFAULTS:Record<string,string[]>={
  GLOBAL_ADMIN:[...ACCESS_RIGHTS],
  CONTROL_TOWER:['CARRIER_SPACE_CONTROL'],
  BRANCH_OPS:['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS','CARRIER_SPACE_CONTROL'],
  FINANCE:['FINANCE'],
  AGENT:['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS'],
  CUSTOMER:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],
  SHIPPER:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],
  CONSIGNEE:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS']
};

@Injectable()
export class OperationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService,private alerts:AlertEngineService){}

  private assertAdmin(user:ScopeUser){if(user.role!=='GLOBAL_ADMIN') throw new ForbiddenException('Global administrator access required');}
  private assertInternal(user:ScopeUser){this.scope.assertInternal(user);}
  private get db():any{return this.prisma as any;}
  private commId(prefix:string,key:string){return prefix+'_'+createHash('sha256').update(key).digest('hex').slice(0,32);}
  private eventPayload(row:any){return row?.payload&&typeof row.payload==='object'?row.payload:{};}
  private commActionHref(kind:string,bookingId?:string|null){
    if(kind==='FAILED_INTEGRATION')return '/connectivity';
    if(kind==='DOCUMENT_BLOCK')return bookingId?'/documents?bookingId='+encodeURIComponent(bookingId):'/documents';
    if(kind==='PAYMENT_RELEASE_BLOCK')return bookingId?'/carrier-payment?bookingId='+encodeURIComponent(bookingId):'/carrier-payment';
    if(kind==='MILESTONE')return bookingId?'/tracking?bookingId='+encodeURIComponent(bookingId):'/tracking';
    if(kind==='ACTION_QUEUE')return bookingId?'/exceptions?bookingId='+encodeURIComponent(bookingId):'/exceptions';
    return bookingId?'/bookings/'+encodeURIComponent(bookingId):'/notifications';
  }

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
    let costCenterCode=String(body?.costCenterCode??current?.costCenterCode??'').trim().toUpperCase()||null;
    let agentMode=String(body?.agentMode??current?.agentMode??(role==='AGENT'?'LINER_AGENCY_ONLY':'')).trim().toUpperCase()||null;
    const requestedPermissions:any[]=Array.isArray(body?.permissions)?body.permissions:(Array.isArray(current?.permissions)?current.permissions:(ROLE_DEFAULTS[role]||[]));
    let permissions:string[]=[...new Set<string>(requestedPermissions.map((x:any)=>String(x).trim().toUpperCase()).filter((x:string)=>Boolean(x)))];
    const invalid=permissions.filter((x:string)=>!ACCESS_RIGHTS.includes(x as any));if(invalid.length)throw new BadRequestException(`Unsupported access right(s): ${invalid.join(', ')}`);
    if(role==='GLOBAL_ADMIN')permissions=[...ACCESS_RIGHTS];
    if(role==='AGENT')agentMode='LINER_AGENCY_ONLY';

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
      if(permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE')&&!costCenterCode)throw new BadRequestException('Agent Forwarding direct co-load / cross-trade access requires a cost center');
    }else if(role==='CUSTOMER'){
      if(!customerId) throw new BadRequestException('Customer users must be assigned to a customer organization');
      const org=await this.prisma.organization.findUnique({where:{id:String(customerId)}});
      if(!org||!org.active||!org.roles.includes('CUSTOMER')||org.kycStatus!=='APPROVED'||!org.customerRef) throw new BadRequestException('Selected customer must have approved KYC and an ANC customer reference');
      branchId=null;agentId=null;partyId=null;costCenterCode=costCenterCode||org.costCenterCode||null;
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

    return {email,displayName,role,branchId,agentId,customerId,partyId,costCenterCode,agentMode,permissions,active:body?.active!==undefined?Boolean(body.active):(current?.active??true)};
  }

  accessCatalog(user:ScopeUser){this.assertAdmin(user);return {rights:[...ACCESS_RIGHTS],roleDefaults:ROLE_DEFAULTS,agentModes:['LINER_AGENCY_ONLY']};}
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
    await this.audit.log({actorId:user.sub,action:'USER_CREATE',objectType:'UserAccount',objectId:row.id,detail:{email:row.email,role:row.role,branchId:row.branchId,agentId:row.agentId,customerId:row.customerId,partyId:row.partyId,costCenterCode:row.costCenterCode,agentMode:row.agentMode,permissions:row.permissions}});
    return row;
  }
  async updateUser(id:string,body:any,user:ScopeUser){
    this.assertAdmin(user);
    const current=await this.prisma.userAccount.findUnique({where:{id}});
    if(!current) throw new BadRequestException('User not found');
    const data=await this.normalizedUser(body,current);
    const row=await this.prisma.userAccount.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'USER_UPDATE',objectType:'UserAccount',objectId:id,detail:{email:row.email,role:row.role,branchId:row.branchId,agentId:row.agentId,customerId:row.customerId,partyId:row.partyId,costCenterCode:row.costCenterCode,agentMode:row.agentMode,permissions:row.permissions,active:row.active}});
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

  private async latestCommunicationPreference(user:ScopeUser){
    const ids=[String(user.sub),String(user.role)];
    const rows:any[]=await this.db.integrationEvent.findMany({
      where:{sourceSystem:'ANCLINE_GOVERNANCE',objectType:'NotificationPreference',objectId:{in:ids},status:'COMPLETED'},
      orderBy:{createdAt:'desc'},take:20
    });
    const userRow=rows.find(x=>String(x.objectId)===String(user.sub));
    const roleRow=rows.find(x=>String(x.objectId)===String(user.role));
    const defaults={channels:['IN_APP'],severities:['CRITICAL','WARNING','INFO'],categories:[],muteOptional:false};
    return {...defaults,...this.eventPayload(roleRow),...this.eventPayload(userRow),mandatoryCritical:true};
  }

  async communicationPreferences(user:ScopeUser){
    this.assertInternal(user);
    return this.latestCommunicationPreference(user);
  }

  async updateCommunicationPreferences(body:any,user:ScopeUser){
    this.assertInternal(user);
    const allowedChannels=['IN_APP'];
    const allowedSeverities=['CRITICAL','WARNING','INFO'];
    const channels=(Array.isArray(body?.channels)?body.channels:['IN_APP']).map((x:any)=>String(x).toUpperCase()).filter((x:string)=>allowedChannels.includes(x));
    const severities=(Array.isArray(body?.severities)?body.severities:allowedSeverities).map((x:any)=>String(x).toUpperCase()).filter((x:string)=>allowedSeverities.includes(x));
    const categories=Array.isArray(body?.categories)?[...new Set(body.categories.map((x:any)=>String(x).trim().toUpperCase()).filter(Boolean))]:[];
    const payload={channels:channels.length?channels:['IN_APP'],severities:[...new Set(['CRITICAL',...severities])],categories,muteOptional:Boolean(body?.muteOptional),mandatoryCritical:true,updatedBy:user.sub,updatedAt:new Date().toISOString()};
    const id=this.commId('pref',String(user.sub));
    const existing=await this.db.integrationEvent.findUnique({where:{id}});
    if(existing)await this.db.integrationEvent.update({where:{id},data:{status:'COMPLETED',payload,completedAt:new Date()}});
    else await this.db.integrationEvent.create({data:{id,sourceSystem:'ANCLINE_GOVERNANCE',eventType:'NOTIFICATION_PREFERENCE_UPDATED',objectType:'NotificationPreference',objectId:String(user.sub),status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'NOTIFICATION_PREFERENCE_UPDATE',objectType:'NotificationPreference',objectId:String(user.sub),detail:payload});
    return payload;
  }

  async acknowledgeCommunication(itemId:string,user:ScopeUser){
    this.assertInternal(user);
    const feed=await this.communicationCenter(user);
    const item=(feed.items||[]).find((x:any)=>String(x.id)===String(itemId));
    if(!item)throw new BadRequestException('Communication item not found');
    const id=this.commId('ack',String(user.sub)+':'+String(itemId));
    const payload={itemId:String(itemId),bookingId:item.bookingId||null,source:item.source,kind:item.kind,acknowledgedBy:user.sub,acknowledgedAt:new Date().toISOString()};
    const existing=await this.db.integrationEvent.findUnique({where:{id}});
    if(existing)await this.db.integrationEvent.update({where:{id},data:{status:'COMPLETED',payload,completedAt:new Date()}});
    else await this.db.integrationEvent.create({data:{id,sourceSystem:'ANCLINE_COMMUNICATION',eventType:'COMMUNICATION_ACKNOWLEDGED',objectType:'CommunicationAcknowledgement',objectId:String(user.sub)+':'+String(itemId),status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'COMMUNICATION_ACKNOWLEDGE',objectType:'CommunicationItem',objectId:String(itemId),bookingId:item.bookingId||undefined,detail:payload});
    return payload;
  }

  async communicationCenter(user:ScopeUser){
    this.assertInternal(user);
    await this.alerts.scan(user);
    const scope:any=bookingScope(user);
    const bookings:any[]=await this.db.booking.findMany({where:scope,select:{id:true,bookingNo:true,owningBranchId:true}});
    const bookingIds=new Set(bookings.map(x=>String(x.id)));
    const bookingMap=new Map(bookings.map(x=>[String(x.id),x]));
    const globalInternal=['GLOBAL_ADMIN','CONTROL_TOWER'].includes(user.role);
    const [notes,events,audits,acks,prefs]=await Promise.all([
      this.db.notification.findMany({where:{userId:user.sub},orderBy:{updatedAt:'desc'},take:300}),
      this.db.integrationEvent.findMany({orderBy:{createdAt:'desc'},take:600}),
      this.db.auditEvent.findMany({where:bookingIds.size?{bookingId:{in:[...bookingIds]}}:{bookingId:null},orderBy:{createdAt:'desc'},take:400}),
      this.db.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_COMMUNICATION',objectType:'CommunicationAcknowledgement',status:'COMPLETED'},orderBy:{createdAt:'desc'},take:400}),
      this.latestCommunicationPreference(user)
    ]);
    const ackSet=new Set(acks.filter((x:any)=>String(this.eventPayload(x).acknowledgedBy)===String(user.sub)).map((x:any)=>String(this.eventPayload(x).itemId)));
    const items:any[]=[];
    const push=(item:any)=>{
      if(item.bookingId&&!bookingIds.has(String(item.bookingId)))return;
      if(user.role==='FINANCE'&&!['FINANCE','PAYMENT_RELEASE_BLOCK','FAILED_INTEGRATION','SLA_ESCALATION'].includes(item.kind))return;
      const severity=String(item.severity||'INFO').toUpperCase();
      const category=String(item.category||item.kind||'GENERAL').toUpperCase();
      const mandatory=severity==='CRITICAL'||String(item.escalationLevel||'').toUpperCase()==='LEVEL_3';
      if(!mandatory){
        if(prefs.muteOptional)return;
        if(Array.isArray(prefs.severities)&&!prefs.severities.includes(severity))return;
        if(Array.isArray(prefs.categories)&&prefs.categories.length&&!prefs.categories.includes(category))return;
      }
      items.push({...item,severity,category,acknowledged:ackSet.has(String(item.id)),mandatory});
    };

    for(const n of notes){
      const match=String(n.message||'').match(/\[booking:([^\]]+)\]/);
      const bid=match?.[1]||null;
      const sev=String(n.category||'').split('·')[0].trim().toUpperCase()||'INFO';
      const cat=String(n.category||'').split('·')[1]?.trim().toUpperCase()||'OPERATIONAL_RISK';
      push({id:'note:'+n.id,source:'OPERATIONAL_RISK',kind:cat==='FINANCE'?'FINANCE':cat==='DOCUMENT'?'DOCUMENT_BLOCK':cat==='MILESTONE'?'MILESTONE':'OPERATIONAL_RISK',severity:sev,category:cat,title:n.title,message:String(n.message||'').replace(/\s*\[booking:[^\]]+\]\s*$/,''),bookingId:bid,status:n.status,readAt:n.readAt,updatedAt:n.updatedAt||n.createdAt,actionHref:this.commActionHref(cat==='FINANCE'?'PAYMENT_RELEASE_BLOCK':cat==='DOCUMENT'?'DOCUMENT_BLOCK':cat==='MILESTONE'?'MILESTONE':'OPERATIONAL_RISK',bid)});
    }

    for(const e of events){
      const p=this.eventPayload(e); const bid=p.bookingId?String(p.bookingId):null;
      if(bid&&!bookingIds.has(bid))continue;
      if(!bid&&!globalInternal)continue;
      if(e.sourceSystem==='ANCLINE_ORCHESTRATION'&&e.objectType==='AutomationNotification'&&e.status==='COMPLETED'){
        push({id:'auto:'+e.id,source:'SLA_AUTOMATION',kind:'SLA_ESCALATION',severity:p.severity||'INFO',category:'SLA_ESCALATION',title:p.title||'SLA escalation',message:p.message||'',bookingId:bid,escalationLevel:p.level||null,status:p.status||'OPEN',updatedAt:e.createdAt,actionHref:this.commActionHref('ACTION_QUEUE',bid)});
      }else if(['FAILED','RETRY_PENDING'].includes(String(e.status))&&e.sourceSystem!=='ANCLINE_ORCHESTRATION'){
        push({id:'integration:'+e.id,source:'INTEGRATION',kind:'FAILED_INTEGRATION',severity:String(e.status)==='FAILED'?'CRITICAL':'WARNING',category:'FAILED_INTEGRATION',title:(e.sourceSystem||'Integration')+' · '+(e.eventType||'Event'),message:e.errorMessage||p.errorMessage||p.error||p.message||String(e.status),bookingId:bid,status:String(e.status),updatedAt:e.updatedAt||e.createdAt,actionHref:this.commActionHref('FAILED_INTEGRATION',bid)});
      }
    }

    const auditActions=new Set(['OPERATIONS_CONTROL_CLAIM','TASK_ACTION_QUEUE_UPDATE','TASK_SLA_AUTOMATION']);
    for(const a of audits){
      if(!auditActions.has(String(a.action)))continue;
      const d:any=a.detail&&typeof a.detail==='object'?a.detail:{};
      const kind=String(a.action)==='TASK_SLA_AUTOMATION'?'SLA_ESCALATION':'ACTION_QUEUE';
      const level=d.level||d.after?.slaState||null;
      push({id:'audit:'+a.id,source:'AUDIT',kind,severity:String(level).toUpperCase()==='LEVEL_3'?'CRITICAL':String(level).toUpperCase()==='LEVEL_2'?'WARNING':'INFO',category:kind,title:String(a.action).replaceAll('_',' '),message:d.after?JSON.stringify(d.after):d.level?('Escalation '+d.level):'Operational action recorded',bookingId:a.bookingId||null,escalationLevel:d.level||null,status:'RECORDED',updatedAt:a.createdAt,actionHref:this.commActionHref('ACTION_QUEUE',a.bookingId)});
    }

    const rank:any={CRITICAL:0,WARNING:1,INFO:2};
    const dedup=new Map<string,any>();
    for(const item of items){
      const key=[item.bookingId||'-',item.kind,item.source,item.title,item.message].join('|');
      if(!dedup.has(key))dedup.set(key,item);
    }
    const out=[...dedup.values()].sort((a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||new Date(b.updatedAt||0).getTime()-new Date(a.updatedAt||0).getTime());
    return {
      generatedAt:new Date().toISOString(),
      summary:{total:out.length,unread:out.filter(x=>x.status==='UNREAD').length,acknowledged:out.filter(x=>x.acknowledged).length,critical:out.filter(x=>x.severity==='CRITICAL').length,level3:out.filter(x=>x.escalationLevel==='LEVEL_3').length},
      preferences:prefs,
      items:out.slice(0,400)
    };
  }

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
  private async financeCloseBlockers(bookingId:string){
    const [lines,tasks,approvals,events]=await Promise.all([
      this.prisma.financeLine.findMany({where:{bookingId,status:{not:'CANCELLED'}}}),
      this.prisma.task.findMany({where:{bookingId,status:{not:'Completed'}}}),
      this.prisma.approval.findMany({where:{bookingId,status:'Pending'}}),
      this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}})
    ]);
    const blockers:any[]=[];
    if(!lines.some(x=>x.type==='REVENUE'))blockers.push({code:'MISSING_REVENUE',message:'No active revenue finance line exists.'});
    if(!lines.some(x=>x.type==='COST'))blockers.push({code:'MISSING_COST',message:'No active cost finance line exists.'});
    const openLines=lines.filter(x=>!['FINAL','CLEARED','PAID'].includes(String(x.status)));
    if(openLines.length)blockers.push({code:'FINANCE_LINES_OPEN',message:`${openLines.length} finance line(s) are not FINAL/CLEARED/PAID.`});
    if(tasks.length)blockers.push({code:'OPEN_TASKS',message:`${tasks.length} operational task(s) remain open.`});
    if(approvals.length)blockers.push({code:'PENDING_APPROVALS',message:`${approvals.length} approval(s) remain pending.`});
    const groups=new Map<string,any[]>();
    for(const e of events){if(!groups.has(e.objectId))groups.set(e.objectId,[]);groups.get(e.objectId)!.push(e);}
    for(const [invoiceNo,rows] of groups){
      const created=rows.find((e:any)=>e.eventType==='INVOICE_CREATED');if(!created||String((created.payload as any)?.bookingId||'')!==bookingId)continue;
      const base:any=created.payload||{};const total=Number(base.totalAmount||0);
      const paid=rows.filter((e:any)=>e.eventType==='PAYMENT_RECORDED').reduce((s:number,e:any)=>s+Number((e.payload as any)?.amount||0),0);
      const controls=rows.filter((e:any)=>['INVOICE_DISPUTED','INVOICE_RESOLVED','INVOICE_VOIDED'].includes(e.eventType));
      const last=controls[controls.length-1]?.eventType||'';
      if(last==='INVOICE_VOIDED')continue;
      if(last==='INVOICE_DISPUTED'){blockers.push({code:'DISPUTED_INVOICE',invoiceNo,message:`Invoice ${invoiceNo} is disputed.`});continue;}
      const issued=rows.some((e:any)=>e.eventType==='INVOICE_ISSUED');
      if(!issued){blockers.push({code:'DRAFT_INVOICE',invoiceNo,message:`Invoice ${invoiceNo} is still DRAFT.`});continue;}
      const balance=Math.round((Math.max(0,total-paid)+Number.EPSILON)*100)/100;
      if(balance>0.005)blockers.push({code:'OUTSTANDING_INVOICE_BALANCE',invoiceNo,message:`Invoice ${invoiceNo} has outstanding balance ${balance.toFixed(2)} ${String(base.currency||'')}.`});
    }
    return blockers;
  }

  async closeoutReadiness(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);this.assertInternal(user);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId}});if(!booking)throw new BadRequestException('Booking not found');
    const checklist=await this.closeout(bookingId,user);
    const checklistOutstanding=checklist.filter(x=>x.mandatory&&!x.completed);
    const financeBlockers=await this.financeCloseBlockers(bookingId);
    if(String(booking.status)!=='COMPLETED'&&String(booking.status)!=='FINANCIALLY_CLOSED')financeBlockers.unshift({code:'OPERATIONS_NOT_COMPLETE',message:'Operational job must be COMPLETED before financial close.'});
    return {bookingId,bookingNo:booking.bookingNo,status:booking.status,ready:checklistOutstanding.length===0&&financeBlockers.length===0,checklistOutstanding:checklistOutstanding.map(x=>({id:x.id,itemCode:x.itemCode,itemLabel:x.itemLabel})),financeBlockers};
  }

  async finalizeCloseout(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);this.assertInternal(user);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId}});if(!booking)throw new BadRequestException('Booking not found');
    const readiness=await this.closeoutReadiness(bookingId,user);
    if(!readiness.ready){
      const reasons=[...readiness.checklistOutstanding.map((x:any)=>x.itemCode),...readiness.financeBlockers.map((x:any)=>x.code)];
      throw new BadRequestException(`Financial close blocked: ${reasons.join(', ')}`);
    }
    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{status:'FINANCIALLY_CLOSED'}});
    await this.audit.log({actorId:user.sub,action:'JOB_FINANCIALLY_CLOSED',objectType:'Booking',objectId:bookingId,bookingId,detail:{bookingNo:booking.bookingNo,previousStatus:booking.status,reconciliation:'CLEAR'}});
    return updated;
  }
}
