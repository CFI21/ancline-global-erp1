import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { evaluateReleaseSecurity } from '../documents/release-security';
import { AuditService } from '../audit/audit.service';

type Severity='CRITICAL'|'HIGH'|'MEDIUM';
type Category='ACTION_REQUIRED'|'CUT_OFF_RISK'|'DOCUMENT_GAP'|'PAYMENT_RELEASE_BLOCK'|'FAILED_EVENT'|'LATE_MILESTONE'|'RECONCILIATION_EXCEPTION';

type ControlRow={
  id:string;
  severity:Severity;
  category:Category;
  bookingId?:string;
  bookingNo:string;
  businessModel?:string;
  branchId?:string;
  branch?:string;
  owner:string;
  message:string;
  due?:string;
  source:string;
  actionLabel:string;
  actionHref:string;
  updatedAt?:string;
  taskId?:string;
  taskStatus?:string;
  slaState?:string;
  queueMutable?:boolean;
  escalationLevel?:string;
  escalationStatus?:string;
  escalationNotificationId?:string;
};

const TERMINAL=new Set(['CANCELLED','FINANCIALLY_CLOSED']);
const DOC_GATE=new Set(['CONFIRMED','OPERATIONAL','COMPLETED']);
const DOC_ACTION=new Set(['DRAFT','PENDING','REVIEW','REJECTED','HOLD','BLOCKED','MISSING']);
const CRITICAL_DOC=new Set(['REJECTED','HOLD','BLOCKED','MISSING']);

