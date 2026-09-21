import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SRC='ANCLINE_FINANCE_CLOSE_PACK';
const GL='ANCLINE_GL';
const ACC='ANCLINE_ACCOUNTING';
const STAT='ANCLINE_STATUTORY_FINANCE';
const DAY=86400000;

@Injectable()
export class FinanceClosePackService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private access(u:ScopeUser){this.scope.assertFinanceAccess(u);}
  private p(e:any){return (e?.payload||{}) as any;}
  private r(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(`${n} is required`);return s;}
  private period(v:any){const s=String(v||'');if(!/^\d{4}-\d{2}$/.test(s))throw new BadRequestException('Period must be YYYY-MM');return s;}

  private async entities(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:STAT,objectType:'LegalEntity',eventType:'LEGAL_ENTITY_SET'},orderBy:{createdAt:'asc'}});
    const m=new Map<string,any>();for(const e of rows)m.set(e.objectId,{entityId:e.objectId,...this.p(e)});return Array.from(m.values()).filter((x:any)=>x.active!==false);
  }
  private async entity(entityId:string){const e=(await this.entities()).find((x:any)=>x.entityId===entityId);if(!e)throw new NotFoundException('Legal entity not found');return e;}

  private async journalRows(period:string){
    const ev:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();
    for(const x of ev){if(!g.has(x.objectId))g.set(x.objectId,[]);g.get(x.objectId)!.push(x);}
    return Array.from(g.values()).map((rows:any[])=>{const c=rows.find(x=>x.eventType==='JOURNAL_CREATED');if(!c)return null;const p=this.p(c);return {...p,journalNo:c.objectId,status:rows.some(x=>x.eventType==='JOURNAL_REVERSED')?'REVERSED':rows.some(x=>x.eventType==='JOURNAL_POSTED')?'POSTED':'DRAFT'};}).filter((x:any)=>x&&x.period===period);
  }
  private async branchToEntity(){const m=new Map<string,string>();for(const e of await this.entities())for(const b of e.branchIds||[])m.set(String(b),e.entityId);return m;}
  private async bookingEntityMap(){
    const b:any[]=await this.db.booking.findMany({select:{id:true,owningBranchId:true}}),be=await this.branchToEntity(),m=new Map<string,string|null>();for(const x of b)m.set(x.id,x.owningBranchId?be.get(String(x.owningBranchId))||null:null);return m;
  }
  private resolveEntity(j:any,bookingMap:Map<string,string|null>){
    const explicit=j.legalEntityId||j.entityId;if(explicit)return String(explicit);
    for(const l of j.lines||[]){if(l.entityId)return String(l.entityId);if(l.bookingId&&bookingMap.get(String(l.bookingId)))return bookingMap.get(String(l.bookingId))!;}return null;
  }
  private classify(account:string){const a=String(account||'').toUpperCase();if(a.startsWith('1'))return 'ASSET';if(a.startsWith('2'))return 'LIABILITY';if(a.startsWith('3'))return 'EQUITY';if(a.startsWith('4'))return 'REVENUE';if(a.startsWith('5')||a.startsWith('6')||a.startsWith('7')||a.startsWith('8'))return 'EXPENSE';return 'OTHER';}

  private async balanceSheet(entityId:string,period:string){
    const [journals,bm]=await Promise.all([this.journalRows(period),this.bookingEntityMap()]),map=new Map<string,any>();
    for(const j of journals.filter((x:any)=>x.status==='POSTED'&&this.resolveEntity(x,bm)===entityId))for(const l of j.lines||[]){const cls=this.classify(l.account);if(!['ASSET','LIABILITY','EQUITY'].includes(cls))continue;const key=`${j.currency}:${l.account}`;if(!map.has(key))map.set(key,{account:l.account,currency:j.currency,class:cls,debit:0,credit:0,balance:0});const x=map.get(key);x.debit=this.r(x.debit+Number(l.debit||0));x.credit=this.r(x.credit+Number(l.credit||0));x.balance=this.r(x.debit-x.credit);}
    return Array.from(map.values()).sort((a:any,b:any)=>a.account.localeCompare(b.account));
  }

  private async reconciliationMap(entityId:string,period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'BalanceSheetReconciliation'},orderBy:{createdAt:'asc'}}),m=new Map<string,any>();
    for(const e of rows){const p=this.p(e);if(p.entityId===entityId&&p.period===period)m.set(String(p.account),{...p,eventId:e.id,updatedAt:e.createdAt});}return m;
  }
  private async suspense(entityId:string,period:string){
    const bs=await this.balanceSheet(entityId,period),resRows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'SuspenseResolution',eventType:'SUSPENSE_RESOLVED'},orderBy:{createdAt:'asc'}}),resolved=new Set(resRows.filter((x:any)=>{const p=this.p(x);return p.entityId===entityId&&p.period===period;}).map((x:any)=>String(this.p(x).account)));
    return bs.filter((x:any)=>String(x.account).includes('SUSPENSE')||String(x.account).startsWith('999')).map((x:any)=>({...x,resolved:resolved.has(String(x.account))}));
  }

  private buildInvoice(rows:any[]){
    const c=rows.find((x:any)=>x.eventType==='INVOICE_CREATED');if(!c)return null;const p=this.p(c),payments=rows.filter((x:any)=>x.eventType==='PAYMENT_RECORDED'),paid=this.r(payments.reduce((s:number,x:any)=>s+Number(this.p(x).amount||0),0)),total=this.r(p.totalAmount),balance=this.r(Math.max(0,total-paid)),issued=rows.some((x:any)=>x.eventType==='INVOICE_ISSUED'),voided=rows.some((x:any)=>x.eventType==='INVOICE_VOIDED');const due=p.dueDate?new Date(p.dueDate):null,days=due&&balance>0?Math.max(0,Math.floor((Date.now()-due.getTime())/DAY)):0;return {invoiceNo:c.objectId,invoiceType:String(p.invoiceType||'AR').toUpperCase(),bookingId:p.bookingId?String(p.bookingId):null,partyName:p.partyName||null,currency:p.currency||'USD',balance,daysOverdue:days,status:voided?'VOID':issued?'ISSUED':'DRAFT',createdAt:c.createdAt};
  }
  private async agedAP(entityId:string,period:string){
    const ev:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:ACC,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();for(const x of ev){if(!g.has(x.objectId))g.set(x.objectId,[]);g.get(x.objectId)!.push(x);}
    const bookingMap=await this.bookingEntityMap();return Array.from(g.values()).map((x:any[])=>this.buildInvoice(x)).filter((x:any)=>x&&x.invoiceType==='AP'&&x.balance>0&&x.status!=='VOID'&&String(x.createdAt).slice(0,7)<=period&&x.daysOverdue>30&&x.bookingId&&bookingMap.get(String(x.bookingId))===entityId).sort((a:any,b:any)=>b.daysOverdue-a.daysOverdue);
  }

  private async signoffState(entityId:string,period:string){
    const id=`${entityId}:${period}`,rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'EntityClosePackSignoff',objectId:id},orderBy:{createdAt:'asc'}}),req=[...rows].reverse().find(x=>x.eventType==='ENTITY_CLOSE_PACK_SIGNOFF_REQUESTED'),app=[...rows].reverse().find(x=>x.eventType==='ENTITY_CLOSE_PACK_SIGNOFF_APPROVED');return {request:req?this.p(req):null,approval:app?this.p(app):null,status:app?'APPROVED':req?'REVIEW':'OPEN'};
  }

  async entityPack(entityId:string,periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),entity=await this.entity(entityId),[bs,recs,suspense,agedAP,signoff]=await Promise.all([this.balanceSheet(entityId,period),this.reconciliationMap(entityId,period),this.suspense(entityId,period),this.agedAP(entityId,period),this.signoffState(entityId,period)]);
    const reconciliations=bs.map((x:any)=>({...x,reconciliation:recs.get(String(x.account))||null,status:recs.get(String(x.account))?.status||'UNRECONCILED'})),unreconciled=reconciliations.filter((x:any)=>x.status!=='RECONCILED'),openSuspense=suspense.filter((x:any)=>!x.resolved&&Math.abs(Number(x.balance||0))>0.005);
    const blockers=[...unreconciled.map((x:any)=>({type:'BALANCE_SHEET_UNRECONCILED',objectId:x.account,message:'Balance-sheet account is not reconciled'})),...openSuspense.map((x:any)=>({type:'SUSPENSE_OPEN',objectId:x.account,message:'Suspense account still has an unresolved balance'})),...agedAP.filter((x:any)=>x.daysOverdue>90).map((x:any)=>({type:'AGED_AP_90_PLUS',objectId:x.invoiceNo,message:`AP invoice is ${x.daysOverdue} days overdue`}))];
    return {entityId,entityCode:entity.entityCode,entityName:entity.entityName,period,reconciliations,suspense,agedAP,signoff,ready:blockers.length===0,blockers};
  }

  async setReconciliation(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);await this.entity(entityId);const account=this.req(b?.account,'Account'),status=String(b?.status||'RECONCILED').toUpperCase();if(!['RECONCILED','EXCEPTION'].includes(status))throw new BadRequestException('Status must be RECONCILED or EXCEPTION');const payload={entityId,period,account,status,sourceReference:b?.sourceReference?String(b.sourceReference):null,note:b?.note?String(b.note):null,reconciledBy:u.sub,reconciledAt:new Date().toISOString()};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'BALANCE_SHEET_RECONCILIATION_SET',externalId:`${entityId}:${period}:${account}`,objectType:'BalanceSheetReconciliation',objectId:`${entityId}:${period}:${account}`,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'BALANCE_SHEET_RECONCILIATION_SET',objectType:'BalanceSheetReconciliation',objectId:`${entityId}:${period}:${account}`,detail:payload});return payload;
  }
  async resolveSuspense(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);await this.entity(entityId);const account=this.req(b?.account,'Account'),reason=this.req(b?.reason,'Resolution reason'),payload={entityId,period,account,reason,journalReference:b?.journalReference?String(b.journalReference):null,resolvedBy:u.sub,resolvedAt:new Date().toISOString()};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'SUSPENSE_RESOLVED',externalId:`${entityId}:${period}:${account}`,objectType:'SuspenseResolution',objectId:`${entityId}:${period}:${account}`,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'SUSPENSE_RESOLVED',objectType:'SuspenseResolution',objectId:`${entityId}:${period}:${account}`,detail:payload});return payload;
  }

  async requestEntitySignoff(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),pack=await this.entityPack(entityId,period,u);if(!pack.ready)throw new BadRequestException(`Entity close pack has ${pack.blockers.length} blocker(s)`);const id=`${entityId}:${period}`,payload={entityId,period,requestedBy:u.sub,requestedAt:new Date().toISOString(),evidenceReference:b?.evidenceReference?String(b.evidenceReference):null,note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'ENTITY_CLOSE_PACK_SIGNOFF_REQUESTED',externalId:id,objectType:'EntityClosePackSignoff',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});return payload;
  }
  async approveEntitySignoff(entityId:string,periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),id=`${entityId}:${period}`,state=await this.signoffState(entityId,period);if(!state.request)throw new BadRequestException('Entity close-pack signoff has not been requested');if(String(state.request.requestedBy)===String(u.sub))throw new BadRequestException('Requester cannot approve their own close pack');const pack=await this.entityPack(entityId,period,u);if(!pack.ready)throw new BadRequestException('Entity close pack is no longer ready');const payload={entityId,period,approvedBy:u.sub,approvedAt:new Date().toISOString(),requesterId:state.request.requestedBy,evidenceReference:b?.evidenceReference||state.request.evidenceReference||null,note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'ENTITY_CLOSE_PACK_SIGNOFF_APPROVED',externalId:id,objectType:'EntityClosePackSignoff',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'ENTITY_CLOSE_PACK_SIGNOFF_APPROVED',objectType:'EntityClosePackSignoff',objectId:id,detail:payload});return payload;
  }

  private async groupState(period:string){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'GroupCloseCertification',objectId:period},orderBy:{createdAt:'asc'}}),req=[...rows].reverse().find(x=>x.eventType==='GROUP_CLOSE_CERTIFICATION_REQUESTED'),app=[...rows].reverse().find(x=>x.eventType==='GROUP_CLOSE_CERTIFIED');return {request:req?this.p(req):null,approval:app?this.p(app):null,status:app?'CERTIFIED':req?'REVIEW':'OPEN'};}
  async requestGroupCertification(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),packs=await Promise.all((await this.entities()).map((e:any)=>this.entityPack(e.entityId,period,u)));if(packs.some((x:any)=>x.signoff.status!=='APPROVED'))throw new BadRequestException('All legal-entity close packs must be approved before group certification');const payload={period,requestedBy:u.sub,requestedAt:new Date().toISOString(),evidenceReference:b?.evidenceReference?String(b.evidenceReference):null,note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'GROUP_CLOSE_CERTIFICATION_REQUESTED',externalId:period,objectType:'GroupCloseCertification',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});return payload;
  }
  async approveGroupCertification(periodInput:string,b:any,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),state=await this.groupState(period);if(!state.request)throw new BadRequestException('Group certification has not been requested');if(String(state.request.requestedBy)===String(u.sub))throw new BadRequestException('Requester cannot approve their own group certification');const packs=await Promise.all((await this.entities()).map((e:any)=>this.entityPack(e.entityId,period,u)));if(packs.some((x:any)=>x.signoff.status!=='APPROVED'))throw new BadRequestException('Entity signoff is incomplete');const payload={period,certifiedBy:u.sub,certifiedAt:new Date().toISOString(),requesterId:state.request.requestedBy,evidenceReference:b?.evidenceReference||state.request.evidenceReference||null,note:b?.note?String(b.note):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'GROUP_CLOSE_CERTIFIED',externalId:period,objectType:'GroupCloseCertification',objectId:period,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'GROUP_CLOSE_CERTIFIED',objectType:'GroupCloseCertification',objectId:period,detail:payload});return payload;
  }

  async dashboard(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput),entities=await this.entities(),packs=await Promise.all(entities.map((e:any)=>this.entityPack(e.entityId,period,u))),group=await this.groupState(period);return {period,group,entityCount:entities.length,readyEntities:packs.filter((x:any)=>x.ready).length,approvedEntityPacks:packs.filter((x:any)=>x.signoff.status==='APPROVED').length,totalBlockers:packs.reduce((s:number,x:any)=>s+x.blockers.length,0),entities:packs.map((x:any)=>({entityId:x.entityId,entityCode:x.entityCode,entityName:x.entityName,ready:x.ready,blockers:x.blockers.length,unreconciled:x.reconciliations.filter((r:any)=>r.status!=='RECONCILED').length,openSuspense:x.suspense.filter((s:any)=>!s.resolved).length,agedAP90:x.agedAP.filter((a:any)=>a.daysOverdue>90).length,signoffStatus:x.signoff.status}))};
  }
}
