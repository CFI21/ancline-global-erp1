import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_SALES_CRM';
@Injectable()
export class SalesCrmService{
 constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
 private get db():any{return this.prisma as any;}
 private internal(u:ScopeUser){this.scope.assertInternal(u);}
 private p(e:any){return (e?.payload||{}) as any;}
 private async events(type:string):Promise<any[]>{return this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:type},orderBy:{createdAt:'asc'}});}
 private latest(rows:any[],createType:string,patchType:string){const g=new Map<string,any[]>();for(const e of rows){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const out:any[]=[];for(const [id,ev] of g){const c=ev.find((x:any)=>x.eventType===createType);if(!c)continue;let row={id,...this.p(c),createdAt:c.createdAt};for(const x of ev.filter((x:any)=>x.eventType===patchType))row={...row,...this.p(x),updatedAt:x.createdAt};out.push(row);}return out;}
 async customers(u:ScopeUser){this.internal(u);return this.db.organization.findMany({where:{roles:{has:'CUSTOMER'},active:true},select:{id:true,code:true,name:true,countryCode:true},orderBy:{name:'asc'}});}
 async organizations(u:ScopeUser){this.internal(u);return this.db.organization.findMany({where:{active:true},select:{id:true,code:true,name:true,roles:true,countryCode:true,registrationRef:true,kycData:true},orderBy:{name:'asc'}});}
 async opportunities(u:ScopeUser){this.internal(u);return this.latest(await this.events('Opportunity'),'OPPORTUNITY_CREATED','OPPORTUNITY_UPDATED').sort((a:any,b:any)=>new Date(b.updatedAt||b.createdAt).getTime()-new Date(a.updatedAt||a.createdAt).getTime());}
 async opportunity(id:string,u:ScopeUser){
  this.internal(u);
  const row=(await this.opportunities(u)).find((x:any)=>x.opportunityId===id||x.id===id);
  if(!row)throw new NotFoundException('Opportunity not found');
  const [customer,leads]=await Promise.all([
    row.customerId?this.db.organization.findUnique({where:{id:String(row.customerId)},select:{id:true,code:true,name:true,countryCode:true,registrationRef:true,kycData:true}}):null,
    this.leads(u)
  ]);
  const sourceLead=leads.find((x:any)=>x.leadId===row.sourceLeadId||x.inquiryNo===row.sourceInquiryNo)||null;
  return {...row,customer,sourceLead};
 }
 async opportunityActivities(id:string,u:ScopeUser){
  await this.opportunity(id,u);
  const rows=await this.events('OpportunityActivity');
  return rows.map((e:any)=>({...this.p(e),createdAt:e.createdAt}))
    .filter((x:any)=>String(x.opportunityId)===id)
    .sort((a:any,b:any)=>new Date(b.createdAt||b.date).getTime()-new Date(a.createdAt||a.date).getTime());
 }
 async addOpportunityActivity(id:string,b:any,u:ScopeUser){
  const opp=await this.opportunity(id,u);
  if(!String(b?.subject||'').trim())throw new BadRequestException('Activity subject is required');
  const activityId=`OACT-${Date.now()}`;
  const payload={activityId,opportunityId:opp.opportunityId,date:b?.date?new Date(b.date).toISOString():new Date().toISOString(),type:String(b?.type||'FOLLOW_UP').toUpperCase(),contact:String(b?.contact||opp.inquiryContact||''),subject:String(b.subject).trim(),notes:b?.notes?String(b.notes):null,createdBy:u.sub};
  await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'OPPORTUNITY_ACTIVITY_CREATED',externalId:activityId,objectType:'OpportunityActivity',objectId:activityId,status:'COMPLETED',payload,completedAt:new Date()}});
  await this.audit.log({actorId:u.sub,action:'CRM_OPPORTUNITY_ACTIVITY',objectType:'Opportunity',objectId:opp.opportunityId,detail:{activityId,type:payload.type,subject:payload.subject}});
  return payload;
 }
 async opportunityLogs(id:string,u:ScopeUser){
  const opp=await this.opportunity(id,u);
  const [events,audit]=await Promise.all([
    this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'Opportunity',objectId:opp.opportunityId},orderBy:{createdAt:'desc'}}),
    this.db.auditEvent.findMany({where:{objectType:'Opportunity',objectId:opp.opportunityId},orderBy:{createdAt:'desc'},take:100})
  ]);
  return {events:events.map((e:any)=>({eventType:e.eventType,status:e.status,createdAt:e.createdAt,payload:e.payload})),audit};
 }
 async createOpportunity(b:any,u:ScopeUser){this.internal(u);if(!b?.customerId||!b?.name)throw new BadRequestException('Customer and opportunity name are required');const value=Number(b?.value||0),probability=Math.max(0,Math.min(100,Number(b?.probability??20)));if(!Number.isFinite(value))throw new BadRequestException('Invalid opportunity value');const id=`OPP-${Date.now()}`;const payload={opportunityId:id,name:String(b.name),customerId:String(b.customerId),owner:String(b.owner||u.email||u.sub),stage:String(b.stage||'QUALIFY').toUpperCase(),probability,value,currency:String(b.currency||'USD').toUpperCase(),origin:b.origin?String(b.origin).toUpperCase():null,destination:b.destination?String(b.destination).toUpperCase():null,equipment:b.equipment?String(b.equipment).toUpperCase():null,expectedClose:b.expectedClose?new Date(b.expectedClose).toISOString():null,source:b.source?String(b.source):'DIRECT',notes:b.notes?String(b.notes):null,status:'OPEN',sourceLeadId:b.sourceLeadId?String(b.sourceLeadId):null,sourceInquiryNo:b.sourceInquiryNo?String(b.sourceInquiryNo):null,inquiryContact:b.inquiryContact?String(b.inquiryContact):null,inquiryEmail:b.inquiryEmail?String(b.inquiryEmail):null,inquiryPhone:b.inquiryPhone?String(b.inquiryPhone):null,leadInterest:b.leadInterest?String(b.leadInterest):null,leadSource:b.leadSource?String(b.leadSource):null,leadSourceDetails:b.leadSourceDetails?String(b.leadSourceDetails):null,referringOrganization:b.referringOrganization?String(b.referringOrganization):null,referringContact:b.referringContact?String(b.referringContact):null,createdBy:u.sub};await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'OPPORTUNITY_CREATED',externalId:id,objectType:'Opportunity',objectId:id,status:'OPEN',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'CRM_OPPORTUNITY_CREATE',objectType:'Opportunity',objectId:id,detail:{customerId:payload.customerId,value,currency:payload.currency}});return payload;}
 async updateOpportunity(id:string,b:any,u:ScopeUser){this.internal(u);const row=(await this.opportunities(u)).find((x:any)=>x.opportunityId===id||x.id===id);if(!row)throw new NotFoundException('Opportunity not found');const allowed=['name','owner','stage','probability','value','currency','origin','destination','equipment','expectedClose','source','notes','status','lossReason','competitor','wonQuoteId','sourceLeadId','sourceInquiryNo','inquiryContact','inquiryEmail','inquiryPhone','leadInterest','leadSource','leadSourceDetails','referringOrganization','referringContact'];const payload:any={opportunityId:id,updatedBy:u.sub};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(b,k))payload[k]=b[k];if(payload.probability!=null)payload.probability=Math.max(0,Math.min(100,Number(payload.probability)));if(payload.value!=null)payload.value=Number(payload.value);if(payload.stage)payload.stage=String(payload.stage).toUpperCase();if(payload.status)payload.status=String(payload.status).toUpperCase();await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'OPPORTUNITY_UPDATED',externalId:id,objectType:'Opportunity',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});await this.audit.log({actorId:u.sub,action:'CRM_OPPORTUNITY_UPDATE',objectType:'Opportunity',objectId:id,detail:payload});return {...row,...payload};}
 async leads(u:ScopeUser){
  this.internal(u);
  return this.latest(await this.events('SalesLead'),'LEAD_CREATED','LEAD_UPDATED')
    .sort((a:any,b:any)=>new Date(b.updatedAt||b.createdAt).getTime()-new Date(a.updatedAt||a.createdAt).getTime());
 }
 async lead(id:string,u:ScopeUser){
  this.internal(u);
  const row=(await this.leads(u)).find((x:any)=>x.leadId===id||x.id===id||x.inquiryNo===id);
  if(!row)throw new NotFoundException('Inquiry / lead not found');
  const opps=await this.opportunities(u);
  const opportunity=opps.find((x:any)=>x.sourceLeadId===row.leadId||x.opportunityId===row.opportunityId)||null;
  return {...row,opportunity};
 }
 async createLead(b:any,u:ScopeUser){
  this.internal(u);
  if(!b?.organizationId&&!String(b?.organizationName||'').trim())throw new BadRequestException('Organization is required');
  if(!String(b?.contactName||'').trim())throw new BadRequestException('Inquiry contact is required');
  const now=Date.now(),id=`LEAD-${now}`,inquiryNo=b.inquiryNo?String(b.inquiryNo):`INQ-${String(now).slice(-9)}`;
  let org:any=null;
  if(b.organizationId)org=await this.db.organization.findUnique({where:{id:String(b.organizationId)}});
  const kyc=(org?.kycData||{}) as any;
  const payload:any={
    leadId:id,inquiryNo,
    inquiryType:String(b.inquiryType||'EMAIL').toUpperCase(),
    inquiryTypeLabel:String(b.inquiryTypeLabel||'Email Inquiry'),
    organizationId:org?.id||b.organizationId||null,
    organizationCode:org?.code||b.organizationCode||null,
    organizationName:String(b.organizationName||org?.name||'').trim(),
    address1:b.address1??kyc.address1??null,address2:b.address2??kyc.address2??null,
    portCountry:b.portCountry??b.countryCode??org?.countryCode??null,
    city:b.city??kyc.city??null,postCode:b.postCode??kyc.postCode??null,state:b.state??kyc.state??null,
    website:b.website??kyc.website??null,registrationNumber:b.registrationNumber??org?.registrationRef??null,
    contactName:String(b.contactName||'').trim(),phone:b.phone?String(b.phone):null,emailAddress:b.emailAddress?String(b.emailAddress):null,
    mobile:b.mobile?String(b.mobile):null,faxNumber:b.faxNumber?String(b.faxNumber):null,jobDescription:b.jobDescription?String(b.jobDescription):null,
    status:String(b.status||'OPEN').toUpperCase(),assignedSalesRep:String(b.assignedSalesRep||u.email||u.sub),
    originalCall:b.originalCall?new Date(b.originalCall).toISOString():new Date().toISOString(),
    leadInterest:String(b.leadInterest||'WARM').toUpperCase(),closeReason:b.closeReason?String(b.closeReason):null,
    leadSourceCode:String(b.leadSourceCode||'DIRECT').toUpperCase(),leadSourceName:String(b.leadSourceName||b.leadSource||'Direct'),
    sourceDetails:b.sourceDetails?String(b.sourceDetails):null,referringOrganization:b.referringOrganization?String(b.referringOrganization):null,
    referringContact:b.referringContact?String(b.referringContact):null,notes:b.notes?String(b.notes):null,
    customFields:b.customFields&&typeof b.customFields==='object'?b.customFields:{},
    opportunityId:null,createdBy:u.sub
  };
  await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'LEAD_CREATED',externalId:inquiryNo,objectType:'SalesLead',objectId:id,status:'OPEN',payload,completedAt:new Date()}});
  await this.audit.log({actorId:u.sub,action:'CRM_LEAD_CREATE',objectType:'SalesLead',objectId:id,detail:{inquiryNo,organizationId:payload.organizationId,organizationName:payload.organizationName}});
  return payload;
 }
 async updateLead(id:string,b:any,u:ScopeUser){
  this.internal(u);
  const row=(await this.leads(u)).find((x:any)=>x.leadId===id||x.id===id||x.inquiryNo===id);
  if(!row)throw new NotFoundException('Inquiry / lead not found');
  const allowed=['inquiryType','inquiryTypeLabel','organizationId','organizationCode','organizationName','address1','address2','portCountry','city','postCode','state','website','registrationNumber','contactName','phone','emailAddress','mobile','faxNumber','jobDescription','status','assignedSalesRep','originalCall','leadInterest','closeReason','leadSourceCode','leadSourceName','sourceDetails','referringOrganization','referringContact','notes','customFields','opportunityId'];
  const payload:any={leadId:row.leadId,updatedBy:u.sub};
  for(const k of allowed)if(Object.prototype.hasOwnProperty.call(b,k))payload[k]=b[k];
  if(payload.status)payload.status=String(payload.status).toUpperCase();
  if(payload.leadInterest)payload.leadInterest=String(payload.leadInterest).toUpperCase();
  if(payload.leadSourceCode)payload.leadSourceCode=String(payload.leadSourceCode).toUpperCase();
  if(payload.originalCall)payload.originalCall=new Date(payload.originalCall).toISOString();
  await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'LEAD_UPDATED',externalId:row.inquiryNo,objectType:'SalesLead',objectId:row.leadId,status:'COMPLETED',payload,completedAt:new Date()}});
  await this.audit.log({actorId:u.sub,action:'CRM_LEAD_UPDATE',objectType:'SalesLead',objectId:row.leadId,detail:{fields:Object.keys(payload).filter(k=>!['leadId','updatedBy'].includes(k))}});
  return {...row,...payload};
 }
 async leadCommunications(id:string,u:ScopeUser){
  const row=await this.lead(id,u);
  const all=await this.events('LeadCommunication');
  return all.filter((e:any)=>String(this.p(e).leadId)===String(row.leadId)).map((e:any)=>({communicationId:e.objectId,...this.p(e),createdAt:e.createdAt})).sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
 }
 async addLeadCommunication(id:string,b:any,u:ScopeUser){
  const row=await this.lead(id,u);
  if(!String(b?.subject||'').trim())throw new BadRequestException('Communication subject is required');
  const communicationId=`LCOM-${Date.now()}`;
  const payload={communicationId,leadId:row.leadId,date:b.date?new Date(b.date).toISOString():new Date().toISOString(),type:String(b.type||'EMAIL').toUpperCase(),contact:String(b.contact||row.contactName||''),subject:String(b.subject),notes:b.notes?String(b.notes):null,createdBy:u.sub};
  await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'LEAD_COMMUNICATION_CREATED',externalId:communicationId,objectType:'LeadCommunication',objectId:communicationId,status:'COMPLETED',payload,completedAt:new Date()}});
  await this.audit.log({actorId:u.sub,action:'CRM_LEAD_COMMUNICATION',objectType:'SalesLead',objectId:row.leadId,detail:{communicationId,type:payload.type,subject:payload.subject}});
  return payload;
 }
 async leadLogs(id:string,u:ScopeUser){
  const row=await this.lead(id,u);
  const [events,audit]=await Promise.all([
    this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType:'SalesLead',objectId:row.leadId},orderBy:{createdAt:'desc'}}),
    this.db.auditEvent.findMany({where:{objectType:'SalesLead',objectId:row.leadId},orderBy:{createdAt:'desc'},take:100})
  ]);
  return {events:events.map((e:any)=>({eventType:e.eventType,status:e.status,createdAt:e.createdAt,payload:e.payload})),audit};
 }
 async convertLeadToOpportunity(id:string,b:any,u:ScopeUser){
  this.internal(u);
  let lead=await this.lead(id,u);
  if(lead.opportunity?.opportunityId||lead.opportunityId){
    const oppId=lead.opportunity?.opportunityId||lead.opportunityId;
    const opp=(await this.opportunities(u)).find((x:any)=>x.opportunityId===oppId);
    return {reused:true,lead,opportunity:opp||lead.opportunity,mapping:{sourceLeadId:lead.leadId,sourceInquiryNo:lead.inquiryNo}};
  }
  let organizationId=lead.organizationId;
  if(!organizationId){
    const code=`PROS-${String(Date.now()).slice(-7)}`;
    const org=await this.db.organization.create({data:{code,name:String(lead.organizationName||'Prospect'),roles:['CUSTOMER'],countryCode:lead.portCountry?String(lead.portCountry).slice(0,2).toUpperCase():null,registrationRef:lead.registrationNumber||null,kycData:{address1:lead.address1||null,address2:lead.address2||null,city:lead.city||null,postCode:lead.postCode||null,state:lead.state||null,website:lead.website||null,leadContact:{name:lead.contactName||null,phone:lead.phone||null,email:lead.emailAddress||null,mobile:lead.mobile||null}}}});
    organizationId=org.id;
    lead=await this.updateLead(lead.leadId,{organizationId:org.id,organizationCode:org.code},u);
  }
  const interest=String(lead.leadInterest||'WARM').toUpperCase();
  const probability=b?.probability!=null?Number(b.probability):(interest==='HOT'?70:interest==='WARM'?35:10);
  const source=[lead.leadSourceCode,lead.leadSourceName].filter(Boolean).join(' - ')||'LEAD';
  const opp=await this.createOpportunity({
    customerId:organizationId,
    name:String(b?.name||`${lead.organizationName||'Prospect'} - ${lead.inquiryTypeLabel||'Inquiry'}`),
    owner:b?.owner||lead.assignedSalesRep||u.email||u.sub,stage:b?.stage||'QUALIFY',probability,
    value:Number(b?.value||0),currency:String(b?.currency||'USD'),origin:b?.origin||null,destination:b?.destination||null,
    equipment:b?.equipment||null,expectedClose:b?.expectedClose||null,source,notes:b?.notes||lead.notes||null,
    sourceLeadId:lead.leadId,sourceInquiryNo:lead.inquiryNo,inquiryContact:lead.contactName,inquiryEmail:lead.emailAddress,
    inquiryPhone:lead.phone||lead.mobile,leadInterest:lead.leadInterest,leadSource:source,leadSourceDetails:lead.sourceDetails,
    referringOrganization:lead.referringOrganization,referringContact:lead.referringContact
  },u);
  const updated=await this.updateLead(lead.leadId,{opportunityId:opp.opportunityId,status:'CONVERTED'},u);
  await this.audit.log({actorId:u.sub,action:'CRM_LEAD_CONVERT_TO_OPPORTUNITY',objectType:'SalesLead',objectId:lead.leadId,detail:{inquiryNo:lead.inquiryNo,opportunityId:opp.opportunityId,customerId:organizationId}});
  return {lead:updated,opportunity:opp,mapping:{
    inquiryNo:'sourceInquiryNo',leadId:'sourceLeadId',organizationId:'customerId',assignedSalesRep:'owner',
    leadInterest:'probability',leadSource:'source',notes:'notes',contactName:'inquiryContact',emailAddress:'inquiryEmail',phone:'inquiryPhone'
  }};
 }
 async tenders(u:ScopeUser){this.internal(u);return this.latest(await this.events('Tender'),'TENDER_CREATED','TENDER_UPDATED').sort((a:any,b:any)=>new Date(b.updatedAt||b.createdAt).getTime()-new Date(a.updatedAt||a.createdAt).getTime());}
 async createTender(b:any,u:ScopeUser){this.internal(u);if(!b?.customerId||!b?.name)throw new BadRequestException('Customer and tender name are required');const id=`RFQ-${Date.now()}`,deadline=b.deadline?new Date(b.deadline):null;if(deadline&&Number.isNaN(deadline.getTime()))throw new BadRequestException('Invalid deadline');const payload={tenderId:id,name:String(b.name),customerId:String(b.customerId),opportunityId:b.opportunityId?String(b.opportunityId):null,trade:b.trade?String(b.trade).toUpperCase():null,equipment:b.equipment?String(b.equipment).toUpperCase():null,estimatedVolume:Number(b.estimatedVolume||0),volumeUnit:String(b.volumeUnit||'TEU'),deadline:deadline?.toISOString()||null,status:String(b.status||'OPEN').toUpperCase(),owner:String(b.owner||u.email||u.sub),notes:b.notes?String(b.notes):null,createdBy:u.sub};await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'TENDER_CREATED',externalId:id,objectType:'Tender',objectId:id,status:'OPEN',payload,completedAt:new Date()}});return payload;}
 async updateTender(id:string,b:any,u:ScopeUser){this.internal(u);const row=(await this.tenders(u)).find((x:any)=>x.tenderId===id||x.id===id);if(!row)throw new NotFoundException('Tender not found');const payload={tenderId:id,...b,updatedBy:u.sub};await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'TENDER_UPDATED',externalId:id,objectType:'Tender',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});return {...row,...payload};}
 private quoteRows(events:any[]){const g=new Map<string,any[]>();for(const e of events){if(!g.has(e.objectId))g.set(e.objectId,[]);g.get(e.objectId)!.push(e);}const out:any[]=[];for(const [id,ev] of g){const c=ev.find((x:any)=>x.eventType==='QUOTE_VERSION_CREATED');if(!c)continue;const a=ev.find((x:any)=>x.eventType==='QUOTE_VERSION_APPROVED'),m=ev.find((x:any)=>x.eventType==='QUOTE_MATERIALIZED');out.push({quoteVersionId:id,...this.p(c),status:a?'APPROVED':'DRAFT',rateQuoteId:m?this.p(m).rateQuoteId||null:null,createdAt:c.createdAt});}return out.sort((a:any,b:any)=>b.version-a.version);}
 async quoteVersions(opportunityId:string,u:ScopeUser){this.internal(u);return this.quoteRows(await this.events('QuoteVersion')).filter((x:any)=>String(x.opportunityId)===opportunityId);}
 async createQuoteVersion(opportunityId:string,b:any,u:ScopeUser){this.internal(u);const opp=(await this.opportunities(u)).find((x:any)=>x.opportunityId===opportunityId||x.id===opportunityId);if(!opp)throw new NotFoundException('Opportunity not found');const existing=await this.quoteVersions(opportunityId,u),version=(existing[0]?.version||0)+1,buy=Number(b?.buyRate||0),sell=Number(b?.sellRate||0);if(!Number.isFinite(buy)||!Number.isFinite(sell)||buy<0||sell<0)throw new BadRequestException('Invalid buy/sell rate');const validTo=new Date(b?.validTo);if(Number.isNaN(validTo.getTime()))throw new BadRequestException('Valid-to date is required');const id=`QV-${Date.now()}`,payload={quoteVersionId:id,opportunityId,version,customerId:opp.customerId,trade:String(b?.trade||`${opp.origin||''}->${opp.destination||''}`).toUpperCase(),equipment:String(b?.equipment||opp.equipment||'40HC').toUpperCase(),buyRate:buy,sellRate:sell,currency:String(b?.currency||opp.currency||'USD').toUpperCase(),validFrom:new Date(b?.validFrom||new Date()).toISOString(),validTo:validTo.toISOString(),grossProfit:sell-buy,marginPct:sell?((sell-buy)/sell)*100:0,notes:b?.notes?String(b.notes):null,createdBy:u.sub};await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'QUOTE_VERSION_CREATED',externalId:id,objectType:'QuoteVersion',objectId:id,status:'DRAFT',payload,completedAt:new Date()}});return payload;}
 async approveQuoteVersion(id:string,u:ScopeUser){this.internal(u);const row=this.quoteRows(await this.events('QuoteVersion')).find((x:any)=>x.quoteVersionId===id);if(!row)throw new NotFoundException('Quote version not found');if(row.status==='APPROVED')return row;await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'QUOTE_VERSION_APPROVED',externalId:id,objectType:'QuoteVersion',objectId:id,status:'COMPLETED',payload:{quoteVersionId:id,approvedBy:u.sub},completedAt:new Date()}});return {...row,status:'APPROVED'};}
 async materializeQuote(id:string,u:ScopeUser){this.internal(u);const row=this.quoteRows(await this.events('QuoteVersion')).find((x:any)=>x.quoteVersionId===id);if(!row)throw new NotFoundException('Quote version not found');if(row.rateQuoteId)return {rateQuoteId:row.rateQuoteId,reused:true};if(row.status!=='APPROVED')throw new BadRequestException('Approve quote version before publishing');const opp=(await this.opportunities(u)).find((x:any)=>x.opportunityId===row.opportunityId)||null;const quote=await this.db.rateQuote.create({data:{quoteNo:`Q-${Date.now().toString().slice(-8)}`,customerId:row.customerId,trade:row.trade,equipment:row.equipment,buyRate:row.buyRate,sellRate:row.sellRate,currency:row.currency,validFrom:new Date(row.validFrom),validTo:new Date(row.validTo),status:'Rate Approved',source:'SALES_CRM',requestData:{sourceOpportunityId:row.opportunityId,sourceInquiryNo:opp?.sourceInquiryNo||null,quoteVersionId:id,opportunityName:opp?.name||null,inquiryContact:opp?.inquiryContact||null,inquiryEmail:opp?.inquiryEmail||null,inquiryPhone:opp?.inquiryPhone||null}}});await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType:'QUOTE_MATERIALIZED',externalId:id,objectType:'QuoteVersion',objectId:id,status:'COMPLETED',payload:{quoteVersionId:id,rateQuoteId:quote.id,quoteNo:quote.quoteNo,publishedBy:u.sub},completedAt:new Date()}});await this.updateOpportunity(row.opportunityId,{wonQuoteId:quote.id},u);return {rateQuoteId:quote.id,quoteNo:quote.quoteNo};}
 async closeOpportunity(id:string,result:string,b:any,u:ScopeUser){this.internal(u);const r=String(result).toUpperCase();if(!['WON','LOST'].includes(r))throw new BadRequestException('Result must be WON or LOST');return this.updateOpportunity(id,{status:r,stage:r,probability:r==='WON'?100:0,lossReason:r==='LOST'?String(b?.lossReason||'Unspecified'):null,competitor:r==='LOST'&&b?.competitor?String(b.competitor):null},u);}
 async dashboard(u:ScopeUser){this.internal(u);const [opps,tenders,leads]=await Promise.all([this.opportunities(u),this.tenders(u),this.leads(u)]),open=opps.filter((x:any)=>!['WON','LOST'].includes(String(x.status))),won=opps.filter((x:any)=>x.status==='WON'),lost=opps.filter((x:any)=>x.status==='LOST');const byCurrency=[...new Set<string>(open.map((x:any)=>String(x.currency||'USD'))) ].map(currency=>{const rows=open.filter((x:any)=>String(x.currency||'USD')===currency);return {currency,grossPipeline:rows.reduce((s:number,x:any)=>s+Number(x.value||0),0),weightedPipeline:rows.reduce((s:number,x:any)=>s+Number(x.value||0)*Number(x.probability||0)/100,0)};});const winRate=won.length+lost.length?won.length/(won.length+lost.length)*100:0;const lossReasons=Object.entries(lost.reduce((m:any,x:any)=>{const k=x.lossReason||'Unspecified';m[k]=(m[k]||0)+1;return m;},{})).map(([reason,count])=>({reason,count}));const openLeads=leads.filter((x:any)=>!['CONVERTED','CLOSED','LOST'].includes(String(x.status)));return {leads,opportunities:opps,tenders,summary:{openLeads:openLeads.length,convertedLeads:leads.filter((x:any)=>x.status==='CONVERTED').length,openOpportunities:open.length,won:won.length,lost:lost.length,winRate,openTenders:tenders.filter((x:any)=>x.status==='OPEN').length},pipelineByCurrency:byCurrency,lossReasons};}
}
