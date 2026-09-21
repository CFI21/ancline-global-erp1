import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SRC='ANCLINE_REVENUE_CLOSE', GL='ANCLINE_GL';
type Policy={policyId:string;name:string;transportMode?:string|null;serviceType?:string|null;triggerStatus:string;recognitionPct:number;debitAccount:string;creditAccount:string;active:boolean;updatedBy:string};

@Injectable()
export class RevenueCloseService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private access(u:ScopeUser){this.scope.assertFinanceAccess(u);}
  private p(e:any){return (e?.payload||{}) as any;}
  private r(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private period(v:any){const s=String(v||'');if(!/^\d{4}-\d{2}$/.test(s))throw new BadRequestException('Period must be YYYY-MM');return s;}
  private req(v:any,n:string){const s=String(v??'').trim();if(!s)throw new BadRequestException(`${n} is required`);return s;}
  private pct(v:any){const n=Number(v);if(!Number.isFinite(n)||n<0||n>100)throw new BadRequestException('Recognition % must be 0-100');return this.r(n);}
  private periodOf(d:any){const x=new Date(d);if(Number.isNaN(x.getTime()))throw new BadRequestException('Invalid recognition date');return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`;}
  private async periodStatus(period:string){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});return rows.length?String(this.p(rows[rows.length-1]).status||'OPEN'):'OPEN';}

  private async policyMap(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'RevenueRecognitionPolicy',eventType:'REVENUE_POLICY_SET'},orderBy:{createdAt:'asc'}});
    const m=new Map<string,Policy>();for(const e of rows)m.set(e.objectId,{policyId:e.objectId,...this.p(e)} as Policy);return m;
  }
  async policies(u:ScopeUser){this.access(u);return Array.from((await this.policyMap()).values()).sort((a:any,b:any)=>a.name.localeCompare(b.name));}
  async setPolicy(b:any,u:ScopeUser){
    this.access(u);const policyId=String(b?.policyId||`REV-${Date.now().toString().slice(-8)}`).toUpperCase();
    const payload:Policy={policyId,name:this.req(b?.name,'Policy name'),transportMode:b?.transportMode?String(b.transportMode).toUpperCase():null,serviceType:b?.serviceType?String(b.serviceType).toUpperCase():null,triggerStatus:this.req(b?.triggerStatus,'Trigger status').toUpperCase(),recognitionPct:this.pct(b?.recognitionPct),debitAccount:this.req(b?.debitAccount||'1200-CONTRACT-ASSET','Debit account').toUpperCase(),creditAccount:this.req(b?.creditAccount||'4000-FREIGHT-REVENUE','Credit account').toUpperCase(),active:b?.active!==false,updatedBy:u.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'REVENUE_POLICY_SET',externalId:policyId,objectType:'RevenueRecognitionPolicy',objectId:policyId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:u.sub,action:'REVENUE_POLICY_SET',objectType:'RevenueRecognitionPolicy',objectId:policyId,detail:payload});return payload;
  }

  private matchPolicy(b:any,policies:Policy[]){
    const candidates=policies.filter(x=>x.active!==false&&(!x.transportMode||x.transportMode===String(b.transportMode||'').toUpperCase())&&(!x.serviceType||x.serviceType===String(b.serviceType||'').toUpperCase()));
    return candidates.sort((a,b)=>(Number(!!b.transportMode)+Number(!!b.serviceType))-(Number(!!a.transportMode)+Number(!!a.serviceType)))[0]||null;
  }
  private reached(b:any,trigger:string){
    const order=['DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED','BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE','CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED'];
    const a=order.indexOf(String(b.status||'')),t=order.indexOf(trigger);return t>=0&&a>=t;
  }
  private async recognizedMap(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'BookingRevenueRecognition',eventType:'REVENUE_RECOGNIZED'},orderBy:{createdAt:'asc'}});
    const m=new Map<string,any[]>();for(const e of rows){if(!m.has(e.objectId))m.set(e.objectId,[]);m.get(e.objectId)!.push({...this.p(e),eventId:e.id,createdAt:e.createdAt});}return m;
  }

  async bookingReadiness(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput||new Date().toISOString().slice(0,7));
    const [bookings,policies,rec]=await Promise.all([this.db.booking.findMany({include:{financeLines:true},orderBy:{updatedAt:'desc'}}),this.policies(u),this.recognizedMap()]);
    return bookings.map((b:any)=>{const policy=this.matchPolicy(b,policies);const revenue=this.r((b.financeLines||[]).filter((x:any)=>x.type==='REVENUE'&&!['CANCELLED'].includes(x.status)).reduce((s:number,x:any)=>s+Number(x.finalAmount??x.amount??0),0));const prior=this.r((rec.get(b.id)||[]).reduce((s:number,x:any)=>s+Number(x.amount||0),0));const targetPct=policy&&this.reached(b,policy.triggerStatus)?policy.recognitionPct:0;const target=this.r(revenue*targetPct/100);const due=this.r(Math.max(0,target-prior));return {bookingId:b.id,bookingNo:b.bookingNo,status:b.status,transportMode:b.transportMode,serviceType:b.serviceType,currency:b.currency||'USD',revenue,policy,recognizedToDate:prior,targetRecognitionPct:targetPct,targetRecognitionAmount:target,dueToRecognize:due,period,ready:!!policy&&due>0.005};});
  }

  async recognize(bookingId:string,b:any,u:ScopeUser){
    this.access(u);const booking=await this.db.booking.findUnique({where:{id:bookingId},include:{financeLines:true}});if(!booking)throw new NotFoundException('Booking not found');
    const date=b?.recognitionDate?new Date(b.recognitionDate):new Date();if(Number.isNaN(date.getTime()))throw new BadRequestException('Recognition date is invalid');const period=this.periodOf(date);if(await this.periodStatus(period)==='CLOSED')throw new BadRequestException(`Period ${period} is closed`);
    const rows=await this.bookingReadiness(period,u),x=rows.find((r:any)=>r.bookingId===bookingId);if(!x?.policy)throw new BadRequestException('No active revenue recognition policy matches this booking');if(!x.ready)throw new BadRequestException('No revenue is currently due for recognition');
    const amount=b?.amount==null?x.dueToRecognize:this.r(b.amount);if(amount<=0||amount-x.dueToRecognize>0.005)throw new BadRequestException('Recognition amount exceeds eligible amount');
    const recognitionId=`RR-${period.replace('-','')}-${Date.now().toString().slice(-8)}`;const journalNo=`RRJ-${period.replace('-','')}-${Date.now().toString().slice(-7)}`;
    const lines=[{account:x.policy.debitAccount,description:`Revenue recognition ${booking.bookingNo}`,debit:amount,credit:0,bookingId},{account:x.policy.creditAccount,description:`Revenue recognition ${booking.bookingNo}`,debit:0,credit:amount,bookingId}];
    const journalPayload={journalNo,journalDate:date.toISOString(),period,currency:x.currency,description:`Revenue recognition · ${booking.bookingNo}`,reference:`REVENUE:${recognitionId}`,source:SRC,bookingId,lines,totalDebit:amount,totalCredit:amount};
    await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:GL,eventType:'JOURNAL_CREATED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:journalPayload,completedAt:new Date()}}),
      this.db.integrationEvent.create({data:{sourceSystem:GL,eventType:'JOURNAL_POSTED',externalId:journalNo,objectType:'JournalEntry',objectId:journalNo,status:'COMPLETED',payload:{journalNo,postedBy:u.sub,automated:true,sourceReference:recognitionId},completedAt:new Date()}}),
      this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'REVENUE_RECOGNIZED',externalId:recognitionId,objectType:'BookingRevenueRecognition',objectId:bookingId,status:'COMPLETED',payload:{recognitionId,bookingId,bookingNo:booking.bookingNo,policyId:x.policy.policyId,period,recognitionDate:date.toISOString(),amount,currency:x.currency,journalNo,recognizedBy:u.sub},completedAt:new Date()}})
    ]);
    await this.audit.log({actorId:u.sub,action:'REVENUE_RECOGNIZED',objectType:'Booking',objectId:bookingId,bookingId,detail:{recognitionId,amount,currency:x.currency,journalNo,period,policyId:x.policy.policyId}});
    return {ok:true,recognitionId,bookingId,bookingNo:booking.bookingNo,amount,currency:x.currency,journalNo,period};
  }

  async closePack(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);const [rows,periodStatus,events]=await Promise.all([this.bookingReadiness(period,u),this.periodStatus(period),this.db.integrationEvent.findMany({where:{sourceSystem:SRC,objectType:'FinanceCloseSnapshot',objectId:period},orderBy:{createdAt:'desc'},take:1})]);
    const due=rows.filter((x:any)=>x.ready),unconfigured=rows.filter((x:any)=>x.revenue>0&&!x.policy),totalRevenue=this.r(rows.reduce((s:number,x:any)=>s+x.revenue,0)),recognized=this.r(rows.reduce((s:number,x:any)=>s+x.recognizedToDate,0)),dueAmount=this.r(due.reduce((s:number,x:any)=>s+x.dueToRecognize,0));
    const blockers=[...unconfigured.map((x:any)=>({type:'MISSING_REVENUE_POLICY',objectId:x.bookingNo,message:'Revenue-bearing booking has no recognition policy'})),...due.map((x:any)=>({type:'REVENUE_DUE',objectId:x.bookingNo,message:`${x.dueToRecognize} ${x.currency} remains eligible for recognition`}))];
    return {period,periodStatus,totalBookings:rows.length,totalRevenue,recognizedToDate:recognized,dueRecognition:dueAmount,unconfiguredBookings:unconfigured.length,ready:blockers.length===0,blockers,snapshot:events[0]?this.p(events[0]):null};
  }
  async snapshot(periodInput:string,u:ScopeUser){
    this.access(u);const pack=await this.closePack(periodInput,u);const payload={...pack,snapshotAt:new Date().toISOString(),snapshotBy:u.sub};await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'FINANCE_CLOSE_SNAPSHOT',externalId:`${pack.period}:${Date.now()}`,objectType:'FinanceCloseSnapshot',objectId:pack.period,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'FINANCE_CLOSE_SNAPSHOT',objectType:'FinanceCloseSnapshot',objectId:pack.period,detail:{ready:pack.ready,blockers:pack.blockers.length,dueRecognition:pack.dueRecognition}});return payload;
  }
  async dashboard(periodInput:string,u:ScopeUser){this.access(u);const period=this.period(periodInput||new Date().toISOString().slice(0,7));const [bookings,policies,closePack]=await Promise.all([this.bookingReadiness(period,u),this.policies(u),this.closePack(period,u)]);return {period,policies,bookings,closePack,kpis:{policyCount:policies.filter((x:any)=>x.active!==false).length,recognitionReady:bookings.filter((x:any)=>x.ready).length,dueRecognition:closePack.dueRecognition,unconfigured:closePack.unconfiguredBookings,closeReady:closePack.ready}};}
}
