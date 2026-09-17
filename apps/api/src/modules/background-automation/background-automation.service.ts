import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeUser } from '../auth/scope';
import { WorkflowAutomationService } from '../workflow-automation/workflow-automation.service';
import { EnterpriseReportingService } from '../enterprise-reporting/enterprise-reporting.service';
import { EnterpriseRiskService } from '../enterprise-risk/enterprise-risk.service';
import { ConnectivityService } from '../connectivity/connectivity.service';
import { DataQualityService } from '../data-quality/data-quality.service';

const SOURCE='ANCLINE_BACKGROUND_AUTOMATION';
const HEARTBEAT_MS=60_000;
const JOBS=[
  {key:'WORKFLOW_ESCALATIONS',cadenceMinutes:5},
  {key:'CONNECTIVITY_RETRY',cadenceMinutes:5},
  {key:'CONNECTIVITY_SLA',cadenceMinutes:10},
  {key:'DATA_QUALITY_SCAN',cadenceMinutes:30},
  {key:'RISK_EXPIRY',cadenceMinutes:60},
  {key:'BI_REPORTS',cadenceMinutes:15},
] as const;

type JobKey=typeof JOBS[number]['key'];

@Injectable()
export class BackgroundAutomationService implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(BackgroundAutomationService.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  private readonly systemUser:ScopeUser={sub:'system:background',email:'background@ancline.system',role:'GLOBAL_ADMIN'};

  constructor(
    private prisma:PrismaService,
    private audit:AuditService,
    private workflow:WorkflowAutomationService,
    private reporting:EnterpriseReportingService,
    private risk:EnterpriseRiskService,
    private connectivity:ConnectivityService,
    private dataQuality:DataQualityService,
  ){}

  onModuleInit(){
    setTimeout(()=>void this.tick(),10_000);
    this.timer=setInterval(()=>void this.tick(),HEARTBEAT_MS);
    this.logger.log('Background scheduler initialized');
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;}
  private payload(e:any){return (e?.payload||{}) as any;}
  private async events(){return this.prisma.integrationEvent.findMany({where:{sourceSystem:SOURCE},orderBy:{createdAt:'asc'}});}
  private latest(rows:any[],objectType:string){const m=new Map<string,any>();for(const e of rows.filter((x:any)=>x.objectType===objectType))m.set(e.objectId,{...this.payload(e),updatedAt:e.createdAt,eventType:e.eventType});return [...m.values()];}
  private async write(objectType:string,eventType:string,objectId:string,payload:any){
    const row=await this.prisma.integrationEvent.create({data:{sourceSystem:SOURCE,eventType,objectType,objectId,status:'COMPLETED',completedAt:new Date(),payload:{...payload,updatedBy:this.systemUser.sub}}});
    await this.audit.log({actorId:this.systemUser.sub,action:eventType,objectType,objectId,detail:payload});
    return row.payload;
  }
  private cadence(job:JobKey){return JOBS.find(x=>x.key===job)!.cadenceMinutes;}
  private async due(job:JobKey,force=false){if(force)return true;const rows=await this.events();const last=this.latest(rows,'BackgroundJobRun').find((x:any)=>x.job===job);if(!last?.completedAt&&!last?.failedAt)return true;const when=new Date(last.completedAt||last.failedAt).getTime();return Date.now()-when>=this.cadence(job)*60_000;}

  async tick(forceJob?:JobKey){
    if(this.running)return {skipped:true,reason:'scheduler already running'};
    this.running=true;
    try{
      const jobs=(forceJob?[forceJob]:JOBS.map(x=>x.key)) as JobKey[];
      const results:any[]=[];
      for(const job of jobs){if(!(await this.due(job,Boolean(forceJob))))continue;results.push(await this.runJob(job));}
      return {ran:results.length,results};
    }finally{this.running=false;}
  }

  private async runJob(job:JobKey){
    const runId=this.id('BGRUN'),startedAt=new Date().toISOString();
    try{
      let result:any;
      if(job==='WORKFLOW_ESCALATIONS')result=await this.workflow.runDue(this.systemUser);
      else if(job==='CONNECTIVITY_RETRY')result=await this.runConnectivityRetry();
      else if(job==='CONNECTIVITY_SLA')result=await this.runConnectivitySla();
      else if(job==='DATA_QUALITY_SCAN')result=await this.runDataQuality();
      else if(job==='RISK_EXPIRY')result=await this.runRiskExpiry();
      else if(job==='BI_REPORTS')result=await this.runScheduledReports();
      else result={skipped:true};
      const completedAt=new Date().toISOString();
      await this.write('BackgroundJobRun','BACKGROUND_JOB_COMPLETED',job,{runId,job,cadenceMinutes:this.cadence(job),startedAt,completedAt,status:'COMPLETED',result});
      return {job,status:'COMPLETED',result};
    }catch(e:any){
      const failedAt=new Date().toISOString(),error=e?.message||'Background job failed';
      await this.write('BackgroundJobRun','BACKGROUND_JOB_FAILED',job,{runId,job,cadenceMinutes:this.cadence(job),startedAt,failedAt,status:'FAILED',error});
      this.logger.error(`${job} failed: ${error}`);
      return {job,status:'FAILED',error};
    }
  }

  private async runConnectivityRetry(){
    const dash:any=await this.connectivity.dashboard(this.systemUser),now=Date.now(),results:any[]=[];
    for(const msg of dash.outbound||[]){
      if(String(msg.status).toUpperCase()!=='FAILED')continue;
      if(msg.nextRetryAt&&new Date(msg.nextRetryAt).getTime()>now)continue;
      try{results.push({messageId:msg.messageId,status:'REQUEUED',result:await this.connectivity.retryOutbound(msg.messageId,this.systemUser)});}catch(e:any){results.push({messageId:msg.messageId,status:'FAILED',error:e?.message||'retry failed'});}
    }
    return {eligible:results.length,requeued:results.filter(x=>x.status==='REQUEUED').length,results};
  }

  private async runConnectivitySla(){
    const dash:any=await this.connectivity.dashboard(this.systemUser),results:any[]=[];
    for(const breach of dash.slaBreaches||[]){
      const key=`BG:SLA:${breach.id}`;
      const run=await this.workflow.trigger({process:'CONNECTIVITY',trigger:'INTEGRATION_SLA_BREACH',objectType:'IntegrationEvent',objectId:breach.id,idempotencyKey:key,context:breach},this.systemUser);
      results.push({id:breach.id,automationRunId:run.runId,duplicate:Boolean(run.duplicate)});
    }
    return {breaches:Number(dash.summary?.slaBreaches||0),triggered:results.filter(x=>!x.duplicate).length,results};
  }

  private async runDataQuality(){
    const scan:any[]=await this.dataQuality.scan(this.systemUser),issues=scan.flatMap((x:any)=>x.issues||[]),blockers=scan.flatMap((x:any)=>x.blockers||[]);
    return {bookingsScanned:scan.length,issues:issues.length,blockers:blockers.length,errors:issues.filter((x:any)=>String(x.severity).toUpperCase()==='ERROR').length,warnings:issues.filter((x:any)=>String(x.severity).toUpperCase()==='WARN').length};
  }

  private async runRiskExpiry(){
    const dash:any=await this.risk.dashboard(this.systemUser),results:any[]=[],day=new Date().toISOString().slice(0,10);
    for(const item of dash.expiry||[]){
      const ref=String(item.reference||item.owner||item.type),key=`BG:RISK:${item.type}:${ref}:${day}`;
      const run=await this.workflow.trigger({process:'ENTERPRISE_RISK',trigger:'COMPLIANCE_EXPIRY_DUE',objectType:String(item.type||'RiskExpiry'),objectId:ref,idempotencyKey:key,context:item},this.systemUser);
      results.push({type:item.type,reference:ref,expiresAt:item.expiresAt,automationRunId:run.runId,duplicate:Boolean(run.duplicate)});
    }
    return {expiring30d:Number(dash.summary?.expiring30d||0),triggered:results.filter(x=>!x.duplicate).length,results};
  }

  private reportDue(def:any,runs:any[]){
    const own=runs.filter((x:any)=>x.reportId===def.reportId).sort((a:any,b:any)=>new Date(b.generatedAt||b.updatedAt).getTime()-new Date(a.generatedAt||a.updatedAt).getTime());
    if(!own.length)return true;
    const last=new Date(own[0].generatedAt||own[0].updatedAt).getTime(),age=Date.now()-last,f=String(def.frequency||'WEEKLY').toUpperCase();
    if(f==='DAILY')return age>=24*60*60*1000;
    if(f==='WEEKLY')return age>=7*24*60*60*1000;
    if(f==='MONTHLY')return new Date(last).toISOString().slice(0,7)!==new Date().toISOString().slice(0,7);
    if(f==='HOURLY')return age>=60*60*1000;
    return false;
  }

  private async runScheduledReports(){
    const dash:any=await this.reporting.dashboard(this.systemUser),results:any[]=[];
    for(const def of (dash.reportDefinitions||[]).filter((x:any)=>x.active!==false)){
      if(!this.reportDue(def,dash.reportRuns||[]))continue;
      try{const run:any=await this.reporting.runReport(def.reportId,this.systemUser);results.push({reportId:def.reportId,status:'GENERATED',runId:run.runId});}
      catch(e:any){results.push({reportId:def.reportId,status:'FAILED',error:e?.message||'report generation failed'});}
    }
    return {definitions:(dash.reportDefinitions||[]).filter((x:any)=>x.active!==false).length,generated:results.filter(x=>x.status==='GENERATED').length,failed:results.filter(x=>x.status==='FAILED').length,results};
  }

  async dashboard(user:ScopeUser){
    if(!['GLOBAL_ADMIN','CONTROL_TOWER','FINANCE','BRANCH_OPS'].includes(user.role))throw new Error('Internal access required');
    const rows=await this.events(),runs=this.latest(rows,'BackgroundJobRun');
    const byJob=JOBS.map(job=>{const last=runs.find((x:any)=>x.job===job.key);const anchor=last?.completedAt||last?.failedAt||null;return {job:job.key,cadenceMinutes:job.cadenceMinutes,lastStatus:last?.status||'NEVER_RUN',lastStartedAt:last?.startedAt||null,lastCompletedAt:last?.completedAt||null,lastFailedAt:last?.failedAt||null,lastError:last?.error||null,nextDueAt:anchor?new Date(new Date(anchor).getTime()+job.cadenceMinutes*60_000).toISOString():new Date().toISOString(),lastResult:last?.result||null};});
    return {scheduler:{heartbeatSeconds:HEARTBEAT_MS/1000,running:this.running,actor:this.systemUser.email},summary:{jobs:byJob.length,healthy:byJob.filter((x:any)=>x.lastStatus==='COMPLETED').length,failed:byJob.filter((x:any)=>x.lastStatus==='FAILED').length,neverRun:byJob.filter((x:any)=>x.lastStatus==='NEVER_RUN').length},jobs:byJob};
  }

  async runNow(job:string,user:ScopeUser){if(user.role!=='GLOBAL_ADMIN')throw new Error('Global administrator access required');const key=String(job).toUpperCase() as JobKey;if(!JOBS.some(x=>x.key===key))throw new Error('Unknown background job');return this.tick(key);}
}
