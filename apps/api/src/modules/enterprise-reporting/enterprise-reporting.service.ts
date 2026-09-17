import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_BI';
const CLOSED_BOOKING_STATUSES=new Set(['COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);
const EXCLUDED_FINANCE_STATUSES=new Set(['CANCELLED','DISPUTED']);

@Injectable()
export class EnterpriseReportingService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private round(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;}
  private payload(e:any){return (e?.payload||{}) as any;}
  private async put(objectType:string,eventType:string,objectId:string,payload:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const row=await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType,objectType,objectId,status:'COMPLETED',completedAt:new Date(),payload:{...payload,updatedBy:user.sub}}});
    await this.audit.log({actorId:user.sub,action:eventType,objectType,objectId,detail:payload});
    return row.payload;
  }
  private latest(rows:any[],objectType:string){const m=new Map<string,any>();for(const e of rows.filter((x:any)=>x.objectType===objectType))m.set(e.objectId,{...this.payload(e),objectId:e.objectId,eventType:e.eventType,updatedAt:e.createdAt});return [...m.values()];}
  private async config(){const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE},orderBy:{createdAt:'asc'}});return {reportDefinitions:this.latest(rows,'ReportDefinition'),savedViews:this.latest(rows,'SavedView'),reportRuns:this.latest(rows,'ReportRun')};}

  private finance(bookings:any[]){
    const byBooking=new Map<string,any[]>();
    for(const b of bookings)byBooking.set(b.id,(b.financeLines||[]).filter((l:any)=>!EXCLUDED_FINANCE_STATUSES.has(String(l.status))));
    const rows:any[]=[];
    for(const b of bookings){
      const currencies=new Set((byBooking.get(b.id)||[]).map((l:any)=>String(l.currency||b.currency||'USD').toUpperCase()));
      if(!currencies.size)currencies.add(String(b.currency||'USD').toUpperCase());
      for(const currency of currencies){
        const lines=(byBooking.get(b.id)||[]).filter((l:any)=>String(l.currency||'USD').toUpperCase()===currency);
        const revenue=this.round(lines.filter((l:any)=>l.type==='REVENUE').reduce((s:number,l:any)=>s+Number(l.finalAmount??l.amount??0),0));
        const cost=this.round(lines.filter((l:any)=>l.type==='COST').reduce((s:number,l:any)=>s+Number(l.finalAmount??l.amount??0),0));
        const gp=this.round(revenue-cost);const marginPct=revenue?this.round(gp/revenue*100):0;
        const unbilledRevenue=this.round(lines.filter((l:any)=>l.type==='REVENUE'&&l.invoiceReady&&!l.invoiceNo).reduce((s:number,l:any)=>s+Number(l.finalAmount??l.amount??0),0));
        rows.push({bookingId:b.id,bookingNo:b.bookingNo,currency,revenue,cost,gp,marginPct,unbilledRevenue,customerId:b.customerId,customerName:b.customer?.name||b.customerId,branchId:b.owningBranchId||'UNASSIGNED',origin:b.origin,destination:b.destination,status:b.status,eta:b.eta,ata:b.ata,createdAt:b.createdAt});
      }
    }
    return rows;
  }
  private aggregate(rows:any[],keyFn:(r:any)=>string,labelFn:(r:any)=>string){
    const map=new Map<string,any>();
    for(const r of rows){const key=keyFn(r), label=labelFn(r);if(!map.has(key))map.set(key,{key,label,bookings:new Set<string>(),byCurrency:new Map<string,any>()});const x=map.get(key);x.bookings.add(r.bookingId);if(!x.byCurrency.has(r.currency))x.byCurrency.set(r.currency,{currency:r.currency,revenue:0,cost:0,gp:0,unbilledRevenue:0});const c=x.byCurrency.get(r.currency);c.revenue+=r.revenue;c.cost+=r.cost;c.gp+=r.gp;c.unbilledRevenue+=r.unbilledRevenue;}
    return [...map.values()].map((x:any)=>({key:x.key,label:x.label,bookingCount:x.bookings.size,financials:[...x.byCurrency.values()].map((c:any)=>({...c,revenue:this.round(c.revenue),cost:this.round(c.cost),gp:this.round(c.gp),unbilledRevenue:this.round(c.unbilledRevenue),marginPct:c.revenue?this.round(c.gp/c.revenue*100):0}))})).sort((a:any,b:any)=>b.bookingCount-a.bookingCount);
  }

  private async data(user:ScopeUser){
    this.scope.assertInternal(user);const scoped=bookingScope(user);
    const bookings:any[]=await this.db.booking.findMany({where:scoped,include:{customer:{select:{id:true,name:true,code:true}},financeLines:true},orderBy:{createdAt:'desc'}});
    const branchIds=[...new Set(bookings.map((b:any)=>b.owningBranchId).filter(Boolean))] as string[];
    const branches:any[]=branchIds.length?await this.db.branch.findMany({where:{id:{in:branchIds}}}):[];const branchMap=new Map(branches.map((b:any)=>[b.id,`${b.code} · ${b.name}`]));
    const financialRows=this.finance(bookings);
    return {bookings,financialRows,branchMap};
  }

  async dashboard(user:ScopeUser){
    const [{bookings,financialRows,branchMap},cfg]=await Promise.all([this.data(user),this.config()]);const now=Date.now();
    const active=bookings.filter((b:any)=>!CLOSED_BOOKING_STATUSES.has(String(b.status))).length;
    const completed=bookings.filter((b:any)=>['COMPLETED','FINANCIALLY_CLOSED'].includes(String(b.status))).length;
    const cancelled=bookings.filter((b:any)=>b.status==='CANCELLED').length;
    const overdueEta=bookings.filter((b:any)=>b.eta&&!b.ata&&!CLOSED_BOOKING_STATUSES.has(String(b.status))&&new Date(b.eta).getTime()<now);
    const lossJobs=financialRows.filter((r:any)=>r.revenue>0&&r.gp<0);
    const unbilled=financialRows.filter((r:any)=>r.unbilledRevenue>0);
    const pendingApprovals:any[]=await this.db.approval.findMany({where:{status:'Pending',...(Object.keys(bookingScope(user)).length?{booking:{is:bookingScope(user)}}:{})},include:{booking:{select:{bookingNo:true}}},orderBy:{createdAt:'desc'},take:100});
    const currencyTotals=this.aggregate(financialRows,r=>r.currency,r=>r.currency).map((x:any)=>x.financials[0]);
    const branch=this.aggregate(financialRows,r=>r.branchId,r=>String(branchMap.get(r.branchId)||r.branchId));
    const customer=this.aggregate(financialRows,r=>r.customerId,r=>r.customerName);
    const lane=this.aggregate(financialRows,r=>`${r.origin}→${r.destination}`,r=>`${r.origin} → ${r.destination}`);
    const month=this.aggregate(financialRows,r=>String(r.createdAt).slice(0,7),r=>String(r.createdAt).slice(0,7));
    return {summary:{totalBookings:bookings.length,activeBookings:active,completedBookings:completed,cancelledBookings:cancelled,overdueEta:overdueEta.length,negativeGpJobs:lossJobs.length,unbilledRevenueJobs:unbilled.length,pendingApprovals:pendingApprovals.length},currencyTotals,branch,customer,lane,month,exceptions:{negativeGp:lossJobs.slice(0,100),overdueEta:overdueEta.slice(0,100).map((b:any)=>({bookingId:b.id,bookingNo:b.bookingNo,eta:b.eta,status:b.status,origin:b.origin,destination:b.destination,customerName:b.customer?.name||b.customerId})),unbilledRevenue:unbilled.slice(0,100),pendingApprovals},reportDefinitions:cfg.reportDefinitions,savedViews:cfg.savedViews,reportRuns:cfg.reportRuns.slice(-50).reverse()};
  }

  async setReportDefinition(body:any,user:ScopeUser){
    this.scope.assertInternal(user);if(!body?.name)throw new BadRequestException('Report name is required');const id=String(body.reportId||this.id('RPT'));
    return this.put('ReportDefinition','REPORT_DEFINITION_SET',id,{reportId:id,name:String(body.name),reportType:String(body.reportType||'EXECUTIVE_KPI'),frequency:String(body.frequency||'WEEKLY').toUpperCase(),recipients:Array.isArray(body.recipients)?body.recipients:[],filters:body.filters||{},active:body.active!==false,notes:body.notes||null},user);
  }
  async setSavedView(body:any,user:ScopeUser){
    this.scope.assertInternal(user);if(!body?.name)throw new BadRequestException('View name is required');const id=String(body.viewId||this.id('VIEW'));
    return this.put('SavedView','SAVED_VIEW_SET',id,{viewId:id,name:String(body.name),dimension:String(body.dimension||'BRANCH').toUpperCase(),filters:body.filters||{},columns:Array.isArray(body.columns)?body.columns:[],shared:Boolean(body.shared),owner:user.email||user.sub,active:body.active!==false},user);
  }
  async runReport(id:string,user:ScopeUser){
    this.scope.assertInternal(user);const cfg=await this.config();const def=cfg.reportDefinitions.find((x:any)=>x.reportId===id&&x.active!==false);if(!def)throw new BadRequestException('Active report definition not found');const dash=await this.dashboard(user);const runId=this.id('RUN');
    return this.put('ReportRun','REPORT_RUN_COMPLETED',runId,{runId,reportId:id,reportName:def.name,reportType:def.reportType,generatedAt:new Date().toISOString(),generatedBy:user.email||user.sub,summary:dash.summary,currencyTotals:dash.currencyTotals,exceptionCounts:{negativeGp:dash.exceptions.negativeGp.length,overdueEta:dash.exceptions.overdueEta.length,unbilledRevenue:dash.exceptions.unbilledRevenue.length,pendingApprovals:dash.exceptions.pendingApprovals.length}},user);
  }
  async drilldown(dimension:string,key:string,user:ScopeUser){
    const {bookings,financialRows,branchMap}=await this.data(user);const d=String(dimension||'').toUpperCase();let rows=financialRows;
    if(d==='BRANCH')rows=rows.filter((r:any)=>r.branchId===key);else if(d==='CUSTOMER')rows=rows.filter((r:any)=>r.customerId===key);else if(d==='LANE')rows=rows.filter((r:any)=>`${r.origin}→${r.destination}`===key);else if(d==='MONTH')rows=rows.filter((r:any)=>String(r.createdAt).slice(0,7)===key);else if(d==='CURRENCY')rows=rows.filter((r:any)=>r.currency===key);else throw new BadRequestException('Unsupported drill-down dimension');
    const bookingIds=new Set(rows.map((r:any)=>r.bookingId));return {dimension:d,key,label:d==='BRANCH'?String(branchMap.get(key)||key):key,bookings:bookings.filter((b:any)=>bookingIds.has(b.id)).map((b:any)=>({id:b.id,bookingNo:b.bookingNo,status:b.status,customerName:b.customer?.name||b.customerId,origin:b.origin,destination:b.destination,etd:b.etd,eta:b.eta})),financialRows:rows};
  }
}
