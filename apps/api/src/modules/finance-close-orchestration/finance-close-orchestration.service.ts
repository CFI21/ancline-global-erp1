import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { RevenueCloseService } from '../revenue-close/revenue-close.service';

const SRC='ANCLINE_FINANCE_CLOSE_ORCHESTRATION';
const ACC='ANCLINE_ACCOUNTING';
const GL='ANCLINE_GL';
const TREAS='ANCLINE_TREASURY';
const PROCUREMENT='ANCLINE_PROCUREMENT';
const STAT='ANCLINE_STATUTORY_FINANCE';
const GROUP='ANCLINE_GROUP_FINANCE';

@Injectable()
export class FinanceCloseOrchestrationService {
  constructor(
    private prisma:PrismaService,
    private scope:ScopeService,
    private audit:AuditService,
    private revenueClose:RevenueCloseService
  ){}
  private get db():any{return this.prisma as any;}
  private access(u:ScopeUser){this.scope.assertFinanceAccess(u);}
  private p(e:any){return (e?.payload||{}) as any;}
  private period(v:any){const s=String(v||'');if(!/^\d{4}-\d{2}$/.test(s))throw new BadRequestException('Period must be YYYY-MM');return s;}
  private periodOf(v:any){const d=new Date(v);if(Number.isNaN(d.getTime()))return null;return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
  private latestByObject(rows:any[]){const m=new Map<string,any[]>();for(const r of rows){if(!m.has(r.objectId))m.set(r.objectId,[]);m.get(r.objectId)!.push(r);}return m;}

  private async glBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}});
    const grouped=this.latestByObject(rows),out:any[]=[];
    for(const [id,ev] of grouped){const created=ev.find((x:any)=>x.eventType==='JOURNAL_CREATED');if(!created)continue;const p=this.p(created);if(String(p.period||this.periodOf(p.journalDate)||'')!==period)continue;const posted=ev.some((x:any)=>x.eventType==='JOURNAL_POSTED'),reversed=ev.some((x:any)=>x.eventType==='JOURNAL_REVERSED');if(!posted&&!reversed)out.push({area:'GENERAL_LEDGER',type:'UNPOSTED_JOURNAL',objectId:id,message:'Journal is still draft/unposted'});}return out;
  }

  private async accountingBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:ACC,objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}});
    const grouped=this.latestByObject(rows),out:any[]=[];
    for(const [id,ev] of grouped){const created=ev.find((x:any)=>x.eventType==='INVOICE_CREATED');if(!created)continue;const p=this.p(created);const createdPeriod=this.periodOf(created.createdAt);if(createdPeriod!==period)continue;
      const issued=ev.some((x:any)=>x.eventType==='INVOICE_ISSUED'),voided=ev.some((x:any)=>x.eventType==='INVOICE_VOIDED'),controls=ev.filter((x:any)=>['INVOICE_DISPUTED','INVOICE_RESOLVED'].includes(x.eventType));const lastControl=controls[controls.length-1];
      if(!issued&&!voided)out.push({area:'AR_AP',type:'DRAFT_INVOICE',objectId:id,message:'Invoice is created but not issued or voided'});
      if(lastControl?.eventType==='INVOICE_DISPUTED')out.push({area:'AR_AP',type:'OPEN_DISPUTE',objectId:id,message:'Invoice dispute is unresolved'});
      if(String(p.invoiceType||'').toUpperCase()==='AP'&&!ev.some((x:any)=>x.eventType==='PAYMENT_RECORDED')&&issued&&!voided)out.push({area:'AR_AP',type:'OPEN_AP',objectId:id,message:'Issued AP invoice remains unpaid at close'});
    }return out;
  }

  private async treasuryBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:TREAS,objectType:'PaymentRun'},orderBy:{createdAt:'asc'}});
    const grouped=this.latestByObject(rows),out:any[]=[];
    for(const [id,ev] of grouped){const created=ev.find((x:any)=>x.eventType==='PAYMENT_RUN_CREATED');if(!created)continue;const p=this.p(created);if(String(p.paymentDate||'').slice(0,7)!==period)continue;const cancelled=ev.some((x:any)=>x.eventType==='PAYMENT_RUN_CANCELLED'),posted=ev.some((x:any)=>x.eventType==='PAYMENT_RUN_POSTED');if(!cancelled&&!posted){const approved=ev.some((x:any)=>x.eventType==='PAYMENT_RUN_APPROVED');out.push({area:'TREASURY',type:approved?'APPROVED_PAYMENT_NOT_POSTED':'DRAFT_PAYMENT_RUN',objectId:id,message:approved?'Approved payment run is not posted':'Payment run is still draft'});}}return out;
  }

  private async procurementBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:PROCUREMENT,objectType:'PurchaseOrder'},orderBy:{createdAt:'asc'}});
    const grouped=this.latestByObject(rows),out:any[]=[];
    for(const [id,ev] of grouped){const created=ev.find((x:any)=>x.eventType==='PO_CREATED');if(!created)continue;const p=this.p(created);const pPeriod=String(p.orderDate||created.createdAt).slice(0,7);if(pPeriod!==period)continue;const cancelled=ev.some((x:any)=>x.eventType==='PO_CANCELLED'),closed=ev.some((x:any)=>x.eventType==='PO_CLOSED');if(cancelled||closed)continue;let state='DRAFT';if(ev.some((x:any)=>x.eventType==='PO_RECEIPT_RECORDED'))state='RECEIVED_OR_PART';else if(ev.some((x:any)=>x.eventType==='PO_APPROVED'))state='APPROVED';else if(ev.some((x:any)=>x.eventType==='PO_SUBMITTED'))state='SUBMITTED';out.push({area:'PROCUREMENT',type:'OPEN_PURCHASE_ORDER',objectId:id,message:`Purchase order remains open at ${state} stage`});}return out;
  }

  private async fxBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:STAT,objectType:'FXExposure'},orderBy:{createdAt:'asc'}});
    const grouped=this.latestByObject(rows),out:any[]=[];
    for(const [id,ev] of grouped){const set=[...ev].reverse().find((x:any)=>x.eventType==='FX_EXPOSURE_SET');if(!set)continue;const p=this.p(set);if(p.period!==period)continue;const posted=[...ev].reverse().find((x:any)=>x.eventType==='FX_REVALUATION_POSTED');if(!posted||new Date(posted.createdAt).getTime()<new Date(set.createdAt).getTime())out.push({area:'STATUTORY',type:'FX_REVALUATION_PENDING',objectId:id,message:'FX exposure has not been revalued after its latest update'});}return out;
  }

  private async intercompanyBlockers(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GROUP,objectType:'IntercompanyTransaction'},orderBy:{createdAt:'asc'}});
    const grouped=this.latestByObject(rows),out:any[]=[];
    for(const [id,ev] of grouped){const created=ev.find((x:any)=>x.eventType==='INTERCOMPANY_CREATED');if(!created)continue;const p=this.p(created);if(p.period!==period)continue;const posted=ev.some((x:any)=>x.eventType==='INTERCOMPANY_POSTED');if(!posted)out.push({area:'INTERCOMPANY',type:'UNPOSTED_INTERCOMPANY',objectId:id,message:'Intercompany transaction is not posted'});}return out;
  }

  async blockers(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);
    const [revenue,gl,accounting,treasury,procurement,fx,intercompany]=await Promise.all([
      this.revenueClose.closePack(period,u),
      this.glBlockers(period),
      this.accountingBlockers(period),
      this.treasuryBlockers(period),
      this.procurementBlockers(period),
      this.fxBlockers(period),
      this.intercompanyBlockers(period)
    ]);
    const revenueBlockers=(revenue.blockers||[]).map((x:any)=>({...x,area:'REVENUE'}));
    return [...revenueBlockers,...gl,...accounting,...treasury,...procurement,...fx,...intercompany];
  }

  async dashboard(periodInput:string,u:ScopeUser){
    this.access(u);const period=this.period(periodInput);const blockers=await this.blockers(period,u);
    const byArea=new Map<string,number>();for(const b of blockers)byArea.set(b.area,(byArea.get(b.area)||0)+1);
    const periodRows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});const glStatus=periodRows.length?String(this.p(periodRows[periodRows.length-1]).status||'OPEN'):'OPEN';
    const areas=['REVENUE','GENERAL_LEDGER','AR_AP','TREASURY','PROCUREMENT','STATUTORY','INTERCOMPANY'].map(area=>({area,blockers:byArea.get(area)||0,status:(byArea.get(area)||0)===0?'READY':'BLOCKED'}));
    return {period,glStatus,ready:blockers.length===0&&glStatus!=='CLOSED',blockerCount:blockers.length,areas,blockers};
  }

  async snapshot(periodInput:string,u:ScopeUser){
    this.access(u);const d=await this.dashboard(periodInput,u);const payload={...d,snapshotAt:new Date().toISOString(),snapshotBy:u.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SRC,eventType:'FINANCE_CLOSE_ORCHESTRATION_SNAPSHOT',externalId:`${d.period}:${Date.now()}`,objectType:'FinanceCloseOrchestrationSnapshot',objectId:d.period,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:u.sub,action:'FINANCE_CLOSE_ORCHESTRATION_SNAPSHOT',objectType:'FinanceCloseOrchestrationSnapshot',objectId:d.period,detail:{ready:d.ready,blockerCount:d.blockerCount,glStatus:d.glStatus}});
    return payload;
  }
}
