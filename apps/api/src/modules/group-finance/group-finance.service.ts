import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_GROUP_FINANCE';
const GL_SOURCE='ANCLINE_GL';

@Injectable()
export class GroupFinanceService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private access(user:ScopeUser){this.scope.assertFinanceAccess(user);}
  private payload(e:any){return (e?.payload||{}) as any;}
  private round(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
  private req(v:any,n:string){const t=String(v??'').trim();if(!t)throw new BadRequestException(`${n} is required`);return t;}
  private period(v:any){const t=String(v||'');if(!/^\d{4}-\d{2}$/.test(t))throw new BadRequestException('Period must be YYYY-MM');return t;}
  private date(v:any,n:string){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new BadRequestException(`${n} must be a valid date`);return d;}
  private currency(v:any){const c=String(v||'USD').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(c))throw new BadRequestException('Currency must be a 3-letter code');return c;}

  private async periodState(period:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL_SOURCE,objectType:'FiscalPeriod',objectId:period},orderBy:{createdAt:'asc'}});
    const last=rows[rows.length-1];return last?{period,status:this.payload(last).status||'OPEN'}:{period,status:'OPEN'};
  }

  private async entityConfigMap(){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'EntityConfig',eventType:'ENTITY_CONFIG_SET'},orderBy:{createdAt:'asc'}});
    const map=new Map<string,any>();for(const r of rows)map.set(r.objectId,{branchId:r.objectId,...this.payload(r),updatedAt:r.createdAt});return map;
  }

  async entities(user:ScopeUser){
    this.access(user);const [branches,configs]=await Promise.all([this.db.branch.findMany({orderBy:{code:'asc'}}),this.entityConfigMap()]);
    return (branches as any[]).map((b:any)=>{const c=configs.get(b.id)||null;return {branchId:b.id,branchCode:b.code,branchName:b.name,countryCode:b.countryCode,branchActive:b.active,configured:Boolean(c),entityCode:c?.entityCode||b.code,entityName:c?.entityName||b.name,localCurrency:c?.localCurrency||null,groupCurrency:c?.groupCurrency||null,ownershipPct:c?.ownershipPct==null?100:Number(c.ownershipPct),active:c?.active!==false,updatedAt:c?.updatedAt||null};});
  }

  async setEntity(branchId:string,body:any,user:ScopeUser){
    this.access(user);const branch=await this.db.branch.findUnique({where:{id:branchId}});if(!branch)throw new NotFoundException('Branch not found');
    const ownershipPct=body?.ownershipPct==null?100:Number(body.ownershipPct);if(!Number.isFinite(ownershipPct)||ownershipPct<=0||ownershipPct>100)throw new BadRequestException('Ownership % must be greater than 0 and at most 100');
    const payload={branchId,entityCode:String(body?.entityCode||branch.code).trim().toUpperCase(),entityName:String(body?.entityName||branch.name).trim(),localCurrency:this.currency(body?.localCurrency||'USD'),groupCurrency:this.currency(body?.groupCurrency||'USD'),ownershipPct:this.round(ownershipPct),active:body?.active!==false,notes:body?.notes?String(body.notes):null,updatedBy:user.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'ENTITY_CONFIG_SET',externalId:branchId,objectType:'EntityConfig',objectId:branchId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'GROUP_ENTITY_CONFIG_SET',objectType:'Branch',objectId:branchId,detail:payload});return payload;
  }

  private async fxMap(period?:string){
    const rows:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'FXRate',...(period?{payload:{path:['period'],equals:period}}:{})},orderBy:{createdAt:'asc'}}).catch(async()=>this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'FXRate'},orderBy:{createdAt:'asc'}}));
    const map=new Map<string,any>();for(const r of rows){const p=this.payload(r);if(!period||p.period===period)map.set(r.objectId,{...p,objectId:r.objectId,updatedAt:r.createdAt});}return map;
  }

  async fxRates(period:string|undefined,user:ScopeUser){this.access(user);const map=await this.fxMap(period);return Array.from(map.values()).sort((a:any,b:any)=>String(a.objectId).localeCompare(String(b.objectId)));}

  async setFxRate(body:any,user:ScopeUser){
    this.access(user);const period=this.period(body?.period);const from=this.currency(body?.fromCurrency);const to=this.currency(body?.toCurrency);if(from===to)throw new BadRequestException('FX currencies must be different');
    const rateType=String(body?.rateType||'CLOSING').toUpperCase();if(!['AVERAGE','CLOSING'].includes(rateType))throw new BadRequestException('Rate type must be AVERAGE or CLOSING');
    const rate=Number(body?.rate);if(!Number.isFinite(rate)||rate<=0)throw new BadRequestException('FX rate must be greater than zero');
    const objectId=`${period}:${from}:${to}:${rateType}`;const payload={period,fromCurrency:from,toCurrency:to,rateType,rate:Number(rate),source:body?.source?String(body.source):'MANUAL',updatedBy:user.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'FX_RATE_SET',externalId:objectId,objectType:'FXRate',objectId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'GROUP_FX_RATE_SET',objectType:'FXRate',objectId,detail:payload});return payload;
  }

  private rateFor(period:string,from:string,to:string,rateType:string,map:Map<string,any>){
    if(from===to)return 1;const direct=map.get(`${period}:${from}:${to}:${rateType}`);if(direct&&Number(direct.rate)>0)return Number(direct.rate);
    const inverse=map.get(`${period}:${to}:${from}:${rateType}`);if(inverse&&Number(inverse.rate)>0)return 1/Number(inverse.rate);return null;
  }

  private buildJournal(rows:any[]){const created=rows.find((e:any)=>e.eventType==='JOURNAL_CREATED');if(!created)return null;const posted=rows.find((e:any)=>e.eventType==='JOURNAL_POSTED');return {...this.payload(created),journalNo:created.objectId,status:posted?'POSTED':'DRAFT',createdAt:created.createdAt,postedAt:posted?.createdAt||null};}
  private async journalsRaw(){const events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:GL_SOURCE,objectType:'JournalEntry'},orderBy:{createdAt:'asc'}});const grouped=new Map<string,any[]>();for(const e of events){if(!grouped.has(e.objectId))grouped.set(e.objectId,[]);grouped.get(e.objectId)!.push(e);}return Array.from(grouped.values()).map((r:any)=>this.buildJournal(r)).filter((x:any)=>Boolean(x));}

  private async intercompanyRows(){
    const events:any[]=await this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'IntercompanyTransaction'},orderBy:{createdAt:'asc'}});const grouped=new Map<string,any[]>();for(const e of events){if(!grouped.has(e.objectId))grouped.set(e.objectId,[]);grouped.get(e.objectId)!.push(e);}
    return Array.from(grouped.values()).map((rows:any[])=>{const created=rows.find((e:any)=>e.eventType==='INTERCOMPANY_CREATED');if(!created)return null;const posted=rows.find((e:any)=>e.eventType==='INTERCOMPANY_POSTED');return {...this.payload(created),transactionNo:created.objectId,status:posted?'POSTED':'DRAFT',postedAt:posted?.createdAt||null,fromJournalNo:posted?this.payload(posted).fromJournalNo||null:null,toJournalNo:posted?this.payload(posted).toJournalNo||null:null};}).filter((x:any)=>Boolean(x));
  }

  async intercompany(user:ScopeUser){this.access(user);const rows:any[]=await this.intercompanyRows();return rows.sort((a:any,b:any)=>new Date(b.transactionDate).getTime()-new Date(a.transactionDate).getTime());}

  async createIntercompany(body:any,user:ScopeUser){
    this.access(user);const fromEntityId=this.req(body?.fromEntityId,'From entity');const toEntityId=this.req(body?.toEntityId,'To entity');if(fromEntityId===toEntityId)throw new BadRequestException('Intercompany entities must be different');
    const configs=await this.entityConfigMap();const from=configs.get(fromEntityId),to=configs.get(toEntityId);if(!from||from.active===false)throw new BadRequestException('From entity is not configured or inactive');if(!to||to.active===false)throw new BadRequestException('To entity is not configured or inactive');
    const amount=this.round(body?.amount);if(!Number.isFinite(amount)||amount<=0)throw new BadRequestException('Amount must be greater than zero');const transactionDate=this.date(body?.transactionDate||new Date(),'Transaction date');const period=this.period(transactionDate.toISOString().slice(0,7));
    const transactionNo=String(body?.transactionNo||`IC-${period.replace('-','')}-${Date.now().toString().slice(-7)}`).trim().toUpperCase();const duplicate=await this.db.integrationEvent.findFirst({where:{sourceSystem:SOURCE,objectType:'IntercompanyTransaction',objectId:transactionNo}});if(duplicate)throw new BadRequestException(`Intercompany transaction ${transactionNo} already exists`);
    const payload={transactionNo,transactionDate:transactionDate.toISOString(),period,fromEntityId,toEntityId,fromEntityCode:from.entityCode,toEntityCode:to.entityCode,amount,currency:this.currency(body?.currency||from.localCurrency||'USD'),description:this.req(body?.description||'Intercompany charge','Description'),receivableAccount:String(body?.receivableAccount||'1310-INTERCOMPANY-RECEIVABLE').toUpperCase(),payableAccount:String(body?.payableAccount||'2310-INTERCOMPANY-PAYABLE').toUpperCase(),revenueAccount:String(body?.revenueAccount||'4100-INTERCOMPANY-REVENUE').toUpperCase(),expenseAccount:String(body?.expenseAccount||'5100-INTERCOMPANY-EXPENSE').toUpperCase(),createdBy:user.sub};
    await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'INTERCOMPANY_CREATED',externalId:transactionNo,objectType:'IntercompanyTransaction',objectId:transactionNo,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'INTERCOMPANY_CREATE',objectType:'IntercompanyTransaction',objectId:transactionNo,detail:{fromEntityId,toEntityId,amount,currency:payload.currency}});return {...payload,status:'DRAFT'};
  }

  async postIntercompany(transactionNo:string,user:ScopeUser){
    this.access(user);const rows:any[]=await this.intercompanyRows();const tx=rows.find((x:any)=>x.transactionNo===transactionNo);if(!tx)throw new NotFoundException('Intercompany transaction not found');if(tx.status==='POSTED')return tx;
    const state=await this.periodState(tx.period);if(state.status==='CLOSED')throw new BadRequestException(`Period ${tx.period} is closed`);
    const journals:any[]=await this.journalsRaw();const fromRef=`INTERCOMPANY:${transactionNo}:FROM`,toRef=`INTERCOMPANY:${transactionNo}:TO`;const existingFrom=journals.find((j:any)=>j.reference===fromRef),existingTo=journals.find((j:any)=>j.reference===toRef);if(existingFrom||existingTo){if(existingFrom&&existingTo)return {...tx,status:'POSTED',fromJournalNo:existingFrom.journalNo,toJournalNo:existingTo.journalNo};throw new BadRequestException('Partial intercompany posting detected; review before retry');}
    const clean=String(transactionNo).replace(/[^A-Z0-9]/gi,'').slice(-12).toUpperCase();const fromJournalNo=`IC-${clean}-A`,toJournalNo=`IC-${clean}-B`;
    const fromPayload={journalNo:fromJournalNo,journalDate:tx.transactionDate,period:tx.period,currency:tx.currency,entityId:tx.fromEntityId,entityCode:tx.fromEntityCode,description:tx.description,reference:fromRef,source:'INTERCOMPANY',eliminationGroup:transactionNo,lines:[{account:tx.receivableAccount,description:tx.description,debit:tx.amount,credit:0,entityId:tx.fromEntityId},{account:tx.revenueAccount,description:tx.description,debit:0,credit:tx.amount,entityId:tx.fromEntityId}],totalDebit:tx.amount,totalCredit:tx.amount};
    const toPayload={journalNo:toJournalNo,journalDate:tx.transactionDate,period:tx.period,currency:tx.currency,entityId:tx.toEntityId,entityCode:tx.toEntityCode,description:tx.description,reference:toRef,source:'INTERCOMPANY',eliminationGroup:transactionNo,lines:[{account:tx.expenseAccount,description:tx.description,debit:tx.amount,credit:0,entityId:tx.toEntityId},{account:tx.payableAccount,description:tx.description,debit:0,credit:tx.amount,entityId:tx.toEntityId}],totalDebit:tx.amount,totalCredit:tx.amount};
    const now=new Date();await this.db.$transaction([
      this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_CREATED',externalId:fromJournalNo,objectType:'JournalEntry',objectId:fromJournalNo,status:'COMPLETED',payload:fromPayload,completedAt:now}}),
      this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_POSTED',externalId:fromJournalNo,objectType:'JournalEntry',objectId:fromJournalNo,status:'COMPLETED',payload:{journalNo:fromJournalNo,postedBy:user.sub,sourceReference:fromRef},completedAt:now}}),
      this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_CREATED',externalId:toJournalNo,objectType:'JournalEntry',objectId:toJournalNo,status:'COMPLETED',payload:toPayload,completedAt:now}}),
      this.db.integrationEvent.create({data:{sourceSystem:GL_SOURCE,eventType:'JOURNAL_POSTED',externalId:toJournalNo,objectType:'JournalEntry',objectId:toJournalNo,status:'COMPLETED',payload:{journalNo:toJournalNo,postedBy:user.sub,sourceReference:toRef},completedAt:now}}),
      this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'INTERCOMPANY_POSTED',externalId:transactionNo,objectType:'IntercompanyTransaction',objectId:transactionNo,status:'COMPLETED',payload:{transactionNo,fromJournalNo,toJournalNo,postedBy:user.sub},completedAt:now}})
    ]);
    await this.audit.log({actorId:user.sub,action:'INTERCOMPANY_POST',objectType:'IntercompanyTransaction',objectId:transactionNo,detail:{fromJournalNo,toJournalNo,period:tx.period,amount:tx.amount,currency:tx.currency}});return {...tx,status:'POSTED',fromJournalNo,toJournalNo};
  }

  private classify(account:any){const c=String(account||'')[0];if(c==='1')return 'ASSET';if(c==='2')return 'LIABILITY';if(c==='3')return 'EQUITY';if(c==='4')return 'REVENUE';if(['5','6','7','8','9'].includes(c))return 'EXPENSE';return 'OTHER';}
  private resolveEntity(journal:any,bookingMap:Map<string,string|null>):string|null{
    if(journal.entityId)return String(journal.entityId);
    const explicit:string[]=Array.from(new Set<string>((journal.lines||[]).map((l:any)=>l.entityId).filter(Boolean).map((x:any)=>String(x))));
    if(explicit.length===1)return explicit[0];if(explicit.length>1)return null;
    const branches:string[]=Array.from(new Set<string>((journal.lines||[]).map((l:any)=>l.bookingId?bookingMap.get(String(l.bookingId)):null).filter(Boolean).map((x:any)=>String(x))));
    return branches.length===1?branches[0]:null;
  }

  async consolidation(periodInput:string,groupCurrencyInput:string|undefined,user:ScopeUser){
    this.access(user);const period=this.period(periodInput);const [configs,journals,fx,ic,entityRows]=await Promise.all([this.entityConfigMap(),this.journalsRaw(),this.fxMap(period),this.intercompanyRows(),this.entities(user)]);const configured=Array.from(configs.values()).filter((x:any)=>x.active!==false);const groupCurrency=this.currency(groupCurrencyInput||configured[0]?.groupCurrency||'USD');
    const periodJournals=(journals as any[]).filter((j:any)=>j.status==='POSTED'&&j.period===period);const bookingIds:string[]=Array.from(new Set<string>(periodJournals.flatMap((j:any)=>(j.lines||[]).map((l:any)=>l.bookingId).filter(Boolean).map((x:any)=>String(x)))));const bookings:any[]=bookingIds.length?await this.db.booking.findMany({where:{id:{in:bookingIds}},select:{id:true,owningBranchId:true}}):[];const bookingMap=new Map<string,string|null>();for(const b of bookings)bookingMap.set(b.id,b.owningBranchId||null);
    const buckets=new Map<string,any>();for(const e of entityRows.filter((x:any)=>x.configured&&x.active))buckets.set(e.branchId,{entityId:e.branchId,entityCode:e.entityCode,entityName:e.entityName,localCurrency:e.localCurrency,groupCurrency,ownershipPct:e.ownershipPct,revenue:0,expenses:0,netProfit:0,assets:0,liabilities:0,equity:0,equityWithCurrentProfit:0,journalCount:0});
    const exceptions:any[]=[];
    for(const journal of periodJournals){const entityId=this.resolveEntity(journal,bookingMap);if(!entityId){exceptions.push({type:'JOURNAL_UNASSIGNED',journalNo:journal.journalNo,message:'Posted journal cannot be mapped to one entity'});continue;}const config=configs.get(entityId);if(!config||config.active===false){exceptions.push({type:'ENTITY_UNCONFIGURED',journalNo:journal.journalNo,entityId,message:'Journal entity is not configured for consolidation'});continue;}if(!buckets.has(entityId))buckets.set(entityId,{entityId,entityCode:config.entityCode,entityName:config.entityName,localCurrency:config.localCurrency,groupCurrency,ownershipPct:config.ownershipPct||100,revenue:0,expenses:0,netProfit:0,assets:0,liabilities:0,equity:0,equityWithCurrentProfit:0,journalCount:0});const bucket=buckets.get(entityId);bucket.journalCount++;
      for(const line of journal.lines||[]){const cls=this.classify(line.account);const rateType=['REVENUE','EXPENSE'].includes(cls)?'AVERAGE':'CLOSING';const rate=this.rateFor(period,String(journal.currency||config.localCurrency||'USD').toUpperCase(),groupCurrency,rateType,fx);if(rate==null){exceptions.push({type:'FX_RATE_MISSING',journalNo:journal.journalNo,account:line.account,fromCurrency:journal.currency,toCurrency:groupCurrency,rateType,message:`Missing ${rateType.toLowerCase()} FX rate`});continue;}const debit=this.round(Number(line.debit||0)*rate),credit=this.round(Number(line.credit||0)*rate);if(cls==='ASSET')bucket.assets=this.round(bucket.assets+debit-credit);else if(cls==='LIABILITY')bucket.liabilities=this.round(bucket.liabilities+credit-debit);else if(cls==='EQUITY')bucket.equity=this.round(bucket.equity+credit-debit);else if(cls==='REVENUE')bucket.revenue=this.round(bucket.revenue+credit-debit);else if(cls==='EXPENSE')bucket.expenses=this.round(bucket.expenses+debit-credit);}
    }
    const entities=Array.from(buckets.values()).map((b:any)=>({...b,netProfit:this.round(b.revenue-b.expenses),equityWithCurrentProfit:this.round(b.equity+b.revenue-b.expenses)}));
    let eliminationRevenue=0,eliminationExpenses=0,eliminationAssets=0,eliminationLiabilities=0;for(const tx of (ic as any[]).filter((x:any)=>x.status==='POSTED'&&x.period===period)){const avg=this.rateFor(period,String(tx.currency).toUpperCase(),groupCurrency,'AVERAGE',fx),closing=this.rateFor(period,String(tx.currency).toUpperCase(),groupCurrency,'CLOSING',fx);if(avg==null)exceptions.push({type:'FX_RATE_MISSING',transactionNo:tx.transactionNo,fromCurrency:tx.currency,toCurrency:groupCurrency,rateType:'AVERAGE',message:'Missing average FX rate for intercompany elimination'});else{eliminationRevenue=this.round(eliminationRevenue+tx.amount*avg);eliminationExpenses=this.round(eliminationExpenses+tx.amount*avg);}if(closing==null)exceptions.push({type:'FX_RATE_MISSING',transactionNo:tx.transactionNo,fromCurrency:tx.currency,toCurrency:groupCurrency,rateType:'CLOSING',message:'Missing closing FX rate for intercompany elimination'});else{eliminationAssets=this.round(eliminationAssets+tx.amount*closing);eliminationLiabilities=this.round(eliminationLiabilities+tx.amount*closing);}}
    const gross={revenue:this.round(entities.reduce((s:any,e:any)=>s+e.revenue,0)),expenses:this.round(entities.reduce((s:any,e:any)=>s+e.expenses,0)),assets:this.round(entities.reduce((s:any,e:any)=>s+e.assets,0)),liabilities:this.round(entities.reduce((s:any,e:any)=>s+e.liabilities,0)),equity:this.round(entities.reduce((s:any,e:any)=>s+e.equity,0))};const consolidated={revenue:this.round(gross.revenue-eliminationRevenue),expenses:this.round(gross.expenses-eliminationExpenses),assets:this.round(gross.assets-eliminationAssets),liabilities:this.round(gross.liabilities-eliminationLiabilities),equity:gross.equity};(consolidated as any).netProfit=this.round(consolidated.revenue-consolidated.expenses);(consolidated as any).equityWithCurrentProfit=this.round(consolidated.equity+(consolidated as any).netProfit);(consolidated as any).balanceCheck=this.round(consolidated.assets-consolidated.liabilities-(consolidated as any).equityWithCurrentProfit);
    return {period,groupCurrency,entities,gross,eliminations:{revenue:eliminationRevenue,expenses:eliminationExpenses,assets:eliminationAssets,liabilities:eliminationLiabilities},consolidated,exceptions};
  }

  async exceptions(periodInput:string,groupCurrency:string|undefined,user:ScopeUser){this.access(user);const period=this.period(periodInput);const [report,entities,ic]=await Promise.all([this.consolidation(period,groupCurrency,user),this.entities(user),this.intercompany(user)]);const extra:any[]=[];for(const e of entities.filter((x:any)=>x.branchActive&&!x.configured))extra.push({type:'ENTITY_UNCONFIGURED',entityId:e.branchId,message:`Branch ${e.branchCode} is not configured as a reporting entity`});for(const tx of (ic as any[]).filter((x:any)=>x.period===period&&x.status!=='POSTED'))extra.push({type:'INTERCOMPANY_UNPOSTED',transactionNo:tx.transactionNo,message:'Intercompany transaction is still draft'});return [...report.exceptions,...extra];}

  async dashboard(periodInput:string,groupCurrency:string|undefined,user:ScopeUser){this.access(user);const period=this.period(periodInput);const [report,entities,fx,ic,exceptions]=await Promise.all([this.consolidation(period,groupCurrency,user),this.entities(user),this.fxRates(period,user),this.intercompany(user),this.exceptions(period,groupCurrency,user)]);return {period,groupCurrency:report.groupCurrency,entityCount:entities.filter((x:any)=>x.configured&&x.active).length,unconfiguredBranches:entities.filter((x:any)=>x.branchActive&&!x.configured).length,fxRateCount:fx.length,draftIntercompany:(ic as any[]).filter((x:any)=>x.period===period&&x.status!=='POSTED').length,exceptionCount:exceptions.length,consolidated:report.consolidated};}
}
