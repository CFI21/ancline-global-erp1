import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const DAY=24*60*60*1000;
const controlEvents=['INVOICE_DISPUTED','INVOICE_RESOLVED','INVOICE_VOIDED'];

@Injectable()
export class AccountingService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private access(user:ScopeUser){ this.scope.assertFinanceAccess(user); }
  private round(value:number){ return Math.round((value+Number.EPSILON)*100)/100; }
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
  private generatedNo(type:string){
    const now=new Date();
    const ym=`${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}`;
    return `${type}-${ym}-${Date.now().toString().slice(-7)}`;
  }

  private async carrierCommercialTerms(bookingId:string){
    const event:any=await this.prisma.integrationEvent.findFirst({
      where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateOffer',eventType:'RATE_OFFER_SELECTED',externalId:bookingId},
      orderBy:{createdAt:'desc'}
    });
    const payload:any=event?.payload&&typeof event.payload==='object'?event.payload:{};
    return payload?.commercialTerms&&typeof payload.commercialTerms==='object'?payload.commercialTerms:null;
  }

  private buildInvoice(events:any[]){
    const created=events.find(e=>e.eventType==='INVOICE_CREATED');
    if(!created) return null;
    const base=this.payload(created);
    const payments=events.filter(e=>e.eventType==='PAYMENT_RECORDED').map(e=>({
      id:e.id,
      ...this.payload(e),
      createdAt:e.createdAt
    }));
    const paidAmount=this.round(payments.reduce((sum:number,p:any)=>sum+Number(p.amount||0),0));
    const totalAmount=this.round(Number(base.totalAmount||0));
    const balanceAmount=this.round(Math.max(0,totalAmount-paidAmount));
    const issued=events.find(e=>e.eventType==='INVOICE_ISSUED');
    const controls=events.filter(e=>controlEvents.includes(e.eventType));
    const latestControl=controls.length?controls[controls.length-1]:null;
    let status='DRAFT';
    if(latestControl?.eventType==='INVOICE_VOIDED') status='VOID';
    else if(latestControl?.eventType==='INVOICE_DISPUTED') status='DISPUTED';
    else if(balanceAmount<=0.005&&totalAmount>0) status='PAID';
    else if(paidAmount>0) status='PART_PAID';
    else if(issued) status='ISSUED';

    const dueDate=base.dueDate?new Date(base.dueDate):null;
    const issueDate=issued?.createdAt||base.issueDate||null;
    const daysOverdue=dueDate&&balanceAmount>0&&!['DRAFT','PAID','VOID'].includes(status)
      ?Math.max(0,Math.floor((Date.now()-dueDate.getTime())/DAY)):0;
    return {
      invoiceNo:String(base.invoiceNo||created.objectId),
      invoiceType:String(base.invoiceType||'AR'),
      bookingId:String(base.bookingId||''),
      bookingNo:String(base.bookingNo||''),
      origin:base.origin||null,
      destination:base.destination||null,
      partyId:base.partyId||null,
      partyName:base.partyName||null,
      currency:String(base.currency||'USD'),
      subtotal:this.round(Number(base.subtotal||0)),
      taxAmount:this.round(Number(base.taxAmount||0)),
      totalAmount,
      paidAmount,
      balanceAmount,
      issueDate,
      dueDate:dueDate?dueDate.toISOString():null,
      status,
      daysOverdue,
      reference:base.reference||null,
      notes:base.notes||null,
      paymentTermsDays:base.paymentTermsDays??null,
      paymentMethod:base.paymentMethod??null,
      prepaidPct:base.prepaidPct??null,
      carrierCreditLimit:base.carrierCreditLimit??null,
      carrierCreditCurrency:base.carrierCreditCurrency??null,
      lines:Array.isArray(base.lines)?base.lines:[],
      lineCount:Array.isArray(base.lines)?base.lines.length:0,
      payments,
      createdAt:created.createdAt,
      updatedAt:events[events.length-1]?.createdAt||created.createdAt
    };
  }

  private async allEvents(){
    return this.prisma.integrationEvent.findMany({
      where:{sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice'},
      orderBy:{createdAt:'asc'}
    });
  }

  async invoices(user:ScopeUser){
    this.access(user);
    const events=await this.allEvents();
    const grouped=new Map<string,any[]>();
    for(const e of events){
      const key=e.objectId;
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key)!.push(e);
    }
    return Array.from(grouped.values()).map(events=>this.buildInvoice(events)).filter(Boolean).sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  }

  async getInvoice(invoiceNo:string,user:ScopeUser){
    this.access(user);
    const events=await this.prisma.integrationEvent.findMany({
      where:{sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice',objectId:invoiceNo},
      orderBy:{createdAt:'asc'}
    });
    const invoice=this.buildInvoice(events);
    if(!invoice) throw new NotFoundException('Accounting invoice not found');
    return invoice;
  }

  async dashboard(user:ScopeUser){
    const invoices:any[]=await this.invoices(user);
    const open=invoices.filter(i=>['ISSUED','PART_PAID','DISPUTED'].includes(i.status)&&i.balanceAmount>0);
    const byCurrencyMap=new Map<string,any>();
    const agingMap=new Map<string,any>();
    for(const invoice of open){
      const currency=invoice.currency;
      if(!byCurrencyMap.has(currency)) byCurrencyMap.set(currency,{currency,arOutstanding:0,apOutstanding:0,overdueAR:0,overdueAP:0});
      const c=byCurrencyMap.get(currency)!;
      if(invoice.invoiceType==='AR') c.arOutstanding=this.round(c.arOutstanding+invoice.balanceAmount);
      else c.apOutstanding=this.round(c.apOutstanding+invoice.balanceAmount);
      if(invoice.daysOverdue>0){
        if(invoice.invoiceType==='AR') c.overdueAR=this.round(c.overdueAR+invoice.balanceAmount);
        else c.overdueAP=this.round(c.overdueAP+invoice.balanceAmount);
      }

      const key=`${currency}:${invoice.invoiceType}`;
      if(!agingMap.has(key)) agingMap.set(key,{currency,invoiceType:invoice.invoiceType,current:0,days1to30:0,days31to60:0,days61to90:0,days90plus:0});
      const a=agingMap.get(key)!;
      const amount=invoice.balanceAmount;
      if(invoice.daysOverdue<=0) a.current=this.round(a.current+amount);
      else if(invoice.daysOverdue<=30) a.days1to30=this.round(a.days1to30+amount);
      else if(invoice.daysOverdue<=60) a.days31to60=this.round(a.days31to60+amount);
      else if(invoice.daysOverdue<=90) a.days61to90=this.round(a.days61to90+amount);
      else a.days90plus=this.round(a.days90plus+amount);
    }
    return {
      totalInvoices:invoices.length,
      draftCount:invoices.filter(i=>i.status==='DRAFT').length,
      openARCount:open.filter(i=>i.invoiceType==='AR').length,
      openAPCount:open.filter(i=>i.invoiceType==='AP').length,
      overdueCount:open.filter(i=>i.daysOverdue>0).length,
      disputedCount:invoices.filter(i=>i.status==='DISPUTED').length,
      paidCount:invoices.filter(i=>i.status==='PAID').length,
      byCurrency:Array.from(byCurrencyMap.values()),
      aging:Array.from(agingMap.values())
    };
  }

  async createInvoice(body:any,user:ScopeUser){
    this.access(user);
    const bookingId=this.required(body?.bookingId,'Booking');
    await this.scope.assertBookingAccess(user,bookingId);
    const invoiceType=String(body?.invoiceType||'AR').trim().toUpperCase();
    if(!['AR','AP'].includes(invoiceType)) throw new BadRequestException('Invoice type must be AR or AP');
    const lineType=invoiceType==='AR'?'REVENUE':'COST';
    const [booking,allLines]=await Promise.all([
      this.prisma.booking.findUnique({where:{id:bookingId},include:{customer:{select:{id:true,name:true}}}}),
      this.prisma.financeLine.findMany({where:{bookingId,type:lineType as any},orderBy:{createdAt:'asc'}})
    ]);
    if(!booking) throw new BadRequestException('Booking not found');

    const requested=Array.isArray(body?.lineIds)&&body.lineIds.length?new Set(body.lineIds.map((x:any)=>String(x))):null;
    let lines=allLines.filter((line:any)=>{
      if(line.invoiceNo) return false;
      if(['CANCELLED','DISPUTED'].includes(line.status)) return false;
      if(requested&&!requested.has(line.id)) return false;
      if(invoiceType==='AR') return Boolean(line.invoiceReady);
      return !['PLANNED','WIP'].includes(line.status);
    });
    if(requested&&lines.length!==requested.size) throw new BadRequestException('One or more selected finance lines are not eligible for invoicing');
    if(!lines.length) throw new BadRequestException(invoiceType==='AR'?'No invoice-ready revenue lines are available':'No accrued/posted/approved cost lines are available');

    const currency=String(body?.currency||lines[0].currency||booking.currency||'USD').toUpperCase();
    if(lines.some((l:any)=>String(l.currency).toUpperCase()!==currency)) throw new BadRequestException('An invoice cannot mix currencies');
    const derivedParty=invoiceType==='AR'
      ?lines.find((l:any)=>l.billingPartyId)?.billingPartyId||lines.find((l:any)=>l.partyId)?.partyId||booking.customerId
      :lines.find((l:any)=>l.serviceProviderId)?.serviceProviderId||lines.find((l:any)=>l.partyId)?.partyId||null;
    const partyId=body?.partyId?String(body.partyId):derivedParty;
    if(!partyId) throw new BadRequestException(invoiceType==='AR'?'Billing party is required':'Supplier / service provider is required');
    const organization=await this.prisma.organization.findUnique({where:{id:partyId}});
    if(!organization||!organization.active) throw new BadRequestException('Invoice party must be an active organization');

    const invoiceNo=String(body?.invoiceNo||this.generatedNo(invoiceType)).trim().toUpperCase();
    const duplicateEvent=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice',objectId:invoiceNo}});
    const duplicateLine=await this.prisma.financeLine.findFirst({where:{invoiceNo}});
    if(duplicateEvent||duplicateLine) throw new BadRequestException(`Invoice ${invoiceNo} already exists`);

    const carrierTermsCandidate=invoiceType==='AP'?await this.carrierCommercialTerms(bookingId):null;
    const carrierOrgId=carrierTermsCandidate?.carrierOrgId?String(carrierTermsCandidate.carrierOrgId):null;
    const carrierTerms=invoiceType==='AP'&&carrierTermsCandidate&&lines.every((l:any)=>String(l.source||'')==='RATE_QUOTE'&&(!carrierOrgId||String(l.serviceProviderId||l.partyId||'')===carrierOrgId))?carrierTermsCandidate:null;
    const paymentTermsDays=Math.max(0,Math.min(365,Number(carrierTerms?.paymentTermsDays??30)));
    const dueDate=body?.dueDate?this.date(body.dueDate,'Due date'):new Date(Date.now()+paymentTermsDays*DAY);
    const lineSnapshots=lines.map((line:any)=>{
      const amount=this.round(Number(line.finalAmount??line.amount));
      const taxRate=Number(line.taxRate||0);
      const taxAmount=this.round(amount*taxRate/100);
      return {id:line.id,chargeCode:line.chargeCode,description:line.description||null,amount,taxRate,taxAmount,currency:line.currency,status:line.status,reference:line.reference||null};
    });
    const subtotal=this.round(lineSnapshots.reduce((s:number,l:any)=>s+l.amount,0));
    const taxAmount=this.round(lineSnapshots.reduce((s:number,l:any)=>s+l.taxAmount,0));
    const totalAmount=this.round(subtotal+taxAmount);
    const payload={
      invoiceNo,invoiceType,bookingId,bookingNo:booking.bookingNo,origin:booking.origin,destination:booking.destination,
      partyId,partyName:organization.name,currency,subtotal,taxAmount,totalAmount,dueDate:dueDate.toISOString(),
      reference:body?.reference?String(body.reference):null,notes:body?.notes?String(body.notes):null,lines:lineSnapshots,
      paymentTermsDays:invoiceType==='AP'?paymentTermsDays:null,paymentMethod:invoiceType==='AP'?(carrierTerms?.paymentMethod||'BANK_TRANSFER'):null,
      prepaidPct:invoiceType==='AP'?Number(carrierTerms?.prepaidPct||0):null,carrierCreditLimit:invoiceType==='AP'?(carrierTerms?.creditLimit??null):null,carrierCreditCurrency:invoiceType==='AP'?(carrierTerms?.creditCurrency||currency):null
    };

    await this.prisma.$transaction(async tx=>{
      await tx.integrationEvent.create({data:{
        sourceSystem:'ANCLINE_ACCOUNTING',eventType:'INVOICE_CREATED',externalId:invoiceNo,objectType:'FinanceInvoice',objectId:invoiceNo,
        status:'COMPLETED',payload,completedAt:new Date()
      }});
      await tx.financeLine.updateMany({where:{id:{in:lines.map((l:any)=>l.id)}},data:{invoiceNo}});
    });
    await this.audit.log({actorId:user.sub,action:'ACCOUNTING_INVOICE_CREATE',objectType:'FinanceInvoice',objectId:invoiceNo,bookingId,detail:{invoiceType,partyId,currency,totalAmount,lineCount:lines.length,dueDate}});
    return this.getInvoice(invoiceNo,user);
  }

  async issue(invoiceNo:string,user:ScopeUser){
    this.access(user);
    const invoice:any=await this.getInvoice(invoiceNo,user);
    if(invoice.status!=='DRAFT') throw new BadRequestException(`Invoice cannot be issued from ${invoice.status}`);
    await this.scope.assertBookingAccess(user,invoice.bookingId);
    const now=new Date();
    await this.prisma.$transaction([
      this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_ACCOUNTING',eventType:'INVOICE_ISSUED',externalId:invoiceNo,objectType:'FinanceInvoice',objectId:invoiceNo,status:'COMPLETED',payload:{invoiceNo,issuedAt:now.toISOString()},completedAt:now}}),
      this.prisma.financeLine.updateMany({where:{invoiceNo},data:{invoiceIssuedAt:now}})
    ]);
    await this.audit.log({actorId:user.sub,action:'ACCOUNTING_INVOICE_ISSUE',objectType:'FinanceInvoice',objectId:invoiceNo,bookingId:invoice.bookingId,detail:{totalAmount:invoice.totalAmount,currency:invoice.currency,dueDate:invoice.dueDate}});
    return this.getInvoice(invoiceNo,user);
  }

  async payment(invoiceNo:string,body:any,user:ScopeUser){
    this.access(user);
    const invoice:any=await this.getInvoice(invoiceNo,user);
    await this.scope.assertBookingAccess(user,invoice.bookingId);
    if(['DRAFT','VOID','DISPUTED','PAID'].includes(invoice.status)) throw new BadRequestException(`Payment cannot be recorded against ${invoice.status} invoice`);
    const amount=Number(body?.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new BadRequestException('Payment amount must be greater than zero');
    if(amount-invoice.balanceAmount>0.005) throw new BadRequestException('Payment exceeds the outstanding balance');
    const currency=String(body?.currency||invoice.currency).toUpperCase();
    if(currency!==invoice.currency) throw new BadRequestException('Payment currency must match invoice currency');
    const paidAt=body?.paidAt?this.date(body.paidAt,'Payment date'):new Date();
    const reference=body?.reference?String(body.reference).trim():null;
    const method=body?.method?String(body.method).trim().toUpperCase():'BANK_TRANSFER';
    const event=await this.prisma.integrationEvent.create({data:{
      sourceSystem:'ANCLINE_ACCOUNTING',eventType:'PAYMENT_RECORDED',externalId:reference||`${invoiceNo}-${Date.now()}`,
      objectType:'FinanceInvoice',objectId:invoiceNo,status:'COMPLETED',payload:{invoiceNo,amount:this.round(amount),currency,paidAt:paidAt.toISOString(),method,reference,notes:body?.notes?String(body.notes):null,recordedBy:user.sub},completedAt:new Date()
    }});
    await this.audit.log({actorId:user.sub,action:'ACCOUNTING_PAYMENT_RECORD',objectType:'FinanceInvoice',objectId:invoiceNo,bookingId:invoice.bookingId,detail:{paymentEventId:event.id,amount,currency,method,reference}});
    return this.getInvoice(invoiceNo,user);
  }

  async dispute(invoiceNo:string,body:any,user:ScopeUser){
    this.access(user);
    const invoice:any=await this.getInvoice(invoiceNo,user);
    await this.scope.assertBookingAccess(user,invoice.bookingId);
    if(!['ISSUED','PART_PAID'].includes(invoice.status)) throw new BadRequestException(`Invoice cannot be disputed from ${invoice.status}`);
    const reason=this.required(body?.reason,'Dispute reason');
    await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_ACCOUNTING',eventType:'INVOICE_DISPUTED',externalId:invoiceNo,objectType:'FinanceInvoice',objectId:invoiceNo,status:'COMPLETED',payload:{invoiceNo,reason,actorId:user.sub},completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'ACCOUNTING_INVOICE_DISPUTE',objectType:'FinanceInvoice',objectId:invoiceNo,bookingId:invoice.bookingId,detail:{reason}});
    return this.getInvoice(invoiceNo,user);
  }

  async resolve(invoiceNo:string,body:any,user:ScopeUser){
    this.access(user);
    const invoice:any=await this.getInvoice(invoiceNo,user);
    await this.scope.assertBookingAccess(user,invoice.bookingId);
    if(invoice.status!=='DISPUTED') throw new BadRequestException('Only disputed invoices can be resolved');
    const note=body?.note?String(body.note):null;
    await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_ACCOUNTING',eventType:'INVOICE_RESOLVED',externalId:invoiceNo,objectType:'FinanceInvoice',objectId:invoiceNo,status:'COMPLETED',payload:{invoiceNo,note,actorId:user.sub},completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'ACCOUNTING_INVOICE_RESOLVE',objectType:'FinanceInvoice',objectId:invoiceNo,bookingId:invoice.bookingId,detail:{note}});
    return this.getInvoice(invoiceNo,user);
  }

  async voidInvoice(invoiceNo:string,body:any,user:ScopeUser){
    this.access(user);
    const invoice:any=await this.getInvoice(invoiceNo,user);
    await this.scope.assertBookingAccess(user,invoice.bookingId);
    if(invoice.status==='VOID') throw new BadRequestException('Invoice is already void');
    if(invoice.paidAmount>0) throw new BadRequestException('Invoice with allocated payments cannot be voided');
    const reason=this.required(body?.reason,'Void reason');
    await this.prisma.$transaction([
      this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_ACCOUNTING',eventType:'INVOICE_VOIDED',externalId:invoiceNo,objectType:'FinanceInvoice',objectId:invoiceNo,status:'COMPLETED',payload:{invoiceNo,reason,actorId:user.sub},completedAt:new Date()}}),
      this.prisma.financeLine.updateMany({where:{invoiceNo},data:{invoiceNo:null,invoiceIssuedAt:null}})
    ]);
    await this.audit.log({actorId:user.sub,action:'ACCOUNTING_INVOICE_VOID',objectType:'FinanceInvoice',objectId:invoiceNo,bookingId:invoice.bookingId,detail:{reason}});
    return this.getInvoice(invoiceNo,user);
  }
}
