import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { FinanceCloseExecutionService } from '../finance-close-execution/finance-close-execution.service';

const SRC='ANCLINE_FINANCE_CLOSE_PACK';
const GL='ANCLINE_GL';
const STAT='ANCLINE_STATUTORY_FINANCE';
const CREDIT='ANCLINE_CREDIT_CONTROL';
const ACC='ANCLINE_ACCOUNTING';
const DAY=86400000;

@Injectable()
export class FinanceClosePackService {
  constructor(
    private prisma:PrismaService,
    private scope:ScopeService,
    private audit:AuditService,
    private execution:FinanceCloseExecutionService
  ){}
  private get db():any{return this.prisma as any;}
  private access(u:ScopeUser){this.scope.assertFinanceAccess(u);}
  private p(e:any){return (e?.payload||{}) as any;}
  private r(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(`${n} is required`);return s;}
  private period(v:any){const s=String(v||'');if(!/^\d{4}-\d{2}$/.test(s))throw new BadRequestException('Period must be YYYY-MM');return s;}
  private balanceSheet(account:any){const a=String(account||'').toUpperCase();return /^(1|2|3)/.test(a)||a.includes('BANK')||a.includes('RECEIVABLE')||a.includes('PAYABLE')||a.includes('ACCRUAL')||a.includes('PREPAY');}

