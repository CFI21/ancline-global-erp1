import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_ORCHESTRATION';
const GOVERNANCE='ANCLINE_GOVERNANCE';

@Injectable()
export class WorkflowAutomationService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;}
  private deterministicId(prefix:string,key:string){return `${prefix}_${createHash('sha256').update(key).digest('hex')}`;}
  private uniqueError(e:any){return String(e?.code||'')==='P2002';}
  private sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
  private payload(e:any){return (e?.payload||{}) as any;}
  private latest(rows:any[],objectType:string){const m=new Map<string,any>();for(const e of rows.filter((x:any)=>x.objectType===objectType))m.set(e.objectId,{...this.payload(e),objectId:e.objectId,eventType:e.eventType,updatedAt:e.createdAt});return [...m.values()];}
  private async ownEvents(){return this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE},orderBy:{createdAt:'asc'}});}
  private async governanceEvents(){return this.db.integrationEvent.findMany({where:{sourceSystem:GOVERNANCE},orderBy:{createdAt:'asc'}});}
  private automationClaimId(key:string){return 'aidem_'+createHash('sha256').update('ANCLINE_AUTOMATION:'+key).digest('hex').slice(0,24);}
  private async resolvedClaim(id:string){
    for(let i=0;i<80;i++){
      const row=await this.db.integrationEvent.findUnique({where:{id}});
      if(row?.status==='COMPLETED'||row?.status==='FAILED')return row;
      await new Promise(r=>setTimeout(r,50));
    }
    return this.db.integrationEvent.findUnique({where:{id}});
  }
  private config(notes:any){if(!notes||typeof notes!=='string')return {};try{const x=JSON.parse(notes);return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {};}}
  private valueAt(context:any,path:any){if(!path)return undefined;return String(path).split('.').reduce((v:any,k:string)=>v==null?undefined:v[k],context);}
  private condition(rule:any,context:any){if(!rule.conditionField)return true;const actual=this.valueAt(context,rule.conditionField);const expected=rule.conditionValue;switch(String(rule.operator||'EQUALS').toUpperCase()){
    case 'EQUALS': return String(actual??'')===String(expected??'');
    case 'NOT_EQUALS': return String(actual??'')!==String(expected??'');
    case 'GT': return Number(actual)>Number(expected);
    case 'GTE': return Number(actual)>=Number(expected);
    case 'LT': return Number(actual)<Number(expected);
    case 'LTE': return Number(actual)<=Number(expected);
    case 'CONTAINS': return String(actual??'').toLowerCase().includes(String(expected??'').toLowerCase());
    case 'IN': {const list=Array.isArray(expected)?expected:String(expected??'').split(',').map(x=>x.trim());return list.map(String).includes(String(actual));}
    case 'EXISTS': return actual!==undefined&&actual!==null&&actual!=='';
    default:return false;
  }}
  private async write(objectType:string,eventType:string,objectId:string,payload:any,user:ScopeUser){const row=await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,objectType,objectId,eventType,status:'COMPLETED',payload:{...payload,updatedBy:user.sub},completedAt:new Date()}});await this.audit.log({actorId:user.sub,action:eventType,objectType,objectId,bookingId:payload.bookingId||undefined,detail:payload});return row.payload;}
  private async rules(){const rows=await this.governanceEvents();return {workflows:this.latest(rows,'WorkflowRule').filter((x:any)=>x.active!==false),notifications:this.latest(rows,'NotificationRule').filter((x:any)=>x.active!==false)};}
  private match(workflows:any[],body:any){const process=String(body.process||'').toUpperCase(),trigger=String(body.trigger||body.eventType||'').toUpperCase(),context=body.context||{};return workflows.filter((r:any)=>(!process||r.process===process)&&r.trigger===trigger&&this.condition(r,context));}

  async dashboard(user:ScopeUser){this.scope.assertInternal(user);const [own,gov,tasks,approvals]=await Promise.all([this.ownEvents(),this.governanceEvents(),this.db.task.findMany({orderBy:{createdAt:'desc'},take:100}),this.db.approval.findMany({orderBy:{createdAt:'desc'},take:100})]);const workflows=this.latest(gov,'WorkflowRule').filter((x:any)=>x.active!==false),notificationRules=this.latest(gov,'NotificationRule').filter((x:any)=>x.active!==false),runs=this.latest(own,'AutomationRun').slice().reverse(),timers=this.latest(own,'EscalationTimer').slice().reverse(),notifications=this.latest(own,'AutomationNotification').slice().reverse();const now=Date.now();const pending=timers.filter((x:any)=>x.status==='PENDING');return {summary:{activeRules:workflows.length,executions:runs.length,executionsWithErrors:runs.filter((x:any)=>Number(x.errorCount||0)>0).length,pendingTimers:pending.length,dueTimers:pending.filter((x:any)=>new Date(x.dueAt).getTime()<=now).length,automationNotifications:notifications.length,pendingApprovals:approvals.filter((x:any)=>x.status==='Pending').length,openTasks:tasks.filter((x:any)=>x.status!=='Completed').length},workflows,notificationRules,runs:runs.slice(0,100),timers:timers.slice(0,100),notifications:notifications.slice(0,100),tasks:tasks.slice(0,30),approvals:approvals.slice(0,30)};}

  async preview(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.trigger&&!body?.eventType)throw new BadRequestException('Trigger is required');if(body.bookingId)await this.scope.assertBookingAccess(user,String(body.bookingId));const {workflows,notifications}=await this.rules();const matched=this.match(workflows,body);const trigger=String(body.trigger||body.eventType).toUpperCase();return {process:String(body.process||'').toUpperCase()||null,trigger,matchedRules:matched,notificationRules:notifications.filter((x:any)=>x.eventType===trigger),wouldExecute:matched.map((x:any)=>({workflowId:x.workflowId,action:x.action,ownerRole:x.ownerRole||null,escalateAfterMinutes:x.escalateAfterMinutes??null,config:this.config(x.notes)}))};}

  private async notify(trigger:string,body:any,rule:any,user:ScopeUser,extra:any={}){const id=this.id('NTF');const cfg=this.config(rule?.notes);const payload={notificationId:id,eventType:trigger,severity:String(rule?.severity||cfg.severity||'INFO').toUpperCase(),channels:rule?.channels||['IN_APP'],recipients:rule?.recipients||[],title:cfg.title||`${body.process||'Workflow'} · ${trigger}`,message:cfg.message||body.message||`Automation event ${trigger} processed`,bookingId:body.bookingId||null,objectType:body.objectType||null,objectId:body.objectId||null,createdAt:new Date().toISOString(),status:'OPEN',...extra};await this.write('AutomationNotification','AUTOMATION_NOTIFICATION_CREATED',id,payload,user);return payload;}

  private async executeRule(rule:any,body:any,user:ScopeUser){const action=String(rule.action||'').toUpperCase(),cfg=this.config(rule.notes),bookingId=body.bookingId?String(body.bookingId):null;let result:any;
    if(action==='CREATE_TASK'){
      const task=await this.db.task.create({data:{bookingId,title:String(cfg.title||`${body.process||'Workflow'}: ${body.trigger||body.eventType}`),ownerId:cfg.ownerId||rule.ownerRole||null,dueAt:cfg.dueMinutes!=null?new Date(Date.now()+Number(cfg.dueMinutes)*60000):null,status:'Open',slaState:'On Track'}});result={type:'Task',id:task.id,status:task.status};
    }else if(action==='REQUEST_APPROVAL'){
      const requesterId=user.email||user.sub,approverId=String(cfg.approverId||rule.ownerRole||'Operations Manager');if(String(requesterId).toLowerCase()===approverId.toLowerCase())throw new BadRequestException('Automation maker/checker control: requester and approver must differ');const approval=await this.db.approval.create({data:{bookingId,type:String(cfg.type||body.process||'AUTOMATION'),requesterId,approverId,status:'Pending',reason:cfg.reason||`Triggered by ${body.trigger||body.eventType}`}});result={type:'Approval',id:approval.id,status:approval.status};
    }else if(action==='NOTIFY'){
      const n=await this.notify(String(body.trigger||body.eventType).toUpperCase(),body,{...cfg,severity:cfg.severity||'INFO',channels:cfg.channels||['IN_APP'],recipients:cfg.recipients||[]},user,{workflowId:rule.workflowId});result={type:'Notification',id:n.notificationId,status:n.status};
    }else if(action==='QUEUE_INTEGRATION'){
      const targetSource=String(cfg.sourceSystem||body.context?.sourceSystem||'').toUpperCase(),targetType=String(cfg.eventType||body.context?.eventType||'').toUpperCase();if(!targetSource||!targetType)throw new BadRequestException('QUEUE_INTEGRATION requires sourceSystem and eventType in rule notes JSON or trigger context');const externalId=cfg.externalId||body.idempotencyKey||this.id('AUTO');const evt=await this.db.integrationEvent.create({data:{sourceSystem:targetSource,eventType:targetType,externalId:String(externalId),objectType:body.objectType||'AutomationHandoff',objectId:body.objectId||bookingId||this.id('OBJ'),status:'RECEIVED',payload:{...(body.context||{}),bookingId,automationWorkflowId:rule.workflowId},attemptCount:0}});result={type:'IntegrationEvent',id:evt.id,status:evt.status,sourceSystem:targetSource,eventType:targetType};
    }else{
      result={type:'Skipped',status:'SKIPPED',reason:`Unsupported action ${action}`};
    }
    if(rule.escalateAfterMinutes!=null&&Number(rule.escalateAfterMinutes)>0){const timerId=this.id('TMR'),dueAt=new Date(Date.now()+Number(rule.escalateAfterMinutes)*60000).toISOString();await this.write('EscalationTimer','ESCALATION_TIMER_CREATED',timerId,{timerId,workflowId:rule.workflowId,process:rule.process,trigger:rule.trigger,bookingId,objectType:body.objectType||null,objectId:body.objectId||null,ownerRole:rule.ownerRole||null,dueAt,status:'PENDING',sourceResult:result},user);result.escalationTimerId=timerId;result.escalationDueAt=dueAt;}
    return result;
  }

  async trigger(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    if(!body?.trigger&&!body?.eventType)throw new BadRequestException('Trigger is required');
    if(body.bookingId)await this.scope.assertBookingAccess(user,String(body.bookingId));
    const idempotencyKey=body.idempotencyKey?String(body.idempotencyKey):null;
    let claimId:string|null=null;
    if(idempotencyKey){
      const own=await this.ownEvents(),prior=this.latest(own,'AutomationRun').find((x:any)=>x.idempotencyKey===idempotencyKey);
      if(prior)return {...prior,duplicate:true};
      claimId=this.automationClaimId(idempotencyKey);
      try{
        await this.db.integrationEvent.create({data:{id:claimId,sourceSystem:SOURCE,eventType:'AUTOMATION_IDEMPOTENCY_CLAIM',externalId:idempotencyKey,objectType:'AutomationIdempotencyClaim',objectId:idempotencyKey,status:'PROCESSING',payload:{idempotencyKey,startedAt:new Date().toISOString()},attemptCount:0}});
      }catch(e:any){
        if(e?.code!=='P2002')throw e;
        const settled=await this.resolvedClaim(claimId),p=this.payload(settled);
        if(settled?.status==='COMPLETED'&&p?.result)return {...p.result,duplicate:true};
        if(settled?.status==='FAILED')throw new BadRequestException('Prior idempotent automation attempt failed; use a new idempotency key');
        return {runId:p?.runId||null,idempotencyKey,status:'IN_PROGRESS',duplicate:true};
      }
    }
    try{
      const {workflows,notifications}=await this.rules(),matched=this.match(workflows,body),trigger=String(body.trigger||body.eventType).toUpperCase(),runId=this.id('RUN');const results:any[]=[],errors:any[]=[];
      for(const rule of matched){try{results.push({workflowId:rule.workflowId,action:rule.action,result:await this.executeRule(rule,{...body,trigger},user)});}catch(e:any){errors.push({workflowId:rule.workflowId,action:rule.action,error:e?.message||'Automation action failed'});}}
      for(const rule of notifications.filter((x:any)=>x.eventType===trigger)){try{const n=await this.notify(trigger,body,rule,user,{ruleId:rule.notificationRuleId});results.push({notificationRuleId:rule.notificationRuleId,action:'NOTIFY',result:{type:'Notification',id:n.notificationId,status:n.status}});}catch(e:any){errors.push({notificationRuleId:rule.notificationRuleId,action:'NOTIFY',error:e?.message||'Notification creation failed'});}}
      const payload={runId,idempotencyKey,process:String(body.process||'').toUpperCase()||null,trigger,bookingId:body.bookingId||null,objectType:body.objectType||null,objectId:body.objectId||null,context:body.context||{},matchedRuleCount:matched.length,resultCount:results.length,errorCount:errors.length,results,errors,executedBy:user.email||user.sub,executedAt:new Date().toISOString(),status:errors.length?'COMPLETED_WITH_ERRORS':'COMPLETED'};
      await this.write('AutomationRun','AUTOMATION_RUN_COMPLETED',runId,payload,user);
      if(claimId)await this.db.integrationEvent.update({where:{id:claimId},data:{status:'COMPLETED',completedAt:new Date(),payload:{idempotencyKey,runId,result:payload,completedAt:new Date().toISOString()}}});
      return payload;
    }catch(e:any){
      if(claimId)await this.db.integrationEvent.update({where:{id:claimId},data:{status:'FAILED',payload:{idempotencyKey,error:e?.message||'Automation failed',failedAt:new Date().toISOString()}}}).catch(()=>undefined);
      throw e;
    }
  }

  async runDue(user:ScopeUser){this.scope.assertInternal(user);const rows=await this.ownEvents(),timers=this.latest(rows,'EscalationTimer').filter((x:any)=>x.status==='PENDING'&&new Date(x.dueAt).getTime()<=Date.now());const results:any[]=[];for(const timer of timers){try{if(timer.bookingId)await this.scope.assertBookingAccess(user,String(timer.bookingId));const task=await this.db.task.create({data:{bookingId:timer.bookingId||null,title:`Escalation: ${timer.process} · ${timer.trigger}`,ownerId:timer.ownerRole||'Operations Manager',dueAt:new Date(),status:'Open',slaState:'Breached'}});await this.notify('WORKFLOW_ESCALATION',{process:timer.process,bookingId:timer.bookingId,objectType:timer.objectType,objectId:timer.objectId,message:`Workflow escalation due for ${timer.trigger}`},{severity:'WARNING',channels:['IN_APP'],recipients:timer.ownerRole?[timer.ownerRole]:[]},user,{timerId:timer.timerId,taskId:task.id});await this.write('EscalationTimer','ESCALATION_TIMER_EXECUTED',timer.timerId,{...timer,status:'EXECUTED',executedAt:new Date().toISOString(),taskId:task.id},user);results.push({timerId:timer.timerId,status:'EXECUTED',taskId:task.id});}catch(e:any){results.push({timerId:timer.timerId,status:'FAILED',error:e?.message||'Escalation failed'});}}return {due:timers.length,executed:results.filter(x=>x.status==='EXECUTED').length,failed:results.filter(x=>x.status==='FAILED').length,results};}
}
