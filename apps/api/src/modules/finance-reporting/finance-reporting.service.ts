import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const GL_SOURCE='ANCLINE_GL';
const ACCOUNTING_SOURCE='ANCLINE_ACCOUNTING';
const CREDIT_SOURCE='ANCLINE_CREDIT_CONTROL';

@Injectable()
export class FinanceReportingService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private access(user:ScopeUser){this.scope.assertFinanceAccess(user);}
  private payload(event:any){return (event?.payload||{}) as any;}
  private round(value:any){return Math.round((Number(value||0)+Number.EPSILON)*100)/100;}
  private periodOf(value:any){const d=new Date(value);if(Number.isNaN(d.getTime()))throw new BadRequestException('Invalid posting date');return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
  private journalNo(period:string,prefix='SL'){return `${prefix}-${period.replace('-','')}-${Date.now().toString().slice(-7)}`;}

  private async periodState(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL_SOURCE,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});
    const last=rows[rows.length-1];
    return last?{period,status:this.payload(last).status||'OPEN',updatedAt:last.createdAt}:{period,status:'OPEN',updatedAt:null};
  }

  private buildJournal(rows:any[]){
    const created=rows.find((e:any)=>e.eventType==='JOURNAL_CREATED');if(!created)return null;
    const posted=rows.find((e:any)=>e.eventType==='JOURNAL_POSTED');
    const linked=rows.find((e:any)=>e.eventType==='JOURNAL_REVERSAL_LINKED');
    const base=this.payload(created);
    return {...base,journalNo:created.objectId,status:posted?'POSTED':'DRAFT',reversalJournalNo:linked?this.payload(linked).reversalJournalNo||null:null,createdAt:created.createdAt,postedAt:posted?.createdAt||null};
  }

  private async journalsRaw(){
    const events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL_SOURCE,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}});
    const grouped=new Map<string,any[]>();
    for(const event of events){if(!grouped.has(event.objectId))grouped.set(event.objectId,[]);grouped.get(event.objectId)!.push(event);}
    return Array.from(grouped.values()).map(rows=>this.buildJournal(rows)).filter((x:any)=>Boolean(x)) as any[];
  }

  async journals(period:string|undefined,user:ScopeUser){
    this.access(user);const rows=await this.journalsRaw();
    return rows.filter((j:any)=>!period||j.period===period).sort((a:any,b:any)=>new Date(b.journalDate).getTime()-new Date(a.journalDate).getTime());
  }

  private buildInvoice(rows:any[]){
    const created=rows.find((e:any)=>e.eventType==='INVOICE_CREATED');if(!created)return null;
    const base=this.payload(created);
    const issued=rows.find((e:any)=>e.eventType==='INVOICE_ISSUED');
    const voided=[...rows].reverse().find((e:any)=>e.eventType==='INVOICE_VOIDED');
    const payments=rows.filter((e:any)=>e.eventType==='PAYMENT_RECORDED').map((e:any)=>({eventId:e.id,createdAt:e.createdAt,...this.payload(e)}));
    const paidAmount=this.round(payments.reduce((s:number,p:any)=>s+Number(p.amount||0),0));
    const totalAmount=this.round(base.totalAmount);
    return {
      invoiceNo:String(base.invoiceNo||created.objectId),invoiceType:String(base.invoiceType||'AR').toUpperCase(),
      bookingId:String(base.bookingId||''),bookingNo:String(base.bookingNo||''),partyId:base.partyId||null,partyName:base.partyName||null,
      currency:String(base.currency||'USD').toUpperCase(),subtotal:this.round(base.subtotal),taxAmount:this.round(base.taxAmount),totalAmount,
      balanceAmount:this.round(Math.max(0,totalAmount-paidAmount)),lines:Array.isArray(base.lines)?base.lines:[],
      issuedAt:issued?.createdAt||null,issueEventId:issued?.id||null,voidedAt:voided?.createdAt||null,voidEventId:voided?.id||null,
      status:voided?'VOID':issued?(paidAmount>=totalAmount-0.005?'PAID':paidAmount>0?'PART_PAID':'ISSUED'):'DRAFT',payments
    };
  }

  private async invoices(){
    const events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:ACCOUNTING_SOURCE,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}});
    const grouped=new Map<string,any[]>();for(const event of events){if(!grouped.has(event.objectId))grouped.set(event.objectId,[]);grouped.get(event.objectId)!.push(event);}
    return Array.from(grouped.values()).map(rows=>this.buildInvoice(rows)).filter((x:any)=>Boolean(x)) as any[];
  }

  private journalReferences(journals:any[]){return new Set(journals.map((j:any)=>String(j.reference||'')).filter(Boolean));}

  async postingCandidates(user:ScopeUser){
    this.access(user);const [invoices,journals]=await Promise.all([this.invoices(),this.journalsRaw()]);const refs=this.journalReferences(journals);const out:any[]=[];
    for(const invoice of invoices){
      const issueRef=`INVOICE:${invoice.invoiceNo}:ISSUE`;
      if(invoice.issueEventId&&!refs.has(issueRef)&&invoice.status!=='VOID')out.push({kind:invoice.invoiceType==='AR'?'AR_INVOICE':'AP_INVOICE',reference:issueRef,sourceEventId:invoice.issueEventId,invoiceNo:invoice.invoiceNo,date:invoice.issuedAt,period:this.periodOf(invoice.issuedAt),currency:invoice.currency,amount:invoice.totalAmount,partyName:invoice.partyName,actionPath:`/finance-reporting/post/invoice/${encodeURIComponent(invoice.invoiceNo)}`});
      for(const payment of invoice.payments||[]){
        const paymentRef=`PAYMENT:${payment.eventId}`;
        const paidAt=payment.paidAt||payment.createdAt;
        if(!refs.has(paymentRef))out.push({kind:invoice.invoiceType==='AR'?'AR_RECEIPT':'AP_PAYMENT',reference:paymentRef,sourceEventId:payment.eventId,invoiceNo:invoice.invoiceNo,date:paidAt,period:this.periodOf(paidAt),currency:invoice.currency,amount:this.round(payment.amount),partyName:invoice.partyName,actionPath:`/finance-reporting/post/payment/${payment.eventId}`});
      }
      const voidRef=invoice.voidEventId?`VOID:${invoice.invoiceNo}:${invoice.voidEventId}`:'';
      if(invoice.status==='VOID'&&invoice.voidEventId&&refs.has(issueRef)&&!refs.has(voidRef))out.push({kind:'INVOICE_VOID_REVERSAL',reference:voidRef,sourceEventId:invoice.voidEventId,invoiceNo:invoice.invoiceNo,date:invoice.voidedAt,period:this.periodOf(invoice.voidedAt),currency:invoice.currency,amount:invoice.totalAmount,partyName:invoice.partyName,actionPath:`/finance-reporting/post/void/${invoice.voidEventId}`});
    }
    return out.sort((a:any,b:any)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  }

  private async createPostedJournal(input:any,user:ScopeUser){
    const period=this.periodOf(input.journalDate);const state=await this.periodState(period);if(state.status==='CLOSED')throw new BadRequestException(`Period ${period} is closed`);
    const existing=(await this.journalsRaw()).find((j:any)=>j.reference===input.reference);if(existing)return existing;
    const lines=(input.lines||[]).map((l:any)=>({...l,debit:this.round(l.debit),credit:this.round(l.credit)}));
    const totalDebit=this.round(lines.reduce((s:number,l:any)=>s+Number(l.debit||0),0)),totalCredit=this.round(lines.reduce((s:number,l:any)=>s+Number(l.credit||0),0));
    if(Math.abs(totalDebit-totalCredit)>0.005)throw new BadRequestException(`Posting is not balanced: debit ${totalDebit} / credit ${totalCredit}`);
    const journalNo=input.journalNo||this.journalNo(period,input.prefix||'SL');
    const payload={journalNo,journalDate:new Date(input.journalDate).toISOString(),period,currency:String(input.currency||'USD').toUpperCase(),description:input.description||null,reference:input.reference,source:input.source||'SUBLEDGER',lines,totalDebit,totalCredit};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_CREATED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload,completedAt:new Date()}}),
      this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_POSTED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:{journalNo,postedBy:user.sub,automated:true,sourceReference:input.reference},completedAt:new Date()}})
    ]);
    await this.audit.log({actorId:user.sub,action:'SUBLEDGER_GL_POST',objectType:'JournalEntry',objectId:journalNo,detail:{reference:input.reference,period,currency:payload.currency,totalDebit,totalCredit}});
    return {...payload,status:'POSTED'};
  }

  async postInvoice(invoiceNo:string,user:ScopeUser){
    this.access(user);const invoices=await this.invoices();const invoice=invoices.find((x:any)=>x.invoiceNo===invoiceNo);if(!invoice)throw new NotFoundException('Invoice not found');if(!invoice.issueEventId)throw new BadRequestException('Invoice has not been issued');if(invoice.status==='VOID')throw new BadRequestException('Voided invoice cannot be posted as a normal invoice');
    const lines:any[]=[];
    if(invoice.invoiceType==='AR'){
      lines.push({account:'1100-ACCOUNTS-RECEIVABLE',description:`AR ${invoice.invoiceNo}`,debit:invoice.totalAmount,credit:0,partyId:invoice.partyId,bookingId:invoice.bookingId});
      const sourceLines=invoice.lines.length?invoice.lines:[{amount:invoice.subtotal,taxRate:invoice.subtotal?invoice.taxAmount/invoice.subtotal*100:0,description:'Revenue'}];
      for(const line of sourceLines){const amount=this.round(line.amount);const rate=Number(line.taxRate||0);if(amount)lines.push({account:'4000-FREIGHT-REVENUE',description:line.description||line.chargeCode||'Revenue',debit:0,credit:amount,taxCode:rate?'VAT_OUTPUT':null,taxRate:rate||null,partyId:invoice.partyId,bookingId:invoice.bookingId});}
      if(invoice.taxAmount)lines.push({account:'2100-VAT-OUTPUT',description:`VAT ${invoice.invoiceNo}`,debit:0,credit:invoice.taxAmount,partyId:invoice.partyId,bookingId:invoice.bookingId});
    }else{
      const sourceLines=invoice.lines.length?invoice.lines:[{amount:invoice.subtotal,taxRate:invoice.subtotal?invoice.taxAmount/invoice.subtotal*100:0,description:'Cost'}];
      for(const line of sourceLines){const amount=this.round(line.amount);const rate=Number(line.taxRate||0);if(amount)lines.push({account:'5000-DIRECT-COST',description:line.description||line.chargeCode||'Cost',debit:amount,credit:0,taxCode:rate?'VAT_INPUT':null,taxRate:rate||null,partyId:invoice.partyId,bookingId:invoice.bookingId});}
      if(invoice.taxAmount)lines.push({account:'1200-VAT-INPUT',description:`VAT ${invoice.invoiceNo}`,debit:invoice.taxAmount,credit:0,partyId:invoice.partyId,bookingId:invoice.bookingId});
      lines.push({account:'2000-ACCOUNTS-PAYABLE',description:`AP ${invoice.invoiceNo}`,debit:0,credit:invoice.totalAmount,partyId:invoice.partyId,bookingId:invoice.bookingId});
    }
    return this.createPostedJournal({journalDate:invoice.issuedAt,currency:invoice.currency,reference:`INVOICE:${invoice.invoiceNo}:ISSUE`,description:`${invoice.invoiceType} invoice ${invoice.invoiceNo}`,source:'ACCOUNTING_INVOICE',lines},user);
  }

  async postPayment(eventId:string,user:ScopeUser){
    this.access(user);const event=await this.db.integrationEvent.findUnique({where:{id:eventId}});if(!event||event.sourceSystem!==ACCOUNTING_SOURCE||event.eventType!=='PAYMENT_RECORDED'||event.objectType!=='FinanceInvoice')throw new NotFoundException('Payment event not found');
    const invoices=await this.invoices();const invoice=invoices.find((x:any)=>x.invoiceNo===event.objectId);if(!invoice)throw new NotFoundException('Invoice not found');const p=this.payload(event);const amount=this.round(p.amount);if(amount<=0)throw new BadRequestException('Payment amount is invalid');
    const lines=invoice.invoiceType==='AR'
      ?[{account:'1000-BANK',description:`Receipt ${invoice.invoiceNo}`,debit:amount,credit:0,partyId:invoice.partyId,bookingId:invoice.bookingId},{account:'1100-ACCOUNTS-RECEIVABLE',description:`Settle ${invoice.invoiceNo}`,debit:0,credit:amount,partyId:invoice.partyId,bookingId:invoice.bookingId}]
      :[{account:'2000-ACCOUNTS-PAYABLE',description:`Settle ${invoice.invoiceNo}`,debit:amount,credit:0,partyId:invoice.partyId,bookingId:invoice.bookingId},{account:'1000-BANK',description:`Supplier payment ${invoice.invoiceNo}`,debit:0,credit:amount,partyId:invoice.partyId,bookingId:invoice.bookingId}];
    return this.createPostedJournal({journalDate:p.paidAt||event.createdAt,currency:invoice.currency,reference:`PAYMENT:${eventId}`,description:`${invoice.invoiceType==='AR'?'Customer receipt':'Supplier payment'} ${invoice.invoiceNo}`,source:'ACCOUNTING_PAYMENT',lines},user);
  }

  async postVoid(voidEventId:string,user:ScopeUser){
    this.access(user);const event=await this.db.integrationEvent.findUnique({where:{id:voidEventId}});if(!event||event.sourceSystem!==ACCOUNTING_SOURCE||event.eventType!=='INVOICE_VOIDED')throw new NotFoundException('Invoice void event not found');
    const invoiceNo=event.objectId;const journals=await this.journalsRaw();const original=journals.find((j:any)=>j.reference===`INVOICE:${invoiceNo}:ISSUE`);if(!original)throw new BadRequestException('Original invoice journal has not been posted');
    return this.reverseJournal(original.journalNo,{reversalDate:event.createdAt,reason:`Invoice ${invoiceNo} voided`,sourceReference:`VOID:${invoiceNo}:${voidEventId}`},user);
  }

  async reverseJournal(journalNo:string,body:any,user:ScopeUser){
    this.access(user);const journals=await this.journalsRaw();const journal=journals.find((j:any)=>j.journalNo===journalNo);if(!journal)throw new NotFoundException('Journal not found');if(journal.status!=='POSTED')throw new BadRequestException('Only posted journals can be reversed');if(journal.reversalJournalNo)return journals.find((j:any)=>j.journalNo===journal.reversalJournalNo)||{journalNo:journal.reversalJournalNo,status:'POSTED'};
    const reversalDate=body?.reversalDate||new Date().toISOString();const sourceReference=String(body?.sourceReference||`REVERSAL:${journalNo}`);
    const lines=(journal.lines||[]).map((l:any)=>({...l,debit:this.round(l.credit),credit:this.round(l.debit),taxRate:l.taxRate==null?null:-Number(l.taxRate),description:`Reversal · ${l.description||l.account}`}));
    const reversed:any=await this.createPostedJournal({journalDate:reversalDate,currency:journal.currency,reference:sourceReference,description:`Reversal of ${journalNo}${body?.reason?` · ${body.reason}`:''}`,source:'REVERSAL',prefix:'RV',lines},user);
    await this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_REVERSAL_LINKED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:{journalNo,reversalJournalNo:reversed.journalNo,reason:body?.reason||null,actorId:user.sub},completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'GL_JOURNAL_REVERSE',objectType:'JournalEntry',objectId:journalNo,detail:{reversalJournalNo:reversed.journalNo,reason:body?.reason||null}});return reversed;
  }

  async statements(period:string|undefined,currency:string|undefined,user:ScopeUser){
    this.access(user);let journals=await this.journalsRaw();journals=journals.filter((j:any)=>j.status==='POSTED'&&(!period||j.period===period)&&(!currency||j.currency===currency.toUpperCase()));
    const map=new Map<string,any>();
    for(const journal of journals){const c=String(journal.currency||'USD').toUpperCase();if(!map.has(c))map.set(c,{currency:c,revenue:0,expenses:0,netProfit:0,assets:0,liabilities:0,equity:0,equityWithCurrentProfit:0,balanceCheck:0,accounts:new Map<string,any>()});const row=map.get(c);for(const line of journal.lines||[]){const account=String(line.account||'UNMAPPED');const debit=this.round(line.debit),credit=this.round(line.credit);if(!row.accounts.has(account))row.accounts.set(account,{account,debit:0,credit:0,balance:0});const a=row.accounts.get(account);a.debit=this.round(a.debit+debit);a.credit=this.round(a.credit+credit);a.balance=this.round(a.debit-a.credit);const first=account.charAt(0);if(first==='1')row.assets=this.round(row.assets+debit-credit);else if(first==='2')row.liabilities=this.round(row.liabilities+credit-debit);else if(first==='3')row.equity=this.round(row.equity+credit-debit);else if(first==='4')row.revenue=this.round(row.revenue+credit-debit);else row.expenses=this.round(row.expenses+debit-credit);}}
    const out=[] as any[];for(const row of map.values()){row.netProfit=this.round(row.revenue-row.expenses);row.equityWithCurrentProfit=this.round(row.equity+row.netProfit);row.balanceCheck=this.round(row.assets-row.liabilities-row.equityWithCurrentProfit);row.accounts=Array.from(row.accounts.values()).sort((a:any,b:any)=>a.account.localeCompare(b.account));out.push(row);}return out.sort((a:any,b:any)=>a.currency.localeCompare(b.currency));
  }

  async accountLedger(account:string|undefined,period:string|undefined,currency:string|undefined,user:ScopeUser){
    this.access(user);const target=String(account||'').trim().toUpperCase();if(!target)throw new BadRequestException('Account is required');const journals=await this.journalsRaw();const rows:any[]=[];let running=0;
    for(const journal of journals.filter((j:any)=>j.status==='POSTED'&&(!period||j.period===period)&&(!currency||j.currency===currency.toUpperCase())).sort((a:any,b:any)=>new Date(a.journalDate).getTime()-new Date(b.journalDate).getTime()))for(const line of journal.lines||[]){if(String(line.account).toUpperCase()!==target)continue;running=this.round(running+Number(line.debit||0)-Number(line.credit||0));rows.push({journalNo:journal.journalNo,journalDate:journal.journalDate,period:journal.period,currency:journal.currency,reference:journal.reference,description:line.description||journal.description,debit:this.round(line.debit),credit:this.round(line.credit),runningBalance:running});}
    return rows;
  }

  private async unmatchedBank(period:string){
    const events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:CREDIT_SOURCE,objectType:'BankTransaction'},orderBy:{createdAt:'asc'}});const grouped=new Map<string,any[]>();for(const event of events){if(!grouped.has(event.objectId))grouped.set(event.objectId,[]);grouped.get(event.objectId)!.push(event);}const out:any[]=[];
    for(const [transactionId,rows] of grouped){const imported=rows.find((e:any)=>e.eventType==='BANK_TRANSACTION_IMPORTED');if(!imported)continue;const base=this.payload(imported);const bookedAt=base.bookedAt||base.valueDate||imported.createdAt;if(this.periodOf(bookedAt)!==period)continue;const reversals=new Set(rows.filter((e:any)=>e.eventType==='BANK_MATCH_REVERSED').map((e:any)=>String(this.payload(e).matchEventId||'')));const matches=rows.filter((e:any)=>e.eventType==='BANK_TRANSACTION_MATCHED'&&!reversals.has(e.id));const matched=this.round(matches.reduce((s:number,e:any)=>s+Number(this.payload(e).amount||0),0));const amount=this.round(base.amount);const remaining=this.round(Math.max(0,amount-matched));if(remaining>0.005)out.push({transactionId,bankReference:base.bankReference||transactionId,currency:String(base.currency||'USD').toUpperCase(),amount,matchedAmount:matched,remainingAmount:remaining,bookedAt});}
    return out;
  }

  async closeReadiness(period:string,user:ScopeUser){
    this.access(user);if(!/^\d{4}-\d{2}$/.test(period))throw new BadRequestException('Period must be YYYY-MM');const [state,journals,candidates,unmatchedBank]=await Promise.all([this.periodState(period),this.journalsRaw(),this.postingCandidates(user),this.unmatchedBank(period)]);const draft=journals.filter((j:any)=>j.period===period&&j.status!=='POSTED');const subledger=candidates.filter((c:any)=>c.period===period);return {period,status:state.status,ready:draft.length===0&&subledger.length===0&&unmatchedBank.length===0,draftJournalCount:draft.length,unpostedSubledgerCount:subledger.length,unmatchedBankCount:unmatchedBank.length,draftJournals:draft.map((j:any)=>({journalNo:j.journalNo,description:j.description,currency:j.currency})),subledgerCandidates:subledger,unmatchedBank};
  }

  async dashboard(user:ScopeUser){
    this.access(user);const period=this.periodOf(new Date());const [candidates,statements,close]=await Promise.all([this.postingCandidates(user),this.statements(period,undefined,user),this.closeReadiness(period,user)]);return {period,postingCandidateCount:candidates.length,currencyCount:statements.length,closeReady:close.ready,draftJournalCount:close.draftJournalCount,unpostedSubledgerCount:close.unpostedSubledgerCount,unmatchedBankCount:close.unmatchedBankCount};
  }
}
