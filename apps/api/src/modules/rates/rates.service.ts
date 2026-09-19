import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const RATE_SOURCE='ANCLINE_RATES';

@Injectable()
export class RatesService {
  constructor(
    private prisma:PrismaService,
    private scope:ScopeService,
    private audit:AuditService
  ){}

  private internal(user:ScopeUser){ if(String(user.role||'').toUpperCase()!=='GLOBAL_ADMIN') throw new ForbiddenException('Global Admin access required for NVOCC tariff management'); }

  private canonicalStatus(status?:string|null){
    const key=String(status||'DRAFT').trim().toUpperCase().replace(/[\s_-]+/g,'');
    const map:Record<string,string>={
      DRAFT:'DRAFT',
      RATEAPPROVED:'Rate Approved',
      APPROVED:'Rate Approved',
      QUOTESENT:'Quote Sent',
      SENT:'Quote Sent',
      CUSTOMERACCEPTED:'Customer Accepted',
      ACCEPTED:'Customer Accepted',
      REJECTED:'Rejected',
      EXPIRED:'Expired'
    };
    return map[key]||String(status||'DRAFT');
  }

  private margin(buy:any,sell:any){
    const b=Number(buy||0), s=Number(sell||0);
    return {
      grossProfit:s-b,
      marginPct:s>0?((s-b)/s)*100:0
    };
  }

  async list(user:ScopeUser){
    this.internal(user);
    const rows=await this.prisma.rateQuote.findMany({
      include:{_count:{select:{bookings:true}}},
      orderBy:{createdAt:'desc'}
    });
    const now=Date.now();
    return rows.map((row:any)=>({
      ...row,
      status:this.canonicalStatus(row.status),
      expired:new Date(row.validTo).getTime()<now&&!['Customer Accepted','Rejected'].includes(this.canonicalStatus(row.status)),
      ...this.margin(row.buyRate,row.sellRate)
    }));
  }

  async dashboard(user:ScopeUser){
    this.internal(user);
    const rows=await this.prisma.rateQuote.findMany({
      select:{
        id:true,buyRate:true,sellRate:true,currency:true,validTo:true,status:true,
        _count:{select:{bookings:true}}
      }
    });
    const now=Date.now();
    const sevenDays=now+7*24*60*60*1000;
    const active=rows.filter((r:any)=>{
      const status=this.canonicalStatus(r.status);
      return !['Customer Accepted','Rejected','Expired'].includes(status)&&new Date(r.validTo).getTime()>=now;
    });
    const expiring7d=active.filter((r:any)=>new Date(r.validTo).getTime()<=sevenDays).length;
    const expiredOpen=rows.filter((r:any)=>{
      const status=this.canonicalStatus(r.status);
      return !['Customer Accepted','Rejected','Expired'].includes(status)&&new Date(r.validTo).getTime()<now;
    }).length;
    const acceptedAwaitingBooking=rows.filter((r:any)=>this.canonicalStatus(r.status)==='Customer Accepted'&&r._count.bookings===0).length;
    const totalGross=active.reduce((sum:number,r:any)=>sum+this.margin(r.buyRate,r.sellRate).grossProfit,0);
    const totalSell=active.reduce((sum:number,r:any)=>sum+Number(r.sellRate||0),0);
    return {
      totalQuotes:rows.length,
      openPipeline:active.length,
      pipelineSellValue:totalSell,
      pipelineGrossProfit:totalGross,
      avgMarginPct:totalSell>0?(totalGross/totalSell)*100:0,
      expiring7d,
      expiredOpen,
      acceptedAwaitingBooking
    };
  }

  async get(id:string,user:ScopeUser){
    this.internal(user);
    const row=await this.prisma.rateQuote.findUnique({
      where:{id},
      include:{_count:{select:{bookings:true}},bookings:{select:{id:true,bookingNo:true,status:true},orderBy:{createdAt:'desc'},take:5}}
    });
    if(!row) throw new NotFoundException('Rate quote not found');
    return {...row,status:this.canonicalStatus(row.status),...this.margin(row.buyRate,row.sellRate)};
  }

