import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const DAY=24*60*60*1000;
const SOURCE='ANCLINE_CREDIT_CONTROL';
const ACCOUNTING_SOURCE='ANCLINE_ACCOUNTING';
const invoiceControls=['INVOICE_DISPUTED','INVOICE_RESOLVED','INVOICE_VOIDED'];

@Injectable()
export class CreditControlService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private access(user:ScopeUser){ this.scope.assertFinanceAccess(user); }
  private round(value:number){ return Math.round((Number(value||0)+Number.EPSILON)*100)/100; }
  private payload(event:any){ return (event?.payload||{}) as any; }
  private required(value:any,name:string){
    const text=String(value??'').trim();
    if(!text) throw new BadRequestException(`${name} is required`);
    return text;
  }
  private date(value:any,name:string){
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) throw new BadRequestException(`${name} must be a valid date`);
    return d;
  }
  private money(value:any,name:string,allowZero=false){
    const n=Number(value);
    if(!Number.isFinite(n)||(allowZero?n<0:n<=0)) throw new BadRequestException(`${name} must be ${allowZero?'zero or greater':'greater than zero'}`);
    return this.round(n);
  }
  private norm(value:any){ return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

  private buildInvoice(events:any[]){
    const created=events.find(e=>e.eventType==='INVOICE_CREATED');
    if(!created) return null;
    const base=this.payload(created);
    const payments=events.filter(e=>e.eventType==='PAYMENT_RECORDED').map(e=>({id:e.id,...this.payload(e),createdAt:e.createdAt}));
    const paidAmount=this.round(payments.reduce((sum:number,p:any)=>sum+Number(p.amount||0),0));
    const totalAmount=this.round(Number(base.totalAmount||0));
    const balanceAmount=this.round(Math.max(0,totalAmount-paidAmount));
    const issued=events.find(e=>e.eventType==='INVOICE_ISSUED');
    const controls=events.filter(e=>invoiceControls.includes(e.eventType));
    const latestControl=controls.length?controls[controls.length-1]:null;
    let status='DRAFT';
    if(latestControl?.eventType==='INVOICE_VOIDED') status='VOID';
    else if(latestControl?.eventType==='INVOICE_DISPUTED') status='DISPUTED';
    else if(balanceAmount<=0.005&&totalAmount>0) status='PAID';
    else if(paidAmount>0) status='PART_PAID';
    else if(issued) status='ISSUED';
    const dueDate=base.dueDate?new Date(base.dueDate):null;
    const daysOverdue=dueDate&&balanceAmount>0&&!['DRAFT','PAID','VOID'].includes(status)
      ?Math.max(0,Math.floor((Date.now()-dueDate.getTime())/DAY)):0;
    return {
      invoiceNo:String(base.invoiceNo||created.objectId),invoiceType:String(base.invoiceType||'AR'),
      bookingId:String(base.bookingId||''),bookingNo:String(base.bookingNo||''),partyId:base.partyId||null,partyName:base.partyName||null,
      currency:String(base.currency||'USD').toUpperCase(),totalAmount,paidAmount,balanceAmount,status,
      dueDate:dueDate?dueDate.toISOString():null,daysOverdue,reference:base.reference||null,createdAt:created.createdAt
    };
  }

  private async invoices(){
    const events=await this.prisma.integrationEvent.findMany({
      where:{sourceSystem:ACCOUNTING_SOURCE,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}
    });
    const grouped=new Map<string,any[]>();
    for(const event of events){
      if(!grouped.has(event.objectId)) grouped.set(event.objectId,[]);
      grouped.get(event.objectId)!.push(event);
    }
    return Array.from(grouped.values()).map(rows=>this.buildInvoice(rows)).filter(Boolean) as any[];
  }

  private async profiles(){
    const events=await this.prisma.integrationEvent.findMany({
      where:{sourceSystem:SOURCE,objectType:'CreditProfile',eventType:'CREDIT_PROFILE_SET'},orderBy:{createdAt:'asc'}
    });
    const map=new Map<string,any>();
    for(const event of events) map.set(event.objectId,{...this.payload(event),partyId:event.objectId,updatedAt:event.createdAt,eventId:event.id});
    return map;
  }

  private decision(profile:any,exposures:any[],maxDaysOverdue:number){
    if(!profile) return 'REVIEW_REQUIRED';
    if(profile.creditHold||String(profile.riskRating||'').toUpperCase()==='RESTRICTED') return 'HOLD';
    const creditCurrency=String(profile.creditCurrency||'USD').toUpperCase();
    const home=exposures.find(x=>x.currency===creditCurrency)?.outstanding||0;
    const other=exposures.filter(x=>x.currency!==creditCurrency&&x.outstanding>0);
    if(profile.creditLimit!=null&&Number(profile.creditLimit)>=0&&home-Number(profile.creditLimit)>0.005) return 'OVER_LIMIT';
    if(maxDaysOverdue>=Number(profile.overdueHoldDays??60)) return 'OVERDUE_HOLD';
    if(other.length) return 'MULTI_CURRENCY_REVIEW';
    return 'CLEAR';
  }

  async customers(user:ScopeUser){
    this.access(user);
    const [invoices,profiles,organizations]=await Promise.all([
      this.invoices(),this.profiles(),this.prisma.organization.findMany({where:{active:true,roles:{has:'CUSTOMER' as any}},orderBy:{name:'asc'}})
    ]);
    const open=invoices.filter(i=>i.invoiceType==='AR'&&['ISSUED','PART_PAID','DISPUTED'].includes(i.status)&&i.balanceAmount>0);
    const rows:any[]=[];
    for(const org of organizations){
      const partyInvoices=open.filter(i=>i.partyId===org.id);
      const currencies=[...new Set(partyInvoices.map(i=>i.currency))];
      const exposures=currencies.map(currency=>({
        currency,
        outstanding:this.round(partyInvoices.filter(i=>i.currency===currency).reduce((s,i)=>s+i.balanceAmount,0)),
        overdue:this.round(partyInvoices.filter(i=>i.currency===currency&&i.daysOverdue>0).reduce((s,i)=>s+i.balanceAmount,0))
      }));
      const profile=profiles.get(org.id)||null;
      const maxDaysOverdue=partyInvoices.reduce((m,i)=>Math.max(m,Number(i.daysOverdue||0)),0);
      const decision=this.decision(profile,exposures,maxDaysOverdue);
      const creditCurrency=String(profile?.creditCurrency||exposures[0]?.currency||'USD').toUpperCase();
      const exposure=exposures.find(x=>x.currency===creditCurrency)?.outstanding||0;
      const creditLimit=profile?.creditLimit==null?null:Number(profile.creditLimit);
      rows.push({
        partyId:org.id,code:org.code,name:org.name,countryCode:org.countryCode,
        profile,decision,creditCurrency,creditLimit,exposure:this.round(exposure),
        availableCredit:creditLimit==null?null:this.round(Math.max(0,creditLimit-exposure)),
        maxDaysOverdue,openInvoiceCount:partyInvoices.length,disputedCount:partyInvoices.filter(i=>i.status==='DISPUTED').length,
        exposures
      });
    }
    return rows.sort((a,b)=>{
      const risk=(x:any)=>['HOLD','OVER_LIMIT','OVERDUE_HOLD'].includes(x.decision)?0:x.decision==='CLEAR'?2:1;
      return risk(a)-risk(b)||b.maxDaysOverdue-a.maxDaysOverdue||a.name.localeCompare(b.name);
    });
  }

  async customer(partyId:string,user:ScopeUser){
    this.access(user);
    const rows=await this.customers(user);
    const row=rows.find(x=>x.partyId===partyId);
    if(!row) throw new NotFoundException('Customer not found');
    const invoices=(await this.invoices()).filter(i=>i.partyId===partyId&&i.invoiceType==='AR').sort((a,b)=>b.daysOverdue-a.daysOverdue);
    const bookings=await this.prisma.booking.findMany({where:{customerId:partyId},select:{id:true,bookingNo:true,status:true,creditStatus:true,origin:true,destination:true,createdAt:true},orderBy:{createdAt:'desc'},take:50});
    return {...row,invoices,bookings};
  }

  async setProfile(partyId:string,body:any,user:ScopeUser){
    this.access(user);
    const org=await this.prisma.organization.findUnique({where:{id:partyId}});
    if(!org||!org.active) throw new BadRequestException('Customer must be an active organization');
    if(!(org.roles as any[]).includes('CUSTOMER')) throw new BadRequestException('Credit profile can only be assigned to a customer organization');
    const limit=body?.creditLimit===''||body?.creditLimit==null?null:this.money(body.creditLimit,'Credit limit',true);
    const paymentTermsDays=Math.max(0,Math.min(365,Math.floor(Number(body?.paymentTermsDays??30))));
    const overdueHoldDays=Math.max(1,Math.min(365,Math.floor(Number(body?.overdueHoldDays??60))));
    const riskRating=String(body?.riskRating||'MEDIUM').toUpperCase();
    if(!['LOW','MEDIUM','HIGH','RESTRICTED'].includes(riskRating)) throw new BadRequestException('Risk rating must be LOW, MEDIUM, HIGH or RESTRICTED');
    const creditHold=Boolean(body?.creditHold);
    const holdReason=creditHold?this.required(body?.holdReason||'Manual credit hold','Hold reason'):null;
    const payload={
      partyId,partyName:org.name,creditLimit:limit,creditCurrency:String(body?.creditCurrency||'USD').toUpperCase(),
      paymentTermsDays,overdueHoldDays,riskRating,creditHold,holdReason,
      collectorId:body?.collectorId?String(body.collectorId):null,notes:body?.notes?String(body.notes):null,updatedBy:user.sub
    };
    const event=await this.prisma.integrationEvent.create({data:{
      sourceSystem:SOURCE,eventType:'CREDIT_PROFILE_SET',externalId:partyId,objectType:'CreditProfile',objectId:partyId,status:'COMPLETED',payload,completedAt:new Date()
    }});
    await this.audit.log({actorId:user.sub,action:'CREDIT_PROFILE_SET',objectType:'Organization',objectId:partyId,detail:{eventId:event.id,...payload}});
    return this.customer(partyId,user);
  }

  async applyBookingDecision(partyId:string,user:ScopeUser){
    this.access(user);
    const customer=await this.customer(partyId,user);
    const passed=customer.decision==='CLEAR';
    const bookings=await this.prisma.booking.findMany({where:{customerId:partyId},select:{id:true,status:true}});
    const terminal=new Set(['CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);
    const ids=bookings.filter(b=>!terminal.has(String(b.status))).map(b=>b.id);
    if(ids.length) await this.prisma.booking.updateMany({where:{id:{in:ids}},data:{creditStatus:passed?'Passed':'Hold'}});
    await this.audit.log({actorId:user.sub,action:'CREDIT_DECISION_APPLY',objectType:'Organization',objectId:partyId,detail:{decision:customer.decision,creditStatus:passed?'Passed':'Hold',bookingCount:ids.length}});
    return {ok:true,decision:customer.decision,creditStatus:passed?'Passed':'Hold',updatedBookings:ids.length};
  }

  private async collectionEvents(){
    return this.prisma.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'CollectionCase',eventType:'COLLECTION_ACTION'},orderBy:{createdAt:'asc'}});
  }

  async collections(user:ScopeUser){
    this.access(user);
    const [invoices,events]=await Promise.all([this.invoices(),this.collectionEvents()]);
    const latest=new Map<string,any>();
    for(const event of events) latest.set(event.objectId,{id:event.id,...this.payload(event),createdAt:event.createdAt});
    return invoices.filter(i=>i.invoiceType==='AR'&&['ISSUED','PART_PAID','DISPUTED'].includes(i.status)&&i.balanceAmount>0).map(invoice=>{
      const action=latest.get(invoice.invoiceNo)||null;
      const promisedDate=action?.action==='PROMISE_TO_PAY'&&action?.promiseDate?new Date(action.promiseDate):null;
      const promiseBreached=Boolean(promisedDate&&promisedDate.getTime()<Date.now()&&invoice.balanceAmount>0);
      let priority='NORMAL';
      if(invoice.status==='DISPUTED'||promiseBreached||invoice.daysOverdue>60) priority='CRITICAL';
      else if(invoice.daysOverdue>30) priority='HIGH';
      else if(invoice.daysOverdue>0) priority='MEDIUM';
      return {...invoice,priority,lastAction:action,promiseBreached};
    }).sort((a,b)=>{
      const score=(p:string)=>({CRITICAL:0,HIGH:1,MEDIUM:2,NORMAL:3} as any)[p]??4;
      return score(a.priority)-score(b.priority)||b.daysOverdue-a.daysOverdue||b.balanceAmount-a.balanceAmount;
    });
  }

  async collectionAction(invoiceNo:string,body:any,user:ScopeUser){
    this.access(user);
    const invoices=await this.invoices();
    const invoice=invoices.find(i=>i.invoiceNo===invoiceNo);
    if(!invoice||invoice.invoiceType!=='AR') throw new NotFoundException('AR invoice not found');
    if(!['ISSUED','PART_PAID','DISPUTED'].includes(invoice.status)||invoice.balanceAmount<=0) throw new BadRequestException('Collection action requires an open AR invoice');
    const action=String(body?.action||'NOTE').toUpperCase();
    if(!['CONTACTED','PROMISE_TO_PAY','ESCALATED','DISPUTE_FOLLOWUP','NOTE'].includes(action)) throw new BadRequestException('Invalid collection action');
    let promiseDate:string|null=null,promisedAmount:number|null=null;
    if(action==='PROMISE_TO_PAY'){
      const d=this.date(body?.promiseDate,'Promise date');
      if(d.getTime()<Date.now()-DAY) throw new BadRequestException('Promise date cannot be in the past');
      promiseDate=d.toISOString();
      promisedAmount=this.money(body?.promisedAmount,'Promised amount');
      if(promisedAmount-invoice.balanceAmount>0.005) throw new BadRequestException('Promised amount exceeds invoice balance');
    }
    const nextActionDate=body?.nextActionDate?this.date(body.nextActionDate,'Next action date').toISOString():null;
    const payload={invoiceNo,bookingId:invoice.bookingId,partyId:invoice.partyId,partyName:invoice.partyName,action,promiseDate,promisedAmount,nextActionDate,note:body?.note?String(body.note):null,actorId:user.sub};
    const event=await this.prisma.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'COLLECTION_ACTION',externalId:invoiceNo,objectType:'CollectionCase',objectId:invoiceNo,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:`COLLECTION_${action}`,objectType:'FinanceInvoice',objectId:invoiceNo,bookingId:invoice.bookingId,detail:{eventId:event.id,promiseDate,promisedAmount,nextActionDate,note:payload.note}});
    return {ok:true,eventId:event.id};
  }

  private buildBankTransaction(events:any[]){
    const imported=events.find(e=>e.eventType==='BANK_TRANSACTION_IMPORTED');
    if(!imported) return null;
    const base=this.payload(imported);
    const reversals=new Set(events.filter(e=>e.eventType==='BANK_MATCH_REVERSED').map(e=>String(this.payload(e).matchEventId||'')));
    const matches=events.filter(e=>e.eventType==='BANK_TRANSACTION_MATCHED'&&!reversals.has(e.id)).map(e=>({id:e.id,...this.payload(e),createdAt:e.createdAt}));
    const amount=this.round(Number(base.amount||0));
    const matchedAmount=this.round(matches.reduce((sum:number,m:any)=>sum+Number(m.amount||0),0));
    const remainingAmount=this.round(Math.max(0,amount-matchedAmount));
    return {
      transactionId:String(base.transactionId||imported.objectId),bankReference:String(base.bankReference||''),direction:String(base.direction||'CREDIT'),
      amount,currency:String(base.currency||'USD'),bookedAt:base.bookedAt||imported.createdAt,counterparty:base.counterparty||null,
      description:base.description||null,account:base.account||null,matchedAmount,remainingAmount,
      status:remainingAmount<=0.005?'MATCHED':matchedAmount>0?'PART_MATCHED':'UNMATCHED',matches,createdAt:imported.createdAt
    };
  }

  async bankTransactions(user:ScopeUser){
    this.access(user);
    const events=await this.prisma.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'BankTransaction'},orderBy:{createdAt:'asc'}});
    const grouped=new Map<string,any[]>();
    for(const event of events){
      if(!grouped.has(event.objectId)) grouped.set(event.objectId,[]);
      grouped.get(event.objectId)!.push(event);
    }
    return Array.from(grouped.values()).map(rows=>this.buildBankTransaction(rows)).filter(Boolean).sort((a:any,b:any)=>new Date(b.bookedAt).getTime()-new Date(a.bookedAt).getTime());
  }

  async importBankTransaction(body:any,user:ScopeUser){
    this.access(user);
    const bankReference=this.required(body?.bankReference,'Bank reference');
    const duplicate=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:'BankTransaction',eventType:'BANK_TRANSACTION_IMPORTED',externalId:bankReference}});
    if(duplicate) throw new BadRequestException(`Bank reference ${bankReference} is already imported`);
    const direction=String(body?.direction||'CREDIT').toUpperCase();
    if(!['CREDIT','DEBIT'].includes(direction)) throw new BadRequestException('Direction must be CREDIT or DEBIT');
    const amount=this.money(body?.amount,'Amount');
    const currency=String(body?.currency||'USD').toUpperCase();
    const bookedAt=body?.bookedAt?this.date(body.bookedAt,'Booked date'):new Date();
    const transactionId=`BT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const payload={transactionId,bankReference,direction,amount,currency,bookedAt:bookedAt.toISOString(),counterparty:body?.counterparty?String(body.counterparty):null,description:body?.description?String(body.description):null,account:body?.account?String(body.account):null,importedBy:user.sub};
    const event=await this.prisma.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'BANK_TRANSACTION_IMPORTED',externalId:bankReference,objectType:'BankTransaction',objectId:transactionId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'BANK_TRANSACTION_IMPORT',objectType:'BankTransaction',objectId:transactionId,detail:{eventId:event.id,bankReference,direction,amount,currency,bookedAt}});
    return this.bankTransaction(transactionId,user);
  }

  async bankTransaction(transactionId:string,user:ScopeUser){
    this.access(user);
    const events=await this.prisma.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'BankTransaction',objectId:transactionId},orderBy:{createdAt:'asc'}});
    const row=this.buildBankTransaction(events);
    if(!row) throw new NotFoundException('Bank transaction not found');
    return row;
  }

  async matchBankTransaction(transactionId:string,body:any,user:ScopeUser){
    this.access(user);
    const tx:any=await this.bankTransaction(transactionId,user);
    if(tx.remainingAmount<=0.005) throw new BadRequestException('Bank transaction is already fully matched');
    const invoiceNo=this.required(body?.invoiceNo,'Invoice');
    const invoices=await this.invoices();
    const invoice=invoices.find(i=>i.invoiceNo===invoiceNo);
    if(!invoice) throw new NotFoundException('Invoice not found');
    const expectedType=tx.direction==='CREDIT'?'AR':'AP';
    if(invoice.invoiceType!==expectedType) throw new BadRequestException(`${tx.direction} bank transaction can only match ${expectedType} invoices`);
    if(!['ISSUED','PART_PAID'].includes(invoice.status)) throw new BadRequestException(`Invoice cannot be matched from ${invoice.status}`);
    if(invoice.currency!==tx.currency) throw new BadRequestException('Bank transaction and invoice currencies must match');
    const amount=body?.amount==null||body?.amount===''?Math.min(tx.remainingAmount,invoice.balanceAmount):this.money(body.amount,'Match amount');
    if(amount-tx.remainingAmount>0.005) throw new BadRequestException('Match amount exceeds the remaining bank transaction amount');
    if(amount-invoice.balanceAmount>0.005) throw new BadRequestException('Match amount exceeds the invoice balance');
    const now=new Date();
    const matchPayload={transactionId,invoiceNo,amount:this.round(amount),currency:tx.currency,bankReference:tx.bankReference,bookingId:invoice.bookingId,partyId:invoice.partyId,partyName:invoice.partyName,matchedBy:user.sub,matchedAt:now.toISOString()};
    const result=await this.prisma.$transaction(async db=>{
      const match=await db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'BANK_TRANSACTION_MATCHED',externalId:tx.bankReference,objectType:'BankTransaction',objectId:transactionId,status:'COMPLETED',payload:matchPayload,completedAt:now}});
      await db.integrationEvent.create({data:{sourceSystem:ACCOUNTING_SOURCE,eventType:'PAYMENT_RECORDED',externalId:tx.bankReference,objectType:'FinanceInvoice',objectId:invoiceNo,status:'COMPLETED',payload:{invoiceNo,amount:this.round(amount),currency:tx.currency,paidAt:tx.bookedAt,method:'BANK_RECONCILIATION',reference:tx.bankReference,bankTransactionId:transactionId,bankMatchEventId:match.id,recordedBy:user.sub},completedAt:now}});
      const fullyPaid=invoice.balanceAmount-amount<=0.005;
      await db.financeLine.updateMany({where:{invoiceNo},data:{status:fullyPaid?'PAID':'PART_PAID'}});
      return match;
    });
    await this.audit.log({actorId:user.sub,action:'BANK_TRANSACTION_MATCH',objectType:'BankTransaction',objectId:transactionId,bookingId:invoice.bookingId,detail:{matchEventId:result.id,invoiceNo,amount,currency:tx.currency,bankReference:tx.bankReference}});
    return {transaction:await this.bankTransaction(transactionId,user),invoiceNo};
  }

  async unmatchBankTransaction(transactionId:string,matchEventId:string,user:ScopeUser){
    this.access(user);
    const tx:any=await this.bankTransaction(transactionId,user);
    const match=tx.matches.find((m:any)=>m.id===matchEventId);
    if(!match) throw new BadRequestException('Active bank match not found');
    const invoiceEvents=await this.prisma.integrationEvent.findMany({where:{sourceSystem:ACCOUNTING_SOURCE,objectType:'FinanceInvoice',objectId:match.invoiceNo},orderBy:{createdAt:'asc'}});
    const invoice=this.buildInvoice(invoiceEvents);
    if(!invoice) throw new NotFoundException('Invoice not found');
    const amount=this.round(Number(match.amount||0));
    const now=new Date();
    await this.prisma.$transaction(async db=>{
      await db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'BANK_MATCH_REVERSED',externalId:tx.bankReference,objectType:'BankTransaction',objectId:transactionId,status:'COMPLETED',payload:{matchEventId,invoiceNo:match.invoiceNo,amount,currency:tx.currency,reversedBy:user.sub,reversedAt:now.toISOString()},completedAt:now}});
      await db.integrationEvent.create({data:{sourceSystem:ACCOUNTING_SOURCE,eventType:'PAYMENT_RECORDED',externalId:`REV-${tx.bankReference}`,objectType:'FinanceInvoice',objectId:match.invoiceNo,status:'COMPLETED',payload:{invoiceNo:match.invoiceNo,amount:-amount,currency:tx.currency,paidAt:now.toISOString(),method:'BANK_RECONCILIATION_REVERSAL',reference:`REV-${tx.bankReference}`,bankTransactionId:transactionId,bankMatchEventId:matchEventId,recordedBy:user.sub},completedAt:now}});
      const remainingPaid=this.round(Math.max(0,Number(invoice.paidAmount||0)-amount));
      await db.financeLine.updateMany({where:{invoiceNo:match.invoiceNo},data:{status:remainingPaid>0?'PART_PAID':'POSTED'}});
    });
    await this.audit.log({actorId:user.sub,action:'BANK_TRANSACTION_UNMATCH',objectType:'BankTransaction',objectId:transactionId,bookingId:invoice.bookingId,detail:{matchEventId,invoiceNo:match.invoiceNo,amount,currency:tx.currency}});
    return this.bankTransaction(transactionId,user);
  }

  async autoMatch(transactionId:string,user:ScopeUser){
    this.access(user);
    const tx:any=await this.bankTransaction(transactionId,user);
    if(tx.remainingAmount<=0.005) return {matched:false,reason:'Bank transaction is already fully matched',transaction:tx};
    const expectedType=tx.direction==='CREDIT'?'AR':'AP';
    const invoices=(await this.invoices()).filter(i=>i.invoiceType===expectedType&&['ISSUED','PART_PAID'].includes(i.status)&&i.balanceAmount>0&&i.currency===tx.currency);
    const ref=this.norm(tx.bankReference),counterparty=this.norm(tx.counterparty);
    const candidates=invoices.map(invoice=>{
      let score=0;
      if(ref&&this.norm(invoice.invoiceNo)&&ref.includes(this.norm(invoice.invoiceNo))) score+=100;
      if(Math.abs(invoice.balanceAmount-tx.remainingAmount)<=0.005) score+=50;
      if(counterparty&&this.norm(invoice.partyName)&&counterparty.includes(this.norm(invoice.partyName))) score+=20;
      return {invoiceNo:invoice.invoiceNo,partyName:invoice.partyName,balanceAmount:invoice.balanceAmount,currency:invoice.currency,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.invoiceNo.localeCompare(b.invoiceNo));
    if(!candidates.length||candidates[0].score<50) return {matched:false,reason:'No confident invoice match found',candidates:candidates.slice(0,5),transaction:tx};
    if(candidates[1]&&candidates[1].score===candidates[0].score) return {matched:false,reason:'Multiple invoices have the same match score',candidates:candidates.slice(0,5),transaction:tx};
    const best=candidates[0];
    const amount=Math.min(tx.remainingAmount,best.balanceAmount);
    const result=await this.matchBankTransaction(transactionId,{invoiceNo:best.invoiceNo,amount},user);
    return {matched:true,invoiceNo:best.invoiceNo,score:best.score,...result};
  }

  async dashboard(user:ScopeUser){
    this.access(user);
    const [customers,collections,bank]=await Promise.all([this.customers(user),this.collections(user),this.bankTransactions(user)]);
    const unreconciled=bank.filter((x:any)=>x.status!=='MATCHED');
    const cashMap=new Map<string,any>();
    for(const tx of unreconciled){
      if(!cashMap.has(tx.currency)) cashMap.set(tx.currency,{currency:tx.currency,unmatchedCredits:0,unmatchedDebits:0});
      const row=cashMap.get(tx.currency)!;
      if(tx.direction==='CREDIT') row.unmatchedCredits=this.round(row.unmatchedCredits+tx.remainingAmount);
      else row.unmatchedDebits=this.round(row.unmatchedDebits+tx.remainingAmount);
    }
    return {
      customerCount:customers.length,
      creditHoldCount:customers.filter((x:any)=>['HOLD','OVER_LIMIT','OVERDUE_HOLD'].includes(x.decision)).length,
      reviewCount:customers.filter((x:any)=>['REVIEW_REQUIRED','MULTI_CURRENCY_REVIEW'].includes(x.decision)).length,
      collectionCount:collections.length,
      criticalCollectionCount:collections.filter((x:any)=>x.priority==='CRITICAL').length,
      promiseBreachedCount:collections.filter((x:any)=>x.promiseBreached).length,
      unreconciledBankCount:unreconciled.length,
      cashByCurrency:Array.from(cashMap.values())
    };
  }
}