  private async entities(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:STAT,objectType:'LegalEntity',eventType:'LEGAL_ENTITY_SET'},orderBy:{createdAt:'asc'}}),m=new Map<string,any>();for(const e of rows)m.set(e.objectId,{entityId:e.objectId,...this.p(e)});return Array.from(m.values()).filter((x:any)=>x.active!==false);
  }

  private async branchEntityMap(){
    const entities=await this.entities(),m=new Map<string,string>();for(const e of entities)for(const id of e.branchIds||[])m.set(String(id),String(e.entityId));return m;
  }

  private async postedJournals(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const out:any[]=[];
    for(const [id,ev] of g){const c=ev.find((x:any)=>x.eventType==='JOURNAL_CREATED');if(!c||!ev.some((x:any)=>x.eventType==='JOURNAL_POSTED')||ev.some((x:any)=>x.eventType==='JOURNAL_REVERSED'))continue;const p=this.p(c);if(String(p.period||'')!==period)continue;out.push({journalNo:id,...p});}return out;
  }

  private async latestReconciliations(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'BalanceSheetReconciliation'},orderBy:{createdAt:'asc'}}),m=new Map<string,any>();for(const e of rows){const p=this.p(e);if(p.period===period)m.set(e.objectId,{...p,eventId:e.id,updatedAt:e.createdAt});}return m;
  }

  async reconciliations(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),[journals,entities,branchMap,recMap]=await Promise.all([this.postedJournals(period),this.entities(),this.branchEntityMap(),this.latestReconciliations(period)]),entityMap=new Map(entities.map((x:any)=>[x.entityId,x]));
    const buckets=new Map<string,any>();
    for(const j of journals)for(const line of j.lines||[]){if(!this.balanceSheet(line.account))continue;let entityId=String(line.entityId||j.legalEntityId||j.entityId||'');if(!entityId&&line.bookingId){const b=await this.db.booking.findUnique({where:{id:String(line.bookingId)},select:{owningBranchId:true}});entityId=b?.owningBranchId?branchMap.get(String(b.owningBranchId))||'':'';}if(!entityId)entityId='UNASSIGNED';const key=`${entityId}:${String(line.account).toUpperCase()}:${j.currency||'USD'}`;if(!buckets.has(key))buckets.set(key,{reconciliationId:key,entityId,entityCode:entityMap.get(entityId)?.entityCode||entityId,account:String(line.account).toUpperCase(),currency:j.currency||'USD',debit:0,credit:0,balance:0});const x=buckets.get(key);x.debit=this.r(x.debit+Number(line.debit||0));x.credit=this.r(x.credit+Number(line.credit||0));x.balance=this.r(x.debit-x.credit);}
    return Array.from(buckets.values()).map((x:any)=>{const rec=recMap.get(`${period}:${x.reconciliationId}`);return {...x,period,status:rec?.status||'UNRECONCILED',supportReference:rec?.supportReference||null,variance:rec?.variance??null,note:rec?.note||null,reconciledBy:rec?.reconciledBy||null,reconciledAt:rec?.reconciledAt||null};}).sort((a:any,b:any)=>String(a.entityCode).localeCompare(String(b.entityCode))||String(a.account).localeCompare(String(b.account)));
  }

  async setReconciliation(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),account=this.req(b?.account,'Account').toUpperCase(),currency=this.req(b?.currency||'USD','Currency').toUpperCase(),status=String(b?.status||'RECONCILED').toUpperCase();if(!['RECONCILED','EXCEPTION','UNRECONCILED'].includes(status))throw new BadRequestException('Invalid reconciliation status');const variance=this.r(b?.variance||0);if(status==='RECONCILED'&&Math.abs(variance)>0.005)throw new BadRequestException('Reconciled balance-sheet item cannot retain variance');const objectId=`${period}:${entityId}:${account}:${currency}`,payload={period,entityId,account,currency,status,variance,supportReference:b?.supportReference?String(b.supportReference):null,note:b?.note?String(b.note):null,reconciledBy:u.sub,reconciledAt:new Date().toISOString()};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BALANCE_SHEET_RECONCILIATION_SET',externalId:objectId,objectType:'BalanceSheetReconciliation',objectId,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'BALANCE_SHEET_RECONCILIATION_SET',objectType:'BalanceSheetReconciliation',objectId,detail:payload});return payload;
  }

  private async resolvedSuspense(period:string){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'SuspenseItem',eventType:'SUSPENSE_RESOLVED'},orderBy:{createdAt:'asc'}}),m=new Map<string,any>();for(const e of rows){const p=this.p(e);if(p.period===period)m.set(e.objectId,{...p,updatedAt:e.createdAt});}return m;}
  async suspense(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),resolved=await this.resolvedSuspense(period),out:any[]=[];
    const bank:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:CREDIT,objectType:'BankTransaction'},orderBy:{createdAt:'asc'}}),bg=new Map<string,any[]>();for(const e of bank){if(!bg.has(e.objectId))bg.set(e.objectId,[]);bg.get(e.objectId)!.push(e);}for(const [id,ev] of bg){const imp=ev.find((x:any)=>x.eventType==='BANK_TRANSACTION_IMPORTED');if(!imp)continue;const p=this.p(imp);if(String(p.bookedAt||imp.createdAt).slice(0,7)!==period)continue;const rev=new Set(ev.filter((x:any)=>x.eventType==='BANK_MATCH_REVERSED').map((x:any)=>String(this.p(x).matchEventId||''))),matches=ev.filter((x:any)=>x.eventType==='BANK_TRANSACTION_MATCHED'&&!rev.has(x.id)),matched=this.r(matches.reduce((s:number,x:any)=>s+Number(this.p(x).amount||0),0)),remaining=this.r(Math.max(0,Number(p.amount||0)-matched));if(remaining>0.005){const itemId=`BANK:${id}`;if(!resolved.has(itemId))out.push({itemId,period,type:'UNALLOCATED_CASH',reference:p.bankReference||id,amount:remaining,currency:p.currency||'USD',message:'Imported bank amount remains unallocated'});}}
    const journals=await this.postedJournals(period);for(const j of journals)for(const l of j.lines||[]){const a=String(l.account||'').toUpperCase();if(!(a.includes('SUSPENSE')||a.startsWith('1999')||a.startsWith('2999')))continue;const amount=this.r(Math.abs(Number(l.debit||0)-Number(l.credit||0)));if(amount<=0.005)continue;const itemId=`GL:${j.journalNo}:${a}`;if(!resolved.has(itemId))out.push({itemId,period,type:'SUSPENSE_GL',reference:j.journalNo,amount,currency:j.currency||'USD',account:a,message:'Posted journal uses a suspense account'});}
    return out;
  }

  async resolveSuspense(periodInput:string,itemId:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),items=await this.suspense(period,u),item=items.find((x:any)=>x.itemId===itemId);if(!item)throw new NotFoundException('Open suspense item not found');const resolution=this.req(b?.resolution,'Resolution'),reference=this.req(b?.reference,'Resolution reference'),payload={period,itemId,type:item.type,resolution,reference,resolvedBy:u.sub,resolvedAt:new Date().toISOString()};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'SUSPENSE_RESOLVED',externalId:itemId,objectType:'SuspenseItem',objectId:itemId,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'SUSPENSE_RESOLVED',objectType:'SuspenseItem',objectId:itemId,detail:payload});return payload;
  }

  private async agedAp(period:string,threshold=60){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:ACC,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const out:any[]=[];
    for(const [id,ev] of g){const c=ev.find((x:any)=>x.eventType==='INVOICE_CREATED');if(!c)continue;const p=this.p(c);if(String(p.invoiceType||'').toUpperCase()!=='AP'||String(c.createdAt).slice(0,7)>period)continue;const payments=ev.filter((x:any)=>x.eventType==='PAYMENT_RECORDED'),paid=this.r(payments.reduce((s:number,x:any)=>s+Number(this.p(x).amount||0),0)),balance=this.r(Math.max(0,Number(p.totalAmount||0)-paid)),voided=ev.some((x:any)=>x.eventType==='INVOICE_VOIDED');if(voided||balance<=0.005)continue;const due=p.dueDate?new Date(p.dueDate):null,days=due?Math.max(0,Math.floor((Date.now()-due.getTime())/DAY)):0;if(days>threshold)out.push({invoiceNo:id,partyName:p.partyName||null,currency:p.currency||'USD',balance,daysOverdue:days});}return out;
  }

  private async signoffEvents(period:string){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'EntityClosePackSignoff'},orderBy:{createdAt:'asc'}}),m=new Map<string,any[]>();for(const e of rows){if(this.p(e).period!==period)continue;if(!m.has(e.objectId))m.set(e.objectId,[]);m.get(e.objectId)!.push(e);}return m;}
  async signoffs(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),entities=await this.entities(),ev=await this.signoffEvents(period),recs=await this.reconciliations(period,u),suspense=await this.suspense(period,u),aged=await this.agedAp(period);return entities.map((e:any)=>{const id=`${e.entityId}:${period}`,rows=ev.get(id)||[],req=[...rows].reverse().find((x:any)=>x.eventType==='ENTITY_CLOSE_PACK_SIGNOFF_REQUESTED'),app=[...rows].reverse().find((x:any)=>x.eventType==='ENTITY_CLOSE_PACK_SIGNOFF_APPROVED'),openRec=recs.filter((x:any)=>x.entityId===e.entityId&&x.status!=='RECONCILED'),status=app?'APPROVED':req?'REVIEW':'OPEN';return {entityId:e.entityId,entityCode:e.entityCode,entityName:e.entityName,period,status,request:req?this.p(req):null,approval:app?this.p(app):null,openReconciliations:openRec.length,openSuspense:suspense.length,agedApExceptions:aged.length,ready:openRec.length===0&&suspense.length===0&&aged.length===0};});}
  async requestSignoff(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),row=(await this.signoffs(period,u)).find((x:any)=>x.entityId===entityId);if(!row)throw new NotFoundException('Legal entity not found');if(!row.ready)throw new BadRequestException('Entity close pack still has reconciliation/suspense/AP blockers');const objectId=`${entityId}:${period}`,payload={entityId,entityCode:row.entityCode,period,requestedBy:u.sub,requestedAt:new Date().toISOString(),evidenceReference:b?.evidenceReference?String(b.evidenceReference):null,note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'ENTITY_CLOSE_PACK_SIGNOFF_REQUESTED',externalId:objectId,objectType:'EntityClosePackSignoff',objectId,status:'COMPLETED',payload,completedAt:new Date()}});return payload;
  }
  async approveSignoff(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),objectId=`${entityId}:${period}`,events=await this.signoffEvents(period),rows=events.get(objectId)||[],req=[...rows].reverse().find((x:any)=>x.eventType==='ENTITY_CLOSE_PACK_SIGNOFF_REQUESTED');if(!req)throw new BadRequestException('Close-pack signoff has not been requested');const rp=this.p(req);if(String(rp.requestedBy)===String(u.sub))throw new BadRequestException('Requester cannot approve their own close pack');const current=(await this.signoffs(period,u)).find((x:any)=>x.entityId===entityId);if(!current?.ready)throw new BadRequestException('Close pack is no longer ready');const payload={entityId,period,requesterId:rp.requestedBy,approvedBy:u.sub,approvedAt:new Date().toISOString(),note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'ENTITY_CLOSE_PACK_SIGNOFF_APPROVED',externalId:objectId,objectType:'EntityClosePackSignoff',objectId,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'ENTITY_CLOSE_PACK_SIGNOFF_APPROVED',objectType:'EntityClosePackSignoff',objectId,detail:payload});return payload;
  }

  private async groupState(period:string){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'GroupCloseCertification',objectId:period},orderBy:{createdAt:'asc'}}),req=[...rows].reverse().find((x:any)=>x.eventType==='GROUP_CLOSE_CERTIFICATION_REQUESTED'),app=[...rows].reverse().find((x:any)=>x.eventType==='GROUP_CLOSE_CERTIFIED');return {request:req?this.p(req):null,approval:app?this.p(app):null,status:app?'CERTIFIED':req?'REVIEW':'OPEN'};}
  async requestGroupCertification(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),signoffs=await this.signoffs(period,u),execution=await this.execution.dashboard(period,u);if(!signoffs.length||signoffs.some((x:any)=>x.status!=='APPROVED'))throw new BadRequestException('All legal-entity close packs must be approved first');if(!execution.ready)throw new BadRequestException('Finance close execution still has blockers');const payload={period,requestedBy:u.sub,requestedAt:new Date().toISOString(),evidenceReference:b?.evidenceReference?String(b.evidenceReference):null,note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'GROUP_CLOSE_CERTIFICATION_REQUESTED',externalId:period,objectType:'GroupCloseCertification',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});return payload;
  }
  async approveGroupCertification(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),state=await this.groupState(period);if(!state.request)throw new BadRequestException('Group close certification has not been requested');if(String(state.request.requestedBy)===String(u.sub))throw new BadRequestException('Requester cannot approve their own group certification');const signoffs=await this.signoffs(period,u),execution=await this.execution.dashboard(period,u);if(signoffs.some((x:any)=>x.status!=='APPROVED')||!execution.ready)throw new BadRequestException('Close state changed and is no longer certifiable');const payload={period,requesterId:state.request.requestedBy,approvedBy:u.sub,approvedAt:new Date().toISOString(),note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'GROUP_CLOSE_CERTIFIED',externalId:period,objectType:'GroupCloseCertification',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'GROUP_CLOSE_CERTIFIED',objectType:'GroupCloseCertification',objectId:period,detail:payload});return payload;
  }

  async dashboard(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),[reconciliations,suspense,agedAp,signoffs,execution,group]=await Promise.all([this.reconciliations(period,u),this.suspense(period,u),this.agedAp(period),this.signoffs(period,u),this.execution.dashboard(period,u),this.groupState(period)]);const recOpen=reconciliations.filter((x:any)=>x.status!=='RECONCILED');return {period,execution,group,reconciliations,suspense,agedAp,signoffs,kpis:{openReconciliations:recOpen.length,suspenseItems:suspense.length,agedApExceptions:agedAp.length,entityApproved:signoffs.filter((x:any)=>x.status==='APPROVED').length,entityTotal:signoffs.length,groupStatus:group.status},ready:execution.ready&&recOpen.length===0&&suspense.length===0&&agedAp.length===0&&signoffs.length>0&&signoffs.every((x:any)=>x.status==='APPROVED')};}
}