  async create(body:any,user:ScopeUser){
    this.internal(user);
    if(!body?.customerId||!body?.trade||!body?.equipment) throw new BadRequestException('Customer, trade and equipment are required');
    const buy=Number(body.buyRate||0), sell=Number(body.sellRate||0);
    if(!Number.isFinite(buy)||!Number.isFinite(sell)||buy<0||sell<0) throw new BadRequestException('Buy and sell rates must be valid positive values');
    const validFrom=new Date(body.validFrom||new Date());
    const validTo=new Date(body.validTo);
    if(Number.isNaN(validTo.getTime())) throw new BadRequestException('Valid-to date is required');
    if(validTo<validFrom) throw new BadRequestException('Valid-to date must be after valid-from date');

    const row=await this.prisma.rateQuote.create({data:{
      quoteNo:String(body.quoteNo||`Q-${Date.now().toString().slice(-8)}`).trim(),
      customerId:String(body.customerId),
      trade:String(body.trade).trim().toUpperCase(),
      equipment:String(body.equipment).trim().toUpperCase(),
      buyRate:buy,
      sellRate:sell,
      currency:String(body.currency||'USD').trim().toUpperCase(),
      validFrom,
      validTo,
      status:'DRAFT',
      source:String(body.source||'NVOCC_COMMERCIAL_DESK'),
      customerRef:body.customerRef?String(body.customerRef):null,
      costCenterCode:body.costCenterCode?String(body.costCenterCode):null,
      carrierCode:body.carrierCode?String(body.carrierCode).toUpperCase():null,
      carrierQuoteRef:body.carrierQuoteRef?String(body.carrierQuoteRef):null,
      termsVersion:body.termsVersion?String(body.termsVersion):null,
      requestData:body.requestData&&typeof body.requestData==='object'?body.requestData:undefined
    }});
    await this.audit.log({
      actorId:user.sub,action:'RATE_QUOTE_CREATE',objectType:'RateQuote',objectId:row.id,
      detail:{quoteNo:row.quoteNo,trade:row.trade,buyRate:buy,sellRate:sell,currency:row.currency}
    });
    return {...row,...this.margin(row.buyRate,row.sellRate)};
  }

  async update(id:string,body:any,user:ScopeUser){
    this.internal(user);
    const row=await this.prisma.rateQuote.findUnique({where:{id}});
    if(!row) throw new NotFoundException('Rate quote not found');
    const current=this.canonicalStatus(row.status);
    const locked=['customerId','trade','equipment','buyRate','sellRate','currency','validFrom','source'];
    if(current!=='DRAFT'&&locked.some(k=>Object.prototype.hasOwnProperty.call(body,k)))
      throw new BadRequestException('Commercial rate fields are locked after Draft; use the quote lifecycle actions or create a new version');
    const data:any={};
    for(const k of ['customerId','trade','equipment','currency','source','customerRef','costCenterCode','carrierCode','carrierQuoteRef','termsVersion'])
      if(Object.prototype.hasOwnProperty.call(body,k)) data[k]=body[k]==null||body[k]===''?null:String(body[k]);
    if(data.trade) data.trade=String(data.trade).trim().toUpperCase();
    if(data.equipment) data.equipment=String(data.equipment).trim().toUpperCase();
    if(data.currency) data.currency=String(data.currency).trim().toUpperCase();
    if(data.carrierCode) data.carrierCode=String(data.carrierCode).trim().toUpperCase();
    if(Object.prototype.hasOwnProperty.call(body,'buyRate')){
      const n=Number(body.buyRate);if(!Number.isFinite(n)||n<0)throw new BadRequestException('Invalid buy rate');data.buyRate=n;
    }
    if(Object.prototype.hasOwnProperty.call(body,'sellRate')){
      const n=Number(body.sellRate);if(!Number.isFinite(n)||n<0)throw new BadRequestException('Invalid sell rate');data.sellRate=n;
    }
    if(Object.prototype.hasOwnProperty.call(body,'validFrom')){
      const d=new Date(body.validFrom);if(Number.isNaN(d.getTime()))throw new BadRequestException('Invalid valid-from date');data.validFrom=d;
    }
    if(Object.prototype.hasOwnProperty.call(body,'validTo')){
      const d=new Date(body.validTo);if(Number.isNaN(d.getTime()))throw new BadRequestException('Invalid valid-to date');data.validTo=d;
    }
    const from=data.validFrom||row.validFrom,to=data.validTo||row.validTo;
    if(new Date(to).getTime()<new Date(from).getTime())throw new BadRequestException('Valid-to date must be after valid-from date');
    if(body.requestData&&typeof body.requestData==='object'){
      const existing=(row.requestData&&typeof row.requestData==='object'&&!Array.isArray(row.requestData)?row.requestData:{}) as any;
      data.requestData={...existing,...body.requestData};
    }
    const updated=await this.prisma.rateQuote.update({where:{id},data});
    await this.audit.log({actorId:user.sub,action:'RATE_QUOTE_UPDATE',objectType:'RateQuote',objectId:id,detail:{quoteNo:row.quoteNo,fields:Object.keys(data)}});
    return {...updated,status:this.canonicalStatus(updated.status),...this.margin(updated.buyRate,updated.sellRate)};
  }

