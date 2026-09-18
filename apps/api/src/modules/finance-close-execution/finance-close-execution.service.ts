import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { FinanceCloseOrchestrationService } from '../finance-close-orchestration/finance-close-orchestration.service';

const SRC='ANCLINE_FINANCE_CLOSE_EXECUTION';
const GL='ANCLINE_GL';
const CREDIT='ANCLINE_CREDIT_CONTROL';
const ACC='ANCLINE_ACCOUNTING';
const STAT='ANCLINE_STATUTORY_FINANCE';
const GROUP='ANCLINE_GROUP_FINANCE';
const DAY=86400000;

@Injectable()
export class FinanceCloseExecutionService {
  constructor(
    private prisma:PrismaService,
    private scope:ScopeService,
    private audit:AuditService,
    private orchestration:FinanceCloseOrchestrationService
  ){}
  private get db():any{return this.prisma as any;}
  private access(u:ScopeUser){this.scope.assertFinanceAccess(u);}
  private p(e:any){return (e?.payload||{}) as any;}
  private r(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(`${n} is required`);return s;}
  private period(v:any){const s=String(v||'');if(!/^\d{4}-\d{2}$/.test(s))throw new BadRequestException('Period must be YYYY-MM');return s;}
  private async periodStatus(period:string){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});return rows.length?String(this.p(rows[rows.length-1]).status||'OPEN'):'OPEN';}

  async policy(u:ScopeUser){
    this.access(u);const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'FinanceClosePolicy',objectId:'DEFAULT',eventType:'FINANCE_CLOSE_POLICY_SET'},orderBy:{createdAt:'asc'}});const last=rows[rows.length-1];
    return last?this.p(last):{policyId:'DEFAULT',arAgingHoldDays:90,requireBankFullyMatched:true,requireTaxFiled:true,requireIntercompanySettled:true,requireEntityCertification:true,updatedBy:null};
  }
  async setPolicy(b:any,u:ScopeUser){
    this.access(u);const days=Math.floor(Number(b?.arAgingHoldDays??90));if(!Number.isInteger(days)||days<0||days>3650)throw new BadRequestException('AR aging hold days must be 0-3650');
    const payload={policyId:'DEFAULT',arAgingHoldDays:days,requireBankFullyMatched:b?.requireBankFullyMatched!==false,requireTaxFiled:b?.requireTaxFiled!==false,requireIntercompanySettled:b?.requireIntercompanySettled!==false,requireEntityCertification:b?.requireEntityCertification!==false,updatedBy:u.sub,updatedAt:new Date().toISOString()};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'FINANCE_CLOSE_POLICY_SET',externalId:'DEFAULT',objectType:'FinanceClosePolicy',objectId:'DEFAULT',status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:u.sub,action:'FINANCE_CLOSE_POLICY_SET',objectType:'FinanceClosePolicy',objectId:'DEFAULT',detail:payload});return payload;
  }

  private async bankBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:CREDIT,objectType:'BankTransaction'},orderBy:{createdAt:'asc'}}),groups=new Map<string,any[]>();for(const e of rows){if(!groups.has(e.objectId))groups.set(e.objectId,[]);groups.get(e.objectId)!.push(e);}const out:any[]=[];
    for(const [id,ev] of groups){const imp=ev.find((x:any)=>x.eventType==='BANK_TRANSACTION_IMPORTED');if(!imp)continue;const base=this.p(imp);if(String(base.bookedAt||imp.createdAt).slice(0,7)!==period)continue;const reversals=new Set(ev.filter((x:any)=>x.eventType==='BANK_MATCH_REVERSED').map((x:any)=>String(this.p(x).matchEventId||'')));const matches=ev.filter((x:any)=>x.eventType==='BANK_TRANSACTION_MATCHED'&&!reversals.has(x.id));const matched=this.r(matches.reduce((s:number,x:any)=>s+Number(this.p(x).amount||0),0)),amount=this.r(base.amount),remaining=this.r(Math.max(0,amount-matched));if(remaining>0.005)out.push({area:'BANK_RECONCILIATION',type:'UNMATCHED_BANK_TRANSACTION',objectId:id,message:`${remaining} ${base.currency||''} remains unmatched`,amount:remaining,currency:base.currency||null});}
    return out;
  }

  private buildInvoice(ev:any[]){
    const created=ev.find((x:any)=>x.eventType==='INVOICE_CREATED');if(!created)return null;const p=this.p(created),payments=ev.filter((x:any)=>x.eventType==='PAYMENT_RECORDED'),paid=this.r(payments.reduce((s:number,x:any)=>s+Number(this.p(x).amount||0),0)),total=this.r(p.totalAmount),balance=this.r(Math.max(0,total-paid)),issued=ev.find((x:any)=>x.eventType==='INVOICE_ISSUED'),ctrl=ev.filter((x:any)=>['INVOICE_DISPUTED','INVOICE_RESOLVED','INVOICE_VOIDED'].includes(x.eventType)).pop();let status='DRAFT';if(ctrl?.eventType==='INVOICE_VOIDED')status='VOID';else if(ctrl?.eventType==='INVOICE_DISPUTED')status='DISPUTED';else if(balance<=0.005&&total>0)status='PAID';else if(paid>0)status='PART_PAID';else if(issued)status='ISSUED';const due=p.dueDate?new Date(p.dueDate):null,days=due&&balance>0&&!['DRAFT','VOID','PAID'].includes(status)?Math.max(0,Math.floor((Date.now()-due.getTime())/DAY)):0;return {invoiceNo:created.objectId,invoiceType:String(p.invoiceType||'AR').toUpperCase(),currency:p.currency||'USD',balance,status,daysOverdue:days,createdAt:created.createdAt};
  }
  private async agingBlockers(period:string,days:number){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:ACC,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}}),groups=new Map<string,any[]>();for(const e of rows){if(!groups.has(e.objectId))groups.set(e.objectId,[]);groups.get(e.objectId)!.push(e);}const out:any[]=[];
    for(const ev of groups.values()){const i=this.buildInvoice(ev);if(!i||i.invoiceType!=='AR'||!['ISSUED','PART_PAID','DISPUTED'].includes(i.status)||i.balance<=0)continue;if(String(i.createdAt).slice(0,7)>period)continue;if(i.daysOverdue>days)out.push({area:'AR_AGING',type:'AR_AGING_THRESHOLD',objectId:i.invoiceNo,message:`${i.daysOverdue} days overdue exceeds close threshold ${days}`,amount:i.balance,currency:i.currency});}
    return out;
  }

  async taxSummary(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);const events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}}),groups=new Map<string,any[]>();for(const e of events){if(!groups.has(e.objectId))groups.set(e.objectId,[]);groups.get(e.objectId)!.push(e);}const byKey=new Map<string,any>();
    for(const ev of groups.values()){const created=ev.find((x:any)=>x.eventType==='JOURNAL_CREATED');if(!created||!ev.some((x:any)=>x.eventType==='JOURNAL_POSTED')||ev.some((x:any)=>x.eventType==='JOURNAL_REVERSED'))continue;const p=this.p(created);if(String(p.period||'')!==period)continue;for(const l of p.lines||[]){if(!l.taxCode||!Number(l.taxRate))continue;const base=this.r(Number(l.debit||0)||Number(l.credit||0)),tax=this.r(base*Number(l.taxRate)/100),key=`${p.currency||'USD'}:${l.taxCode}`;if(!byKey.has(key))byKey.set(key,{currency:p.currency||'USD',taxCode:l.taxCode,taxRate:Number(l.taxRate),taxableBase:0,taxAmount:0});const x=byKey.get(key);x.taxableBase=this.r(x.taxableBase+base);x.taxAmount=this.r(x.taxAmount+tax);}}
    const filings:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'TaxFiling',objectId:period},orderBy:{createdAt:'asc'}});const last=filings[filings.length-1];return {period,rows:Array.from(byKey.values()),filing:last?this.p(last):null};
  }
  async prepareTax(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),tax=await this.taxSummary(period,u),payload={period,status:'PREPARED',jurisdiction:b?.jurisdiction?String(b.jurisdiction).toUpperCase():'GROUP',reference:b?.reference?String(b.reference):null,rowCount:tax.rows.length,preparedBy:u.sub,preparedAt:new Date().toISOString()};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'TAX_FILING_PREPARED',externalId:period,objectType:'TaxFiling',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'TAX_FILING_PREPARED',objectType:'TaxFiling',objectId:period,detail:payload});return payload;
  }
  async fileTax(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),tax=await this.taxSummary(period,u);if(!tax.filing||tax.filing.status!=='PREPARED')throw new BadRequestException('Tax filing must be prepared first');const reference=this.req(b?.filingReference,'Filing reference'),payload={...tax.filing,status:'FILED',filingReference:reference,filedBy:u.sub,filedAt:new Date().toISOString()};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'TAX_FILING_FILED',externalId:reference,objectType:'TaxFiling',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'TAX_FILING_FILED',objectType:'TaxFiling',objectId:period,detail:{reference}});return payload;
  }

  private async intercompanySettlementBlockers(period:string){
    const txRows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GROUP,objectType:'IntercompanyTransaction'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();for(const e of txRows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const settlements:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:STAT,objectType:'IntercompanySettlement',eventType:'INTERCOMPANY_SETTLEMENT_RECORDED'},orderBy:{createdAt:'asc'}}),out:any[]=[];
    for(const [id,ev] of g){const c=ev.find((x:any)=>x.eventType==='INTERCOMPANY_CREATED');if(!c)continue;const p=this.p(c);if(p.period!==period||!ev.some((x:any)=>x.eventType==='INTERCOMPANY_POSTED'))continue;const settled=this.r(settlements.filter((s:any)=>this.p(s).transactionNo===id).reduce((sum:number,s:any)=>sum+Number(this.p(s).amount||0),0)),amount=this.r(p.amount),remaining=this.r(Math.max(0,amount-settled));if(remaining>0.005)out.push({area:'INTERCOMPANY_SETTLEMENT',type:'INTERCOMPANY_UNSETTLED',objectId:id,message:`${remaining} ${p.currency||''} remains unsettled`,amount:remaining,currency:p.currency||null});}
    return out;
  }

  private async entityRows(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:STAT,objectType:'LegalEntity',eventType:'LEGAL_ENTITY_SET'},orderBy:{createdAt:'asc'}}),m=new Map<string,any>();for(const e of rows)m.set(e.objectId,{entityId:e.objectId,...this.p(e)});return Array.from(m.values()).filter((x:any)=>x.active!==false);
  }
  private async entityCloseState(entityId:string,period:string){const id=`${entityId}:${period}`,rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:STAT,objectType:'EntityClose',objectId:id},orderBy:{createdAt:'asc'}});const last=rows[rows.length-1];return last?{entityId,period,...this.p(last),updatedAt:last.createdAt}:{entityId,period,status:'OPEN'};}
  async entityApprovals(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),entities=await this.entityRows(),events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'EntityCloseApproval',status:'COMPLETED'},orderBy:{createdAt:'asc'}}),out:any[]=[];
    for(const e of entities){const id=`${e.entityId}:${period}`,rows=events.filter((x:any)=>x.objectId===id),req=[...rows].reverse().find((x:any)=>x.eventType==='ENTITY_CLOSE_APPROVAL_REQUESTED'),approved=[...rows].reverse().find((x:any)=>x.eventType==='ENTITY_CLOSE_APPROVED'),state=await this.entityCloseState(e.entityId,period);out.push({entityId:e.entityId,entityCode:e.entityCode,entityName:e.entityName,period,status:state.status||'OPEN',request:req?this.p(req):null,approval:approved?this.p(approved):null});}return out;
  }
  async requestEntityApproval(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),entity=(await this.entityRows()).find((x:any)=>x.entityId===entityId);if(!entity)throw new NotFoundException('Legal entity not found');if(await this.periodStatus(period)!=='CLOSED')throw new BadRequestException('Global GL period must be CLOSED before entity certification approval');const id=`${entityId}:${period}`,payload={entityId,entityCode:entity.entityCode,period,requestedBy:u.sub,requestedAt:new Date().toISOString(),note:b?.note?String(b.note):null};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'ENTITY_CLOSE_APPROVAL_REQUESTED',externalId:id,objectType:'EntityCloseApproval',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});await this.db.integrationEvent.create({data:{sourceSystem:STAT,eventType:'ENTITY_CLOSE_STATUS_SET',externalId:id,objectType:'EntityClose',objectId:id,status:'COMPLETED',payload:{entityId,period,status:'REVIEW',note:payload.note,updatedBy:u.sub},completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'ENTITY_CLOSE_APPROVAL_REQUESTED',objectType:'EntityCloseApproval',objectId:id,detail:payload});return payload;
  }
  async approveEntityClose(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),id=`${entityId}:${period}`,events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'EntityCloseApproval',objectId:id},orderBy:{createdAt:'asc'}}),request=[...events].reverse().find((x:any)=>x.eventType==='ENTITY_CLOSE_APPROVAL_REQUESTED');if(!request)throw new BadRequestException('Entity close approval has not been requested');const rp=this.p(request);if(String(rp.requestedBy)===String(u.sub))throw new BadRequestException('Requester cannot approve their own entity close');if(await this.periodStatus(period)!=='CLOSED')throw new BadRequestException('Global GL period must remain CLOSED');const policy=await this.policy(u),blockers=await this.executionBlockers(period,u);if(blockers.filter((x:any)=>x.area!=='ENTITY_CERTIFICATION').length)throw new BadRequestException('Finance close still has execution blockers');const payload={entityId,period,approvedBy:u.sub,approvedAt:new Date().toISOString(),requesterId:rp.requestedBy,note:b?.note?String(b.note):null};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'ENTITY_CLOSE_APPROVED',externalId:id,objectType:'EntityCloseApproval',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.integrationEvent.create({data:{sourceSystem:STAT,eventType:'ENTITY_CLOSE_STATUS_SET',externalId:id,objectType:'EntityClose',objectId:id,status:'COMPLETED',payload:{entityId,period,status:'CERTIFIED',note:payload.note,updatedBy:u.sub},completedAt:new Date()}})
    ]);await this.audit.log({actorId:u.sub,action:'ENTITY_CLOSE_APPROVED',objectType:'EntityCloseApproval',objectId:id,detail:payload});return payload;
  }

  private async executionBlockers(period:string,u:ScopeUser){
    const policy=await this.policy(u),base=await this.orchestration.blockers(period,u),out=[...base];
    if(policy.requireBankFullyMatched)out.push(...await this.bankBlockers(period));
    out.push(...await this.agingBlockers(period,policy.arAgingHoldDays));
    const tax=await this.taxSummary(period,u);if(policy.requireTaxFiled&&tax.filing?.status!=='FILED')out.push({area:'TAX',type:'TAX_NOT_FILED',objectId:period,message:'Tax/VAT filing is not marked FILED'});
    if(policy.requireIntercompanySettled)out.push(...await this.intercompanySettlementBlockers(period));
    if(policy.requireEntityCertification){const approvals=await this.entityApprovals(period,u);for(const e of approvals.filter((x:any)=>x.status!=='CERTIFIED'))out.push({area:'ENTITY_CERTIFICATION',type:'ENTITY_NOT_CERTIFIED',objectId:e.entityCode,message:`Legal entity ${e.entityCode} is ${e.status||'OPEN'}`});}
    return out;
  }
  async dashboard(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),policy=await this.policy(u),blockers=await this.executionBlockers(period,u),status=await this.periodStatus(period),tax=await this.taxSummary(period,u),entities=await this.entityApprovals(period,u),counts=new Map<string,number>();for(const b of blockers)counts.set(b.area,(counts.get(b.area)||0)+1);
    return {period,periodStatus:status,ready:blockers.length===0,blockerCount:blockers.length,policy,tax,entities,areas:Array.from(counts.entries()).map(([area,count])=>({area,count})).sort((a:any,b:any)=>a.area.localeCompare(b.area)),blockers};
  }
  async closePeriod(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);if(await this.periodStatus(period)==='CLOSED')return {period,status:'CLOSED',alreadyClosed:true};const blockers=(await this.executionBlockers(period,u)).filter((x:any)=>x.area!=='ENTITY_CERTIFICATION');if(blockers.length)throw new BadRequestException(`Cannot close period: ${blockers.length} execution blocker(s)`);const note=b?.note?String(b.note):'Closed by finance close execution';const payload={period,status:'CLOSED',note,actorId:u.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:GL,eventType:'PERIOD_STATUS_SET',externalId:period,objectType:'FiscalPeriod',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'FINANCE_CLOSE_PERIOD_EXECUTED',objectType:'FiscalPeriod',objectId:period,detail:{note}});return {period,status:'CLOSED'};
  }
}
