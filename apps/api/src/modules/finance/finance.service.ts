import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FinanceService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  async list(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    this.scope.assertFinanceAccess(user);
    return this.prisma.financeLine.findMany({where:{bookingId},orderBy:{createdAt:'asc'}});
  }

  async summary(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    this.scope.assertFinanceAccess(user);
    const [booking,lines]=await Promise.all([
      this.prisma.booking.findUnique({where:{id:bookingId},include:{rateQuote:true}}),
      this.prisma.financeLine.findMany({where:{bookingId},orderBy:{createdAt:'asc'}})
    ]);
    if(!booking) throw new BadRequestException('Booking not found');
    const active=lines.filter(x=>x.status!=='CANCELLED');
    const currencies=[...new Set(active.map(x=>x.currency))];
    const byCurrency=currencies.map(currency=>{
      const rows=active.filter(x=>x.currency===currency);
      const revenue=rows.filter(x=>x.type==='REVENUE').reduce((s,x)=>s+Number(x.finalAmount??x.amount),0);
      const cost=rows.filter(x=>x.type==='COST').reduce((s,x)=>s+Number(x.finalAmount??x.amount),0);
      const gp=revenue-cost;
      return {currency,revenue,cost,gp,marginPct:revenue?gp/revenue*100:0};
    });
    const blocking=active.filter(x=>!['FINAL','CLEARED','PAID'].includes(x.status));
    const disputed=active.filter(x=>x.status==='DISPUTED');
    const revenueLines=active.filter(x=>x.type==='REVENUE');
    return {
      booking:{id:booking.id,bookingNo:booking.bookingNo,status:booking.status,currency:booking.currency,rateQuoteId:booking.rateQuoteId,rateQuote:booking.rateQuote},
      lineCount:active.length,
      byCurrency,
      invoiceReadyCount:revenueLines.filter(x=>x.invoiceReady).length,
      revenueLineCount:revenueLines.length,
      disputedCount:disputed.length,
      closeReady:booking.status==='COMPLETED'&&active.some(x=>x.type==='REVENUE')&&active.some(x=>x.type==='COST')&&blocking.length===0,
      closeBlockingCount:blocking.length,
      closeBlocking: blocking.map(x=>({id:x.id,chargeCode:x.chargeCode,type:x.type,status:x.status}))
    };
  }

  private lineData(body:any){
    if(!body?.bookingId) throw new BadRequestException('Booking is required');
    if(!body?.type||!['REVENUE','COST'].includes(String(body.type))) throw new BadRequestException('Finance type must be REVENUE or COST');
    const chargeCode=String(body?.chargeCode||'').trim().toUpperCase();
    if(!chargeCode) throw new BadRequestException('Charge code is required');
    const amount=Number(body?.amount);
    if(!Number.isFinite(amount)) throw new BadRequestException('A valid amount is required');
    return {
      bookingId:String(body.bookingId),
      type:String(body.type) as any,
      chargeCode,
      description:body?.description?String(body.description):null,
      partyId:body?.partyId?String(body.partyId):null,
      billingPartyId:body?.billingPartyId?String(body.billingPartyId):null,
      serviceProviderId:body?.serviceProviderId?String(body.serviceProviderId):null,
      quantity:body?.quantity!==''&&body?.quantity!=null?Number(body.quantity):null,
      unitRate:body?.unitRate!==''&&body?.unitRate!=null?Number(body.unitRate):null,
      amount,
      finalAmount:body?.finalAmount!==''&&body?.finalAmount!=null?Number(body.finalAmount):null,
      currency:String(body?.currency||'USD').toUpperCase(),
      status:(body?.status||'PLANNED') as any,
      source:body?.source?String(body.source):'MANUAL',
      reference:body?.reference?String(body.reference):null,
      taxRate:body?.taxRate!==''&&body?.taxRate!=null?Number(body.taxRate):null,
      invoiceReady:Boolean(body?.invoiceReady),
      invoiceNo:body?.invoiceNo?String(body.invoiceNo):null,
      invoiceIssuedAt:body?.invoiceIssuedAt?new Date(body.invoiceIssuedAt):null,
      accruedAt:body?.accruedAt?new Date(body.accruedAt):null,
      postedAt:body?.postedAt?new Date(body.postedAt):null
    };
  }

  async create(body:any,user:ScopeUser){
    const data=this.lineData(body);
    await this.scope.assertBookingAccess(user,data.bookingId);
    this.scope.assertFinanceAccess(user);
    const row=await this.prisma.financeLine.create({data});
    await this.audit.log({actorId:user.sub,action:'FINANCE_LINE_CREATE',objectType:'FinanceLine',objectId:row.id,bookingId:row.bookingId,detail:{type:row.type,chargeCode:row.chargeCode,amount:String(row.amount),currency:row.currency}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertFinanceAccess(user);
    const current=await this.prisma.financeLine.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Finance line not found');
    await this.scope.assertBookingAccess(user,current.bookingId);
    if(['FINAL','CLEARED','PAID'].includes(current.status)) throw new BadRequestException('Finalized finance lines cannot be edited');
    const allowed=['type','chargeCode','description','partyId','billingPartyId','serviceProviderId','quantity','unitRate','amount','finalAmount','currency','status','source','reference','taxRate','invoiceReady','invoiceNo','invoiceIssuedAt'];
    const data:any={};
    for(const key of allowed){
      if(!Object.prototype.hasOwnProperty.call(body,key)) continue;
      const v=body[key];
      if(key==='chargeCode') data[key]=String(v||'').trim().toUpperCase();
      else if(['quantity','unitRate','amount','finalAmount','taxRate'].includes(key)) data[key]=v!==''&&v!=null?Number(v):null;
      else if(key==='invoiceReady') data[key]=Boolean(v);
      else if(key==='invoiceIssuedAt') data[key]=v?new Date(v):null;
      else if(key==='currency') data[key]=String(v||'USD').toUpperCase();
      else data[key]=v||null;
    }
    if(data.amount!=null&&!Number.isFinite(data.amount)) throw new BadRequestException('Invalid amount');
    const row=await this.prisma.financeLine.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'FINANCE_LINE_UPDATE',objectType:'FinanceLine',objectId:id,bookingId:row.bookingId,detail:{changedFields:Object.keys(data)}});
    return row;
  }

  async syncQuote(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    this.scope.assertFinanceAccess(user);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},include:{rateQuote:true}});
    if(!booking) throw new BadRequestException('Booking not found');
    const quote=booking.rateQuote;
    if(!quote) throw new BadRequestException('No rate quote is linked to this booking');
    if(quote.status!=='Customer Accepted') throw new BadRequestException('The linked quote must be Customer Accepted before financial handover');
    const reference=quote.quoteNo;
    const source='RATE_QUOTE';
    const quantity=Math.max(1,booking.quantity||1);
    const items=[
      {type:'REVENUE' as const,chargeCode:'OCEAN_FREIGHT',description:`Sell rate from ${quote.quoteNo}`,amount:Number(quote.sellRate)*quantity,unitRate:Number(quote.sellRate)},
      {type:'COST' as const,chargeCode:'OCEAN_FREIGHT',description:`Buy rate from ${quote.quoteNo}`,amount:Number(quote.buyRate)*quantity,unitRate:Number(quote.buyRate)}
    ];
    const rows=await this.prisma.$transaction(async tx=>{
      const out:any[]=[];
      for(const item of items){
        const existing=await tx.financeLine.findFirst({where:{bookingId,type:item.type,source,reference,chargeCode:item.chargeCode}});
        if(existing&&['FINAL','CLEARED','PAID'].includes(existing.status)){out.push(existing);continue;}
        const data={...item,bookingId,quantity,currency:quote.currency,status:'WIP' as any,source,reference,finalAmount:null,invoiceReady:false};
        out.push(existing?await tx.financeLine.update({where:{id:existing.id},data}):await tx.financeLine.create({data}));
      }
      await tx.booking.update({where:{id:bookingId},data:{currency:quote.currency}});
      return out;
    });
    await this.audit.log({actorId:user.sub,action:'RATE_QUOTE_FINANCE_HANDOVER',objectType:'Booking',objectId:bookingId,bookingId,detail:{quoteNo:quote.quoteNo,currency:quote.currency,quantity,buyRate:String(quote.buyRate),sellRate:String(quote.sellRate)}});
    return {ok:true,quoteNo:quote.quoteNo,rows};
  }

  async status(id:string,status:any,user:ScopeUser){
    this.scope.assertFinanceAccess(user);
    const line=await this.prisma.financeLine.findUnique({where:{id}});
    if(!line) throw new BadRequestException('Finance line not found');
    await this.scope.assertBookingAccess(user,line.bookingId);
    const data:any={status};
    if(status==='ACCRUED') data.accruedAt=new Date();
    if(status==='POSTED') data.postedAt=new Date();
    const out=await this.prisma.financeLine.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'FINANCE_STATUS_CHANGE',objectType:'FinanceLine',objectId:id,bookingId:line.bookingId,detail:{from:line.status,to:status}});
    return out;
  }

  async invoiceReady(id:string,body:any,user:ScopeUser){
    this.scope.assertFinanceAccess(user);
    const line=await this.prisma.financeLine.findUnique({where:{id}});
    if(!line) throw new BadRequestException('Finance line not found');
    await this.scope.assertBookingAccess(user,line.bookingId);
    if(line.type!=='REVENUE') throw new BadRequestException('Invoice readiness applies to revenue lines');
    const ready=body?.ready!==false;
    const row=await this.prisma.financeLine.update({where:{id},data:{invoiceReady:ready,invoiceNo:body?.invoiceNo?String(body.invoiceNo):line.invoiceNo,invoiceIssuedAt:body?.invoiceNo?new Date():line.invoiceIssuedAt}});
    await this.audit.log({actorId:user.sub,action:'FINANCE_INVOICE_READINESS',objectType:'FinanceLine',objectId:id,bookingId:line.bookingId,detail:{ready,invoiceNo:row.invoiceNo||null}});
    return row;
  }

  async finalizeBooking(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    this.scope.assertFinanceAccess(user);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId}});
    if(!booking) throw new BadRequestException('Booking not found');
    if(booking.status!=='COMPLETED') throw new BadRequestException('Operational job must be COMPLETED before financial close');
    const lines=await this.prisma.financeLine.findMany({where:{bookingId,status:{not:'CANCELLED'}}});
    if(!lines.some(x=>x.type==='REVENUE')||!lines.some(x=>x.type==='COST')) throw new BadRequestException('Revenue and cost lines are both required before financial close');
    const blocking=lines.filter(x=>!['FINAL','CLEARED','PAID'].includes(x.status));
    if(blocking.length) throw new BadRequestException(`${blocking.length} finance line(s) are not final/cleared/paid`);
    const row=await this.prisma.booking.update({where:{id:bookingId},data:{status:'FINANCIALLY_CLOSED'}});
    await this.audit.log({actorId:user.sub,action:'BOOKING_FINANCIAL_CLOSE',objectType:'Booking',objectId:bookingId,bookingId,detail:{lineCount:lines.length}});
    return row;
  }
}