  async activities(id:string,user:ScopeUser){
    await this.get(id,user);
    const rows=await this.prisma.integrationEvent.findMany({where:{sourceSystem:RATE_SOURCE,objectType:'RateQuoteActivity'},orderBy:{createdAt:'desc'},take:500});
    return rows.map((e:any)=>({...((e.payload||{}) as any),createdAt:e.createdAt}))
      .filter((x:any)=>String(x.quoteId)===id).slice(0,100);
  }

  async addActivity(id:string,body:any,user:ScopeUser){
    const quote=await this.get(id,user);
    if(!String(body?.subject||'').trim())throw new BadRequestException('Activity subject is required');
    const activityId=`QACT-${Date.now()}`;
    const payload={activityId,quoteId:id,quoteNo:quote.quoteNo,date:body?.date?new Date(body.date).toISOString():new Date().toISOString(),type:String(body?.type||'FOLLOW_UP').toUpperCase(),contact:String(body?.contact||''),subject:String(body.subject).trim(),notes:body?.notes?String(body.notes):null,createdBy:user.sub};
    await this.prisma.integrationEvent.create({data:{sourceSystem:RATE_SOURCE,eventType:'RATE_QUOTE_ACTIVITY_CREATED',externalId:activityId,objectType:'RateQuoteActivity',objectId:activityId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'RATE_QUOTE_ACTIVITY',objectType:'RateQuote',objectId:id,detail:{activityId,type:payload.type,subject:payload.subject}});
    return payload;
  }

  async logs(id:string,user:ScopeUser){
    await this.get(id,user);
    const [audit,activities]=await Promise.all([
      this.prisma.auditEvent.findMany({where:{objectType:'RateQuote',objectId:id},orderBy:{createdAt:'desc'},take:100}),
      this.activities(id,user)
    ]);
    return {audit,activities};
  }

  private async transition(id:string,target:string,user:ScopeUser,reason?:string){
    this.internal(user);
    const row=await this.prisma.rateQuote.findUnique({where:{id}});
    if(!row) throw new NotFoundException('Rate quote not found');
    const current=this.canonicalStatus(row.status);
    const next=this.canonicalStatus(target);
    const allowed:Record<string,string[]>={
      DRAFT:['Rate Approved','Rejected'],
      'Rate Approved':['Quote Sent','Rejected'],
      'Quote Sent':['Customer Accepted','Rejected'],
      'Customer Accepted':[],
      Rejected:[],
      Expired:[]
    };
    if(new Date(row.validTo).getTime()<Date.now()&&next!=='Rejected')
      throw new BadRequestException('Expired quote cannot advance; extend validity or reject it');
    if(!(allowed[current]||[]).includes(next))
      throw new BadRequestException(`Quote cannot move from ${current} to ${next}`);

    const updated=await this.prisma.rateQuote.update({where:{id},data:{status:next}});
    await this.audit.log({
      actorId:user.sub,action:'RATE_QUOTE_STATUS',objectType:'RateQuote',objectId:id,
      detail:{quoteNo:row.quoteNo,from:current,to:next,reason:reason||null}
    });
    return updated;
  }

  approve(id:string,user:ScopeUser){ return this.transition(id,'Rate Approved',user); }
  send(id:string,user:ScopeUser){ return this.transition(id,'Quote Sent',user); }
  accept(id:string,user:ScopeUser){ return this.transition(id,'Customer Accepted',user); }
  reject(id:string,body:any,user:ScopeUser){ return this.transition(id,'Rejected',user,body?.reason); }

  async convertToBooking(id:string,body:any,user:ScopeUser){
    this.internal(user);
    const quote=await this.prisma.rateQuote.findUnique({
      where:{id},
      include:{bookings:{select:{id:true,bookingNo:true},take:1}}
    });
    if(!quote) throw new NotFoundException('Rate quote not found');
    if(this.canonicalStatus(quote.status)!=='Customer Accepted')
      throw new BadRequestException('Only customer-accepted quotes can be converted to a booking');
    if(quote.bookings.length)
      throw new BadRequestException(`Quote is already linked to booking ${quote.bookings[0].bookingNo}`);

    const parts=String(quote.trade||'').split(/\s*(?:->|>|\/|→|-)\s*/).filter(Boolean);
    const origin=String(body?.origin||parts[0]||'').trim().toUpperCase();
    const destination=String(body?.destination||parts[parts.length-1]||'').trim().toUpperCase();
    if(!origin||!destination||origin===destination)
      throw new BadRequestException('Origin and destination are required to convert this quote');

    const bookingNo=String(body?.bookingNo||`BKG-${Date.now().toString().slice(-9)}`).trim().toUpperCase();
    const quantity=Math.max(1,Math.floor(Number(body?.quantity||1)));

    const booking=await this.prisma.booking.create({data:{
      bookingNo,
      businessModel:'NVOCC',bookingChannel:'ADMIN_NVOCC_RATE_CONVERSION',
      customerId:quote.customerId,
      rateQuoteId:quote.id,
      salesOwner:user.email,
      bookingType:String(body?.bookingType||'FCL').toUpperCase(),
      transportMode:String(body?.transportMode||'SEA').toUpperCase(),
      serviceType:String(body?.serviceType||'PORT_TO_PORT').toUpperCase(),
      bookingDate:new Date(),
      customerReference:body?.customerReference?String(body.customerReference):null,
      origin,
      destination,
      portOfLoading:body?.portOfLoading?String(body.portOfLoading).toUpperCase():origin,
      portOfDischarge:body?.portOfDischarge?String(body.portOfDischarge).toUpperCase():destination,
      carrier:body?.carrier?String(body.carrier):null,
      vesselVoyage:body?.vesselVoyage?String(body.vesselVoyage):null,
      equipment:quote.equipment,
      quantity,
      currency:quote.currency,
      status:'BOOKING_REQUESTED',
      notes:`Created from accepted commercial quote ${quote.quoteNo}`
    }});

    await this.audit.log({
      actorId:user.sub,action:'RATE_QUOTE_CONVERT_BOOKING',objectType:'Booking',objectId:booking.id,bookingId:booking.id,
      detail:{quoteId:quote.id,quoteNo:quote.quoteNo,bookingNo:booking.bookingNo}
    });
    return {quote:{id:quote.id,quoteNo:quote.quoteNo,status:this.canonicalStatus(quote.status)},booking};
  }
}
