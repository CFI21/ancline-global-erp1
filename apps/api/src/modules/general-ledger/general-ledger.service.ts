import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_GL';
@Injectable()
export class GeneralLedgerService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private hasRight(user:ScopeUser,right:string){
    const role=String(user?.role||'').toUpperCase();
    const permissions=Array.isArray((user as any)?.permissions)?(user as any).permissions.map((x:any)=>String(x).toUpperCase()):[];
    return role==='GLOBAL_ADMIN'||permissions.includes('FINANCE_CONFIG_ADMIN')||permissions.includes(right);
  }
  private access(user:ScopeUser,right='GL_VIEW'){if(!this.hasRight(user,right))throw new ForbiddenException('Explicit '+right+' entitlement required');}
  private payload(e:any){return (e?.payload||{}) as any;}
  private round(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private req(v:any,n:string){const t=String(v??'').trim();if(!t)throw new BadRequestException(`${n} is required`);return t;}
  private periodOf(value:any){const d=new Date(value);if(Number.isNaN(d.getTime()))throw new BadRequestException('Invalid journal date');return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
  private async periodState(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});
    const last=rows[rows.length-1];
    return last?{period,status:this.payload(last).status||'OPEN',updatedAt:last.createdAt}: {period,status:'OPEN',updatedAt:null};
  }
  async periods(user:ScopeUser){
    this.access(user,'GL_VIEW');
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'FiscalPeriod'},orderBy:{createdAt:'asc'}});
    const map=new Map<string,any>();
    for(const r of rows)map.set(r.objectId,{period:r.objectId,...this.payload(r),updatedAt:r.createdAt});
    return Array.from(map.values()).sort((a:any,b:any)=>b.period.localeCompare(a.period));
  }
  async setPeriod(body:any,user:ScopeUser){
    this.access(user,'PERIOD_CLOSE');const period=this.req(body?.period,'Period');if(!/^\d{4}-\d{2}$/.test(period))throw new BadRequestException('Period must be YYYY-MM');
    const status=String(body?.status||'OPEN').toUpperCase();if(!['OPEN','SOFT_CLOSED','CLOSED'].includes(status))throw new BadRequestException('Invalid period status');
    const before=await this.periodState(period);const changedAt=new Date();
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'PERIOD_STATUS_SET',externalId:period,objectType:'FiscalPeriod',objectId:period,status:'COMPLETED',payload:{period,status,note:body?.note||null,actorId:user.sub,changedAt:changedAt.toISOString()},completedAt:changedAt}});
    await this.audit.log({actorId:user.sub,action:'GL_PERIOD_SET',objectType:'FiscalPeriod',objectId:period,detail:{before:{status:before.status},after:{status},changedAt:changedAt.toISOString()}});return this.periodState(period);
  }
  async closePeriod(period:string,user:ScopeUser){
    this.access(user,'PERIOD_CLOSE');
    const journals:any[]=await this.journals(user);
    const draft=journals.filter((j:any)=>j.period===period&&j.status!=='POSTED'&&j.status!=='REVERSED');
    if(draft.length)throw new BadRequestException(`${draft.length} journal(s) remain unposted in ${period}`);
    return this.setPeriod({period,status:'CLOSED',note:'Period closed'},user);
  }
  async reopenPeriod(period:string,user:ScopeUser){this.access(user,'PERIOD_CLOSE');return this.setPeriod({period,status:'OPEN',note:'Period reopened'},user);}
  private async journalEvents(){return this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}});}
  private buildJournal(rows:any[]){
    const created=rows.find((e:any)=>e.eventType==='JOURNAL_CREATED');if(!created)return null;const base=this.payload(created);
    const posted=rows.find((e:any)=>e.eventType==='JOURNAL_POSTED');
    const reversed=rows.find((e:any)=>e.eventType==='JOURNAL_REVERSED');
    return {...base,journalNo:created.objectId,status:reversed?'REVERSED':posted?'POSTED':'DRAFT',createdAt:created.createdAt,postedAt:posted?.createdAt||null};
  }
  async journals(user:ScopeUser){
    this.access(user,'GL_VIEW');const events:any[]=await this.journalEvents();const grouped=new Map<string,any[]>();
    for(const e of events){if(!grouped.has(e.objectId))grouped.set(e.objectId,[]);grouped.get(e.objectId)!.push(e);}return Array.from(grouped.values()).map((r:any)=>this.buildJournal(r)).filter(Boolean).sort((a:any,b:any)=>new Date(b.journalDate).getTime()-new Date(a.journalDate).getTime());
  }
  async createJournal(body:any,user:ScopeUser){
    this.access(user,'JOURNAL_CREATE');const journalDate=this.req(body?.journalDate,'Journal date');const period=this.periodOf(journalDate);const state=await this.periodState(period);if(state.status==='CLOSED')throw new BadRequestException(`Period ${period} is closed`);
    const currency=String(body?.currency||'USD').toUpperCase();const lines=Array.isArray(body?.lines)?body.lines:[];if(lines.length<2)throw new BadRequestException('At least two journal lines are required');
    const clean=lines.map((l:any,i:number)=>{const account=this.req(l?.account,`Line ${i+1} account`).toUpperCase();const debit=this.round(l?.debit);const credit=this.round(l?.credit);if(debit<0||credit<0||(!debit&&!credit)||(debit&&credit))throw new BadRequestException(`Line ${i+1} must have either debit or credit`);return {account,description:l?.description?String(l.description):null,debit,credit,taxCode:l?.taxCode?String(l.taxCode).toUpperCase():null,taxRate:l?.taxRate==null?null:Number(l.taxRate),bookingId:l?.bookingId||null,partyId:l?.partyId||null};});
    const debit=this.round(clean.reduce((s:number,l:any)=>s+l.debit,0)),credit=this.round(clean.reduce((s:number,l:any)=>s+l.credit,0));if(Math.abs(debit-credit)>0.005)throw new BadRequestException(`Journal is not balanced: debit ${debit} / credit ${credit}`);
    const journalNo=String(body?.journalNo||`JE-${period.replace('-','')}-${Date.now().toString().slice(-7)}`).toUpperCase();const duplicate=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:'JournalEntry',objectId:journalNo}});if(duplicate)throw new BadRequestException(`Journal ${journalNo} already exists`);
    const payload={journalNo,journalDate:new Date(journalDate).toISOString(),period,currency,description:body?.description?String(body.description):null,reference:body?.reference?String(body.reference):null,source:String(body?.source||'MANUAL').toUpperCase(),lines:clean,totalDebit:debit,totalCredit:credit};
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'JOURNAL_CREATED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'GL_JOURNAL_CREATE',objectType:'JournalEntry',objectId:journalNo,detail:{before:null,after:{period,currency,debit,credit,lineCount:clean.length,status:'DRAFT'},changedAt:new Date().toISOString()}});return {...payload,status:'DRAFT'};
  }
  async postJournal(journalNo:string,user:ScopeUser){
    this.access(user,'JOURNAL_APPROVE');const events:any[]=await this.journalEvents();const grouped=new Map<string,any[]>();for(const e of events){if(!grouped.has(e.objectId))grouped.set(e.objectId,[]);grouped.get(e.objectId)!.push(e);}const journals=Array.from(grouped.values()).map((r:any)=>this.buildJournal(r)).filter(Boolean);const j:any=journals.find((x:any)=>x.journalNo===journalNo);if(!j)throw new NotFoundException('Journal not found');if(j.status!=='DRAFT')throw new BadRequestException(`Journal cannot be posted from ${j.status}`);const state=await this.periodState(j.period);if(state.status==='CLOSED')throw new BadRequestException(`Period ${j.period} is closed`);
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'JOURNAL_POSTED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:{journalNo,postedBy:user.sub},completedAt:new Date()}});await this.audit.log({actorId:user.sub,action:'GL_JOURNAL_POST',objectType:'JournalEntry',objectId:journalNo,detail:{before:{status:'DRAFT'},after:{status:'POSTED',period:j.period},changedAt:new Date().toISOString()}});return {...j,status:'POSTED'};
  }
  async trialBalance(user:ScopeUser){
    this.access(user,'GL_VIEW');const journals:any[]=await this.journals(user);const map=new Map<string,any>();
    for(const j of journals.filter((x:any)=>x.status==='POSTED'))for(const l of j.lines||[]){const key=`${j.currency}:${l.account}`;if(!map.has(key))map.set(key,{currency:j.currency,account:l.account,debit:0,credit:0,balance:0});const r=map.get(key);r.debit=this.round(r.debit+Number(l.debit||0));r.credit=this.round(r.credit+Number(l.credit||0));r.balance=this.round(r.debit-r.credit);}return Array.from(map.values()).sort((a:any,b:any)=>a.currency.localeCompare(b.currency)||a.account.localeCompare(b.account));
  }
  async taxSummary(user:ScopeUser){
    this.access(user,'GL_VIEW');const journals:any[]=await this.journals(user);const map=new Map<string,any>();
    for(const j of journals.filter((x:any)=>x.status==='POSTED'))for(const l of j.lines||[]){if(!l.taxCode||!l.taxRate)continue;const base=this.round(Number(l.debit||0)||Number(l.credit||0));const tax=this.round(base*Number(l.taxRate)/100);const key=`${j.period}:${j.currency}:${l.taxCode}`;if(!map.has(key))map.set(key,{period:j.period,currency:j.currency,taxCode:l.taxCode,taxRate:Number(l.taxRate),taxableBase:0,taxAmount:0});const r=map.get(key);r.taxableBase=this.round(r.taxableBase+base);r.taxAmount=this.round(r.taxAmount+tax);}return Array.from(map.values()).sort((a:any,b:any)=>b.period.localeCompare(a.period)||a.taxCode.localeCompare(b.taxCode));
  }
  async dashboard(user:ScopeUser){this.access(user,'GL_VIEW');const [journals,periods,tb,tax]=await Promise.all([this.journals(user),this.periods(user),this.trialBalance(user),this.taxSummary(user)]);return {journalCount:journals.length,draftCount:journals.filter((j:any)=>j.status==='DRAFT').length,postedCount:journals.filter((j:any)=>j.status==='POSTED').length,closedPeriods:periods.filter((p:any)=>p.status==='CLOSED').length,trialBalanceAccounts:tb.length,taxRows:tax.length};}
}