@Injectable()
export class OperationsControlService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private get db():any{return this.prisma as any;}
  private text(v:any){return String(v??'').trim();}
  private upper(v:any){return this.text(v).toUpperCase();}
  private iso(v:any){const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?d.toISOString():undefined;}
  private hours(ms:number){return Math.round(ms/3600000);}
  private internalGlobal(user:ScopeUser){return ['GLOBAL_ADMIN','CONTROL_TOWER'].includes(user.role);}
  private taskSla(due:any,status:any){
    if(this.upper(status)==='COMPLETED')return 'Met';
    if(!due)return 'On Track';
    const ms=new Date(due).getTime()-Date.now();
    if(Number.isNaN(ms))return 'On Track';
    if(ms<0)return 'Overdue';
    if(ms<=24*3600000)return 'At Risk';
    return 'On Track';
  }

  async claim(rowId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const result:any=await this.dashboard(user);
    const row:ControlRow|undefined=(result.rows||[]).find((x:ControlRow)=>x.id===rowId);
    if(!row)throw new Error('Operations control item not found');
    if(!row.bookingId)throw new Error('This platform-level exception has no booking task context');
    await this.scope.assertBookingAccess(user,row.bookingId);

    let task:any=row.taskId?await this.db.task.findUnique({where:{id:row.taskId}}):null;
    const title='[OC:'+row.id+'] '+row.message;
    if(!task)task=await this.db.task.findFirst({where:{bookingId:row.bookingId,title}});
    const ownerId=this.text(user.email||user.sub)||user.sub;
    const dueAt=row.due?new Date(row.due):null;
    const before=task?{ownerId:task.ownerId,dueAt:task.dueAt,status:task.status,slaState:task.slaState}:null;
    const slaState=this.taskSla(dueAt,'Acknowledged');

    if(task){
      task=await this.db.task.update({where:{id:task.id},data:{ownerId,status:'Acknowledged',dueAt:dueAt||task.dueAt,slaState:this.taskSla(dueAt||task.dueAt,'Acknowledged')}});
    }else{
      task=await this.db.task.create({data:{bookingId:row.bookingId,title,ownerId,dueAt,status:'Acknowledged',slaState}});
    }
    await this.audit.log({
      actorId:user.sub,action:'OPERATIONS_CONTROL_CLAIM',objectType:'Task',objectId:String(task.id),bookingId:row.bookingId,
      detail:{controlRowId:row.id,category:row.category,before,after:{ownerId:task.ownerId,dueAt:task.dueAt,status:task.status,slaState:task.slaState}}
    });
    return task;
  }

  async dashboard(user:ScopeUser){
    this.scope.assertInternal(user);
    const now=Date.now();
    const bookingWhere:any=bookingScope(user);
    const bookings:any[]=await this.db.booking.findMany({
      where:bookingWhere,
      include:{
        documents:true,
        tasks:true,
        approvals:true,
        milestones:true,
        financeLines:true
      },
      orderBy:{updatedAt:'desc'}
    });
    const bookingIds=new Set(bookings.map((b:any)=>String(b.id)));
    const branchIds=[...new Set(bookings.map((b:any)=>b.owningBranchId).filter(Boolean).map(String))];
    const branches:any[]=branchIds.length?await this.db.branch.findMany({where:{id:{in:branchIds}}}):[];
    const branchMap=new Map(branches.map((b:any)=>[String(b.id),String(b.code||b.name||b.id)]));

    const [failedEvents,slaEvents]:any[][]=await Promise.all([
      this.db.integrationEvent.findMany({
        where:{status:{in:['FAILED','RETRY_PENDING']}},
        orderBy:{createdAt:'desc'},
        take:250
      }),
      this.db.integrationEvent.findMany({
        where:{sourceSystem:'ANCLINE_ORCHESTRATION',objectType:'TaskSlaAutomation',status:'COMPLETED'},
        orderBy:{createdAt:'desc'},
        take:500
      })
    ]);
    const slaByTask=new Map<string,any>();
    for(const e of slaEvents){
      const p:any=e.payload&&typeof e.payload==='object'?e.payload:{};
      if(p.taskId&&!slaByTask.has(String(p.taskId)))slaByTask.set(String(p.taskId),p);
    }

    const out=new Map<string,ControlRow>();
    const add=(row:ControlRow)=>{if(!out.has(row.id))out.set(row.id,row);};
    const context=(b:any)=>({
      bookingId:String(b.id),
      bookingNo:String(b.bookingNo||'-'),
      businessModel:String(b.businessModel||'NVOCC').toUpperCase(),
      branchId:b.owningBranchId?String(b.owningBranchId):undefined,
      branch:b.owningBranchId?(branchMap.get(String(b.owningBranchId))||String(b.owningBranchId)):undefined
    });

    for(const b of bookings){
      const ctx=context(b);
      const status=this.upper(b.status);
      const active=!TERMINAL.has(status);

      if(this.upper(b.creditStatus)==='BLOCKED'){
        add({...ctx,id:`action-credit-${b.id}`,severity:'CRITICAL',category:'ACTION_REQUIRED',owner:'Finance / Credit',message:'Credit status is blocked',source:'Booking',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(b.updatedAt)});
      }
      if(this.upper(b.slotStatus)==='WAITLIST'){
        add({...ctx,id:`action-slot-${b.id}`,severity:'HIGH',category:'ACTION_REQUIRED',owner:'Operations',message:'Carrier slot is waitlisted',source:'Booking',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(b.updatedAt)});
      }
      if(this.upper(b.equipmentStatus)==='SHORTAGE'){
        add({...ctx,id:`action-equipment-${b.id}`,severity:'HIGH',category:'ACTION_REQUIRED',owner:'Equipment Desk',message:'Equipment shortage reported',source:'Booking',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(b.updatedAt)});
      }

      for(const t of (b.tasks||[])){
        if(this.upper(t.status)==='COMPLETED'||!t.dueAt)continue;
        const due=new Date(t.dueAt).getTime();
        if(Number.isNaN(due)||due>=now)continue;
        add({...ctx,id:`action-task-${t.id}`,severity:now-due>86400000?'HIGH':'MEDIUM',category:'ACTION_REQUIRED',owner:this.text(t.ownerId)||'Unassigned',message:this.text(t.title)||'Overdue task',due:this.iso(t.dueAt),source:'Task',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(t.updatedAt),taskId:String(t.id),taskStatus:this.text(t.status)||'Open',slaState:this.text(t.slaState)||this.taskSla(t.dueAt,t.status),queueMutable:true});
      }

      for(const a of (b.approvals||[])){
        if(this.upper(a.status)!=='PENDING')continue;
        add({...ctx,id:`action-approval-${a.id}`,severity:'MEDIUM',category:'ACTION_REQUIRED',owner:this.text(a.approverId)||'Approver',message:`${this.text(a.type)||'Approval'}${a.reason?` — ${a.reason}`:''}`,source:'Approval',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(a.updatedAt)});
      }

      if(active&&!b.atd){
        const cutoffs=[
          ['CY closing',b.cyClosing],['SI cut-off',b.siCutoff],['VGM cut-off',b.vgmCutoff],['Document cut-off',b.docCutoff],['Port cut-off',b.portCutoff]
        ].map(([label,value])=>({label:String(label),value,date:value?new Date(value as any):null}))
         .filter((x:any)=>x.date&&!Number.isNaN(x.date.getTime()))
         .map((x:any)=>({...x,ms:x.date.getTime()}))
         .filter((x:any)=>x.ms<=now+48*3600000);
        if(cutoffs.length){
          cutoffs.sort((a:any,b:any)=>a.ms-b.ms);
          const overdue=cutoffs.filter((x:any)=>x.ms<now);
          const message=cutoffs.slice(0,4).map((x:any)=>x.ms<now?`${x.label} overdue by ${Math.max(1,this.hours(now-x.ms))}h`:`${x.label} in ${Math.max(1,this.hours(x.ms-now))}h`).join(' · ');
          add({...ctx,id:`cutoff-${b.id}`,severity:overdue.length?'CRITICAL':'HIGH',category:'CUT_OFF_RISK',owner:this.text(b.operator)||'Operations',message,due:this.iso(cutoffs[0].date),source:'Booking Cut-offs',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(b.updatedAt)});
        }
      }

      if(DOC_GATE.has(status)){
        const docs:any[]=b.documents||[];
        if(!docs.length){
          add({...ctx,id:`docs-none-${b.id}`,severity:'HIGH',category:'DOCUMENT_GAP',owner:'Documentation',message:'No operational documents are recorded for this job',source:'Documents',actionLabel:'Open Documents',actionHref:`/documents?bookingId=${encodeURIComponent(String(b.id))}`,updatedAt:this.iso(b.updatedAt)});
        }else{
          const actionDocs=docs.filter((d:any)=>DOC_ACTION.has(this.upper(d.status)));
          if(actionDocs.length){
            const severe=actionDocs.some((d:any)=>CRITICAL_DOC.has(this.upper(d.status)));
            const labels=actionDocs.slice(0,4).map((d:any)=>`${d.type}: ${d.status}`).join(' · ');
            add({...ctx,id:`docs-status-${b.id}`,severity:severe?'CRITICAL':'MEDIUM',category:'DOCUMENT_GAP',owner:'Documentation',message:labels||'Document status requires attention',source:'Documents',actionLabel:'Open Documents',actionHref:`/documents?bookingId=${encodeURIComponent(String(b.id))}`,updatedAt:this.iso(b.updatedAt)});
          }
        }
      }

      const releaseDocs=(b.documents||[]).filter((d:any)=>{
        const control=this.upper(d.releaseControl);
        return control&&control!=='CLEAR'&&control!=='RELEASED'&&control!=='NONE'&&control!=='N/A';
      });
      if(releaseDocs.length){
        add({...ctx,id:`release-doc-${b.id}`,severity:releaseDocs.some((d:any)=>/BLOCK|HOLD/.test(this.upper(d.releaseControl)))?'CRITICAL':'HIGH',category:'PAYMENT_RELEASE_BLOCK',owner:'Documentation / Release',message:releaseDocs.slice(0,4).map((d:any)=>`${d.type}: ${d.releaseControl}`).join(' · '),source:'Document Release Control',actionLabel:'Open Documents',actionHref:`/documents?bookingId=${encodeURIComponent(String(b.id))}`,updatedAt:this.iso(b.updatedAt)});
      }

      if(active&&this.upper(b.businessModel)==='FORWARDING'){
        const release:any=await evaluateReleaseSecurity(this.db,String(b.id));
        if(!release?.clear){
          add({...ctx,id:`release-payment-${b.id}`,severity:status==='OPERATIONAL'?'CRITICAL':'HIGH',category:'PAYMENT_RELEASE_BLOCK',owner:'Finance / Release',message:(release.blockers||[]).join(' · ')||'Payment or release security is not clear',source:'Release Security',actionLabel:'Open Payment',actionHref:`/carrier-payment?bookingId=${encodeURIComponent(String(b.id))}`,updatedAt:this.iso(b.updatedAt)});
        }
      }

      for(const m of (b.milestones||[])){
        if(this.upper(m.status)==='COMPLETED'||!m.plannedAt)continue;
        const due=new Date(m.plannedAt).getTime();
        if(Number.isNaN(due)||due>=now)continue;
        add({...ctx,id:`milestone-${m.id}`,severity:now-due>86400000?'CRITICAL':'HIGH',category:'LATE_MILESTONE',owner:this.text(b.operator)||'Operations',message:`${this.text(m.label)||this.text(m.code)||'Milestone'}${m.location?` at ${m.location}`:''}`,due:this.iso(m.plannedAt),source:'Tracking',actionLabel:'Open Tracking',actionHref:`/tracking?bookingId=${encodeURIComponent(String(b.id))}`,updatedAt:this.iso(m.updatedAt)});
      }

      const disputed=(b.financeLines||[]).filter((f:any)=>this.upper(f.status)==='DISPUTED');
      if(disputed.length){
        add({...ctx,id:`recon-${b.id}`,severity:'HIGH',category:'RECONCILIATION_EXCEPTION',owner:'Finance',message:disputed.slice(0,4).map((f:any)=>`${f.chargeCode}: ${f.currency} ${Number(f.finalAmount??f.amount??0).toFixed(2)} disputed`).join(' · '),source:'Finance',actionLabel:'Open Job',actionHref:`/bookings/${b.id}`,updatedAt:this.iso(b.updatedAt)});
      }
    }

    for(const e of failedEvents){
      const p:any=e.payload&&typeof e.payload==='object'?e.payload:{};
      const candidates=[p.bookingId,p.jobId,e.objectId,e.externalId].filter(Boolean).map(String);
      const bookingId=candidates.find((x:string)=>bookingIds.has(x));
      if(!bookingId&&!this.internalGlobal(user))continue;
      const b=bookingId?bookings.find((x:any)=>String(x.id)===bookingId):null;
      const ctx=b?context(b):{bookingNo:'-'};
      const detail=this.text(p.errorMessage||p.error||p.message||p.reason);
      add({...ctx,id:`event-${e.id}`,severity:this.upper(e.status)==='FAILED'?'CRITICAL':'HIGH',category:'FAILED_EVENT',owner:'Integration / Platform',message:`${this.text(e.sourceSystem)||'Integration'} · ${this.text(e.eventType)||'Event'} · ${this.upper(e.status)}${detail?` — ${detail}`:''}`,source:'Integration Event',actionLabel:'Open Integration',actionHref:'/connectivity',updatedAt:this.iso(e.updatedAt||e.createdAt)});
    }

    const controlTasks=new Map<string,any>();
    for(const b of bookings){
      for(const t of (b.tasks||[])){
        const match=String(t.title||'').match(/^\[OC:([^\]]+)\]/);
        if(match)controlTasks.set(match[1],t);
      }
    }
    for(const row of out.values()){
      if(!row.taskId){
        const t=controlTasks.get(row.id);
        if(t){
          row.taskId=String(t.id);
          row.taskStatus=this.text(t.status)||'Open';
          row.slaState=this.text(t.slaState)||this.taskSla(t.dueAt,t.status);
          row.owner=this.text(t.ownerId)||row.owner;
          row.due=this.iso(t.dueAt)||row.due;
          row.queueMutable=true;
        }else if(row.bookingId){
          row.queueMutable=true;
        }
      }
      if(row.taskId){
        const escalation=slaByTask.get(String(row.taskId));
        if(escalation){
          row.escalationLevel=this.text(escalation.level);
          row.escalationStatus=this.text(escalation.status);
          row.escalationNotificationId=this.text(escalation.notificationId);
        }
      }
    }

    const rank:Record<Severity,number>={CRITICAL:0,HIGH:1,MEDIUM:2};
    const rows=[...out.values()].sort((a,b)=>rank[a.severity]-rank[b.severity]||((a.due?new Date(a.due).getTime():Number.MAX_SAFE_INTEGER)-(b.due?new Date(b.due).getTime():Number.MAX_SAFE_INTEGER))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    const categoryCounts:Record<Category,number>={
      ACTION_REQUIRED:0,CUT_OFF_RISK:0,DOCUMENT_GAP:0,PAYMENT_RELEASE_BLOCK:0,FAILED_EVENT:0,LATE_MILESTONE:0,RECONCILIATION_EXCEPTION:0
    };
    for(const r of rows)categoryCounts[r.category]++;

    return {
      generatedAt:new Date().toISOString(),
      summary:{
        open:rows.length,
        critical:rows.filter(r=>r.severity==='CRITICAL').length,
        high:rows.filter(r=>r.severity==='HIGH').length,
        ...categoryCounts,
        queueOpen:rows.filter(r=>r.taskId&&this.upper(r.taskStatus)!=='COMPLETED').length,
        queueOverdue:rows.filter(r=>this.upper(r.slaState)==='OVERDUE').length,
        queueAtRisk:rows.filter(r=>this.upper(r.slaState)==='AT RISK'||this.upper(r.slaState)==='AT_RISK').length,
        queueUnassigned:rows.filter(r=>r.taskId&&(!r.owner||r.owner==='Unassigned')).length,
        escalated:rows.filter(r=>Boolean(r.escalationLevel)).length,
        level1:rows.filter(r=>r.escalationLevel==='LEVEL_1').length,
        level2:rows.filter(r=>r.escalationLevel==='LEVEL_2').length,
        level3:rows.filter(r=>r.escalationLevel==='LEVEL_3').length
      },
      rows,
      filters:{
        branches:[...new Set(rows.map(r=>r.branch).filter(Boolean))].sort(),
        owners:[...new Set(rows.map(r=>r.owner).filter(Boolean))].sort(),
        businessModels:[...new Set(rows.map(r=>r.businessModel).filter(Boolean))].sort()
      }
    };
  }
}
