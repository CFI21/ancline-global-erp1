import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { canonicalPair, collectionPriority, liquidityStatus, paymentPriority, periodOf, round2 } from './finance-automation.policy';

const SRC='ANCLINE_FINANCE_AUTOMATION', ACC='ANCLINE_ACCOUNTING', GL='ANCLINE_GL', TREAS='ANCLINE_TREASURY', CREDIT='ANCLINE_CREDIT_CONTROL', GROUP='ANCLINE_GROUP_FINANCE';
const DAY=86400000;

@Injectable()
export class FinanceAutomationService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private access(u:ScopeUser){this.scope.assertFinanceAccess(u);}
  private p(e:any){return (e?.payload||{}) as any;}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(`${n} is required`);return s;}
  private cur(v:any){const s=String(v||'USD').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(s))throw new BadRequestException('Currency must be a 3-letter code');return s;}
  private norm(v:any){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}

  private buildInvoice(rows:any[]){
    const c=rows.find((e:any)=>e.eventType==='INVOICE_CREATED');if(!c)return null;const b=this.p(c);
    const issued=rows.find((e:any)=>e.eventType==='INVOICE_ISSUED');const voided=rows.find((e:any)=>e.eventType==='INVOICE_VOIDED');
    const disputed=rows.filter((e:any)=>e.eventType==='INVOICE_DISPUTED').pop(),resolved=rows.filter((e:any)=>e.eventType==='INVOICE_RESOLVED').pop();
    const payments=rows.filter((e:any)=>e.eventType==='PAYMENT_RECORDED');const paid=round2(payments.reduce((s:number,e:any)=>s+Number(this.p(e).amount||0),0));
    const total=round2(b.totalAmount),balance=round2(Math.max(0,total-paid));let status='DRAFT';
    if(voided)status='VOID';else if(disputed&&(!resolved||new Date(disputed.createdAt)>new Date(resolved.createdAt)))status='DISPUTED';else if(balance<=0.005&&total>0)status='PAID';else if(paid>0)status='PART_PAID';else if(issued)status='ISSUED';
    const due=b.dueDate?new Date(b.dueDate):null;const daysOverdue=due&&balance>0?Math.max(0,Math.floor((Date.now()-due.getTime())/DAY)):0;
    return {invoiceNo:String(b.invoiceNo||c.objectId),invoiceType:String(b.invoiceType||'AR').toUpperCase(),bookingId:b.bookingId||null,partyId:b.partyId||null,partyName:b.partyName||null,currency:this.cur(b.currency),totalAmount:total,balanceAmount:balance,status,dueDate:due?due.toISOString():null,daysOverdue,issuedAt:issued?.createdAt||null,createdAt:c.createdAt};
  }
  private async invoices(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:ACC,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();
    for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}return Array.from(g.values()).map((x:any[])=>this.buildInvoice(x)).filter(Boolean) as any[];
  }
  private async glRefs(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'JournalEntry',eventType:'JOURNAL_CREATED'}});
    return new Set(rows.map((x:any)=>String(this.p(x).reference||'')).filter(Boolean));
  }
  private async periodClosed(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});
    return rows.length&&String(this.p(rows[rows.length-1]).status||'OPEN')==='CLOSED';
  }

  private async proposalRows(objectType:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();
    for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}return g;
  }
  async journalProposals(u:ScopeUser){
    this.access(u);const g=await this.proposalRows('JournalProposal'),out:any[]=[];
    for(const [id,rows] of g.entries()){const c=rows.find((x:any)=>x.eventType==='JOURNAL_PROPOSAL_CREATED');if(!c)continue;const exec=rows.find((x:any)=>x.eventType==='JOURNAL_PROPOSAL_EXECUTED'),cancel=rows.find((x:any)=>x.eventType==='JOURNAL_PROPOSAL_CANCELLED');out.push({proposalId:id,...this.p(c),status:cancel?'CANCELLED':exec?'EXECUTED':'PROPOSED',journalNo:exec?this.p(exec).journalNo:null,createdAt:c.createdAt,executedAt:exec?.createdAt||null});}
    return out.sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  }
  async scanJournalCandidates(u:ScopeUser){
    this.access(u);const [invoices,refs,existing]=await Promise.all([this.invoices(),this.glRefs(),this.journalProposals(u)]),exists=new Set(existing.filter((x:any)=>x.status!=='CANCELLED').map((x:any)=>x.invoiceNo));
    const created:any[]=[];
    for(const inv of invoices.filter((x:any)=>['ISSUED','PART_PAID','DISPUTED'].includes(x.status)&&x.totalAmount>0&&x.issuedAt)){
      if(refs.has(`INVOICE:${inv.invoiceNo}:ISSUE`)||refs.has(`AUTOJOURNAL:${inv.invoiceNo}`)||exists.has(inv.invoiceNo))continue;
      const period=periodOf(inv.issuedAt),proposalId=`AJP-${inv.invoiceNo.replace(/[^A-Z0-9]/gi,'').slice(-24).toUpperCase()}`,amount=round2(inv.totalAmount);
      const lines=inv.invoiceType==='AR'?[{account:'1200-ACCOUNTS-RECEIVABLE',debit:amount,credit:0,partyId:inv.partyId,bookingId:inv.bookingId},{account:'4000-FREIGHT-REVENUE',debit:0,credit:amount,partyId:inv.partyId,bookingId:inv.bookingId}]:[{account:'5000-DIRECT-COST',debit:amount,credit:0,partyId:inv.partyId,bookingId:inv.bookingId},{account:'2000-ACCOUNTS-PAYABLE',debit:0,credit:amount,partyId:inv.partyId,bookingId:inv.bookingId}];
      const payload={proposalId,invoiceNo:inv.invoiceNo,invoiceType:inv.invoiceType,bookingId:inv.bookingId,partyId:inv.partyId,partyName:inv.partyName,currency:inv.currency,amount,period,journalDate:inv.issuedAt,reference:`AUTOJOURNAL:${inv.invoiceNo}`,lines,createdBy:u.sub};
      await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'JOURNAL_PROPOSAL_CREATED',externalId:proposalId,objectType:'JournalProposal',objectId:proposalId,status:'COMPLETED',payload,completedAt:new Date()}});created.push(payload);
    }
    await this.audit.log({actorId:u.sub,action:'FINANCE_AUTOMATION_JOURNAL_SCAN',objectType:'JournalProposal',objectId:'SCAN',detail:{created:created.length}});return {createdCount:created.length,created};
  }
  async executeJournalProposal(id:string,u:ScopeUser){
    this.access(u);const p=(await this.journalProposals(u)).find((x:any)=>x.proposalId===id);if(!p)throw new NotFoundException('Journal proposal not found');if(p.status==='EXECUTED')return p;if(p.status!=='PROPOSED')throw new BadRequestException(`Proposal cannot execute from ${p.status}`);if(p.createdBy===u.sub)throw new BadRequestException('Maker-checker: proposal creator cannot execute the journal');if(await this.periodClosed(p.period))throw new BadRequestException(`Period ${p.period} is closed`);
    const refs=await this.glRefs();if(refs.has(p.reference))throw new BadRequestException('Journal reference already posted');const clean=id.replace(/[^A-Z0-9]/gi,'').slice(-18),journalNo=`AJ-${p.period.replace('-','')}-${clean}`;
    const journal={journalNo,journalDate:p.journalDate,period:p.period,currency:p.currency,description:`Automated invoice journal ${p.invoiceNo}`,reference:p.reference,source:'FINANCE_AUTOMATION',lines:p.lines,totalDebit:p.amount,totalCredit:p.amount};
    const now=new Date();await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:GL,eventType:'JOURNAL_CREATED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:journal,completedAt:now}}),
      this.db.integrationEvent.create({data:{sourceSystem:GL,eventType:'JOURNAL_POSTED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:{journalNo,postedBy:u.sub,automated:true,sourceReference:p.reference},completedAt:now}}),
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'JOURNAL_PROPOSAL_EXECUTED',externalId:id,objectType:'JournalProposal',objectId:id,status:'COMPLETED',payload:{proposalId:id,journalNo,executedBy:u.sub},completedAt:now}})
    ]);await this.audit.log({actorId:u.sub,action:'FINANCE_AUTOMATION_JOURNAL_EXECUTE',objectType:'JournalProposal',objectId:id,bookingId:p.bookingId,detail:{journalNo,invoiceNo:p.invoiceNo,amount:p.amount,currency:p.currency}});return {...p,status:'EXECUTED',journalNo};
  }

  async paymentProposals(currency:string|undefined,u:ScopeUser){
    this.access(u);const now=Date.now(),cur=currency?this.cur(currency):null,inv=await this.invoices();
    return inv.filter((x:any)=>x.invoiceType==='AP'&&['ISSUED','PART_PAID'].includes(x.status)&&x.balanceAmount>0&&(!cur||x.currency===cur)).map((x:any)=>{const daysUntilDue=x.dueDate?Math.ceil((new Date(x.dueDate).getTime()-now)/DAY):999;return {...x,daysUntilDue,priorityScore:paymentPriority(daysUntilDue,x.balanceAmount),recommendation:daysUntilDue<0?'PAY_NOW':daysUntilDue<=7?'SCHEDULE_NOW':daysUntilDue<=30?'PLAN':'HOLD'};}).sort((a:any,b:any)=>b.priorityScore-a.priorityScore||b.balanceAmount-a.balanceAmount);
  }
  async generatePaymentProposal(b:any,u:ScopeUser){
    this.access(u);const currency=this.cur(b?.currency),maxAmount=Number(b?.maxAmount||0);if(!Number.isFinite(maxAmount)||maxAmount<=0)throw new BadRequestException('Max amount must be greater than zero');const rows=await this.paymentProposals(currency,u);let total=0;const items:any[]=[];for(const r of rows){if(total+r.balanceAmount>maxAmount+0.005)continue;items.push({invoiceNo:r.invoiceNo,partyId:r.partyId,partyName:r.partyName,dueDate:r.dueDate,amount:r.balanceAmount,priorityScore:r.priorityScore});total=round2(total+r.balanceAmount);}const proposalId=`PAYP-${Date.now().toString().slice(-10)}`,payload={proposalId,currency,maxAmount:round2(maxAmount),totalAmount:total,items,createdBy:u.sub,notes:b?.notes?String(b.notes):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'PAYMENT_PROPOSAL_CREATED',externalId:proposalId,objectType:'PaymentProposal',objectId:proposalId,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'FINANCE_AUTOMATION_PAYMENT_PROPOSAL',objectType:'PaymentProposal',objectId:proposalId,detail:{currency,totalAmount:total,count:items.length}});return payload;
  }

  async collectionPriorities(u:ScopeUser){
    this.access(u);const [inv,actions]=await Promise.all([this.invoices(),this.db.integrationEvent.findMany({where:{sourceSystem:CREDIT,objectType:'CollectionCase',eventType:'COLLECTION_ACTION'},orderBy:{createdAt:'asc'}})]),last=new Map<string,any>();for(const a of actions)last.set(a.objectId,this.p(a));
    return inv.filter((x:any)=>x.invoiceType==='AR'&&['ISSUED','PART_PAID','DISPUTED'].includes(x.status)&&x.balanceAmount>0).map((x:any)=>{const a=last.get(x.invoiceNo),breach=Boolean(a?.action==='PROMISE_TO_PAY'&&a?.promiseDate&&new Date(a.promiseDate).getTime()<Date.now());const pr=collectionPriority(Number(x.daysOverdue||0),x.status,breach);return {...x,...pr,promiseBreached:breach,lastAction:a||null,recommendedAction:pr.priority==='CRITICAL'?'ESCALATE':pr.priority==='HIGH'?'CONTACT_TODAY':pr.priority==='MEDIUM'?'FOLLOW_UP':'MONITOR'};}).sort((a:any,b:any)=>b.score-a.score||b.balanceAmount-a.balanceAmount);
  }

  private async bankAccounts(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:TREAS,objectType:'BankAccount',eventType:'BANK_ACCOUNT_SET'},orderBy:{createdAt:'asc'}}),m=new Map<string,any>();for(const e of rows)m.set(e.objectId,{accountId:e.objectId,...this.p(e)});return Array.from(m.values());
  }
  private async bankMovements(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:CREDIT,objectType:'BankTransaction',eventType:'BANK_TRANSACTION_IMPORTED'},orderBy:{createdAt:'asc'}});
    return rows.map((e:any)=>({...this.p(e),createdAt:e.createdAt}));
  }
  private async approvedRuns(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:TREAS,objectType:'PaymentRun'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const out:any[]=[];for(const [id,ev] of g.entries()){const c=ev.find((x:any)=>x.eventType==='PAYMENT_RUN_CREATED'),a=ev.find((x:any)=>x.eventType==='PAYMENT_RUN_APPROVED'),p=ev.find((x:any)=>x.eventType==='PAYMENT_RUN_POSTED'),x=ev.find((x:any)=>x.eventType==='PAYMENT_RUN_CANCELLED');if(c&&a&&!p&&!x)out.push({runNo:id,...this.p(c)});}return out;
  }
  async liquidityAlerts(u:ScopeUser){
    this.access(u);const [accounts,moves,runs]=await Promise.all([this.bankAccounts(),this.bankMovements(),this.approvedRuns()]),out:any[]=[];
    for(const a of accounts.filter((x:any)=>x.active!==false)){const keys=[a.accountId,a.accountReference,a.iban].map((x:any)=>this.norm(x)).filter(Boolean);const movement=round2(moves.filter((x:any)=>x.currency===a.currency&&keys.includes(this.norm(x.account))).reduce((s:number,x:any)=>s+(String(x.direction).toUpperCase()==='CREDIT'?Number(x.amount||0):-Number(x.amount||0)),0));const statement=round2(Number(a.openingBalance||0)+movement),committed=round2(runs.filter((r:any)=>r.bankAccountId===a.accountId).reduce((s:number,r:any)=>s+Number(r.totalAmount||0),0)),projected=round2(statement-committed),status=liquidityStatus(projected,Number(a.minimumCash||0),Number(a.overdraftLimit||0));out.push({accountId:a.accountId,bankName:a.bankName,accountName:a.accountName,currency:a.currency,statementBalance:statement,committedPayments:committed,projectedBalance:projected,minimumCash:Number(a.minimumCash||0),overdraftLimit:Number(a.overdraftLimit||0),status,shortfall:status==='OK'?0:round2(Math.max(0,Number(a.minimumCash||0)-projected))});}return out.sort((a:any,b:any)=>({BREACH:0,LOW:1,OK:2} as any)[a.status]-({BREACH:0,LOW:1,OK:2} as any)[b.status]);
  }
  async scanLiquidity(u:ScopeUser){
    this.access(u);const alerts=(await this.liquidityAlerts(u)).filter((x:any)=>x.status!=='OK'),created:any[]=[];const date=new Date().toISOString().slice(0,10);
    for(const a of alerts){const id=`${date}:${a.accountId}:${a.status}`;const ex=await this.db.integrationEvent.findFirst({where:{sourceSystem:SRC,objectType:'LiquidityAlert',objectId:id}});if(ex)continue;await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'LIQUIDITY_ALERT_RAISED',externalId:a.accountId,objectType:'LiquidityAlert',objectId:id,status:'COMPLETED',payload:{...a,raisedBy:u.sub},completedAt:new Date()}});created.push(a);}
    await this.audit.log({actorId:u.sub,action:'FINANCE_AUTOMATION_LIQUIDITY_SCAN',objectType:'LiquidityAlert',objectId:date,detail:{created:created.length}});return {createdCount:created.length,alerts};
  }

  private async intercompanyRows(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GROUP,objectType:'IntercompanyTransaction'},orderBy:{createdAt:'asc'}}),g=new Map<string,any[]>();for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const out:any[]=[];for(const [id,ev] of g.entries()){const c=ev.find((x:any)=>x.eventType==='INTERCOMPANY_CREATED'),p=ev.find((x:any)=>x.eventType==='INTERCOMPANY_POSTED');if(c&&p)out.push({transactionNo:id,...this.p(c),status:'POSTED'});}return out;
  }
  async intercompanyNetting(periodInput:string|undefined,u:ScopeUser){
    this.access(u);const period=periodInput||new Date().toISOString().slice(0,7);if(!/^\d{4}-\d{2}$/.test(period))throw new BadRequestException('Period must be YYYY-MM');const rows=(await this.intercompanyRows()).filter((x:any)=>x.period===period),m=new Map<string,any>();
    for(const x of rows){const [a,b]=canonicalPair(String(x.fromEntityId),String(x.toEntityId)),key=`${period}:${x.currency}:${a}:${b}`;if(!m.has(key))m.set(key,{pairKey:key,period,currency:x.currency,entityA:a,entityB:b,aToB:0,bToA:0,transactions:0});const r=m.get(key);if(x.fromEntityId===a)r.aToB=round2(r.aToB+Number(x.amount||0));else r.bToA=round2(r.bToA+Number(x.amount||0));r.transactions++;}
    return Array.from(m.values()).map((r:any)=>{const net=round2(r.aToB-r.bToA);return {...r,netAmount:Math.abs(net),netFrom:net>=0?r.entityA:r.entityB,netTo:net>=0?r.entityB:r.entityA,status:Math.abs(net)<=0.005?'SETTLED':'NETTABLE'};}).sort((a:any,b:any)=>b.netAmount-a.netAmount);
  }
  async createNettingProposal(b:any,u:ScopeUser){
    this.access(u);const period=this.req(b?.period,'Period'),currency=this.cur(b?.currency),from=this.req(b?.netFrom,'Net from'),to=this.req(b?.netTo,'Net to'),amount=round2(b?.netAmount);if(amount<=0)throw new BadRequestException('Net amount must be greater than zero');if(from===to)throw new BadRequestException('Netting entities must differ');const proposalId=`NET-${period.replace('-','')}-${Date.now().toString().slice(-7)}`,payload={proposalId,period,currency,netFrom:from,netTo:to,netAmount:amount,createdBy:u.sub,notes:b?.notes?String(b.notes):null};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'NETTING_PROPOSAL_CREATED',externalId:proposalId,objectType:'NettingProposal',objectId:proposalId,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'FINANCE_AUTOMATION_NETTING_PROPOSE',objectType:'NettingProposal',objectId:proposalId,detail:payload});return {...payload,status:'PROPOSED'};
  }
  async approveNettingProposal(id:string,u:ScopeUser){
    this.access(u);const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'NettingProposal',objectId:id},orderBy:{createdAt:'asc'}}),c=rows.find((x:any)=>x.eventType==='NETTING_PROPOSAL_CREATED');if(!c)throw new NotFoundException('Netting proposal not found');const p=this.p(c);if(p.createdBy===u.sub)throw new BadRequestException('Maker-checker: proposal creator cannot approve netting');if(rows.some((x:any)=>x.eventType==='NETTING_PROPOSAL_APPROVED'))return {...p,status:'APPROVED'};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'NETTING_PROPOSAL_APPROVED',externalId:id,objectType:'NettingProposal',objectId:id,status:'COMPLETED',payload:{proposalId:id,approvedBy:u.sub},completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'FINANCE_AUTOMATION_NETTING_APPROVE',objectType:'NettingProposal',objectId:id,detail:{netAmount:p.netAmount,currency:p.currency}});return {...p,status:'APPROVED'};
  }

  async dashboard(u:ScopeUser){
    this.access(u);const [journals,payments,collections,liquidity,netting]=await Promise.all([this.journalProposals(u),this.paymentProposals(undefined,u),this.collectionPriorities(u),this.liquidityAlerts(u),this.intercompanyNetting(undefined,u)]);
    return {journalProposals:journals.filter((x:any)=>x.status==='PROPOSED').length,journalsExecuted:journals.filter((x:any)=>x.status==='EXECUTED').length,paymentCandidates:payments.length,criticalCollections:collections.filter((x:any)=>x.priority==='CRITICAL').length,liquidityAlerts:liquidity.filter((x:any)=>x.status!=='OK').length,nettingPairs:netting.filter((x:any)=>x.status==='NETTABLE').length,paymentExposureByCurrency:Array.from(payments.reduce((m:Map<string,number>,x:any)=>m.set(x.currency,round2((m.get(x.currency)||0)+x.balanceAmount)),new Map<string,number>()).entries()).map(([currency,amount])=>({currency,amount}))};
  }
}
