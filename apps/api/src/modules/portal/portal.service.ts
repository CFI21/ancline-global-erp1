import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { bookingScope, ScopeUser } from '../auth/scope';
import { ScopeService } from '../auth/scope.service';
import { AuditService } from '../audit/audit.service';
import { evaluateReleaseSecurity } from '../documents/release-security';

@Injectable()
export class PortalService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private allowedNvoccRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if(!['AGENT','BRANCH_OPS','GLOBAL_ADMIN'].includes(role))throw new ForbiddenException('NVOCC Portal access is limited to Agent, Branch Office and Global Admin users');
    return role;
  }

  private allowedPortalRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if(!['CUSTOMER','SHIPPER','CONSIGNEE','GLOBAL_ADMIN'].includes(role))throw new ForbiddenException('Global Forwarding Portal access is limited to Customer, Shipper, Consignee and Global Admin users');
    return role;
  }

  async customers(user:ScopeUser){
    const role=this.allowedPortalRole(user);
    if(role==='CUSTOMER'){
      if(!user.customerId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.customerId},select:{id:true,code:true,name:true,active:true,roles:true}});
      return row&&row.active?[row]:[];
    }
    if(role==='SHIPPER'||role==='CONSIGNEE'){
      if(!user.partyId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.partyId},select:{id:true,code:true,name:true,active:true,roles:true}});
      return row&&row.active?[row]:[];
    }
    return this.prisma.organization.findMany({
      where:{active:true,OR:[{roles:{has:'CUSTOMER'}},{roles:{has:'SHIPPER'}},{roles:{has:'CONSIGNEE'}}]},
      select:{id:true,code:true,name:true,active:true,roles:true},
      orderBy:{name:'asc'},take:500
    });
  }

  async directBooking(body:any,user:ScopeUser){
    const role=this.allowedPortalRole(user);
    const origin=String(body?.origin||'').trim().toUpperCase(),destination=String(body?.destination||'').trim().toUpperCase(),equipment=String(body?.equipment||'').trim().toUpperCase();
    if(!origin||!destination||!equipment)throw new BadRequestException('Origin, destination and equipment are required');
    if(origin===destination)throw new BadRequestException('Origin and destination must be different');
    let customerId=String(body?.customerId||'').trim();
    if(role==='CUSTOMER'){if(!user.customerId)throw new ForbiddenException('Customer account is not linked');customerId=user.customerId;}
    if(role==='SHIPPER'||role==='CONSIGNEE'){if(!user.partyId)throw new ForbiddenException('Forwarding party account is not linked');customerId=user.partyId;}
    if(!customerId)throw new BadRequestException('Forwarding contracting party is required');
    const party=await this.prisma.organization.findUnique({where:{id:customerId}});
    if(!party||!party.active)throw new BadRequestException('Forwarding contracting party must be active');
    const roles=Array.isArray(party.roles)?party.roles:[];
    const allowedParty=roles.some((x:any)=>['CUSTOMER','SHIPPER','CONSIGNEE'].includes(String(x)));
    if(!allowedParty)throw new BadRequestException('Forwarding contracting party must be a Customer, Shipper or Consignee organization');
    if(role==='CUSTOMER'&&(!roles.includes('CUSTOMER')||customerId!==user.customerId))throw new ForbiddenException('Customer can only create its own forwarding booking');
    if(role==='SHIPPER'&&(!roles.includes('SHIPPER')||customerId!==user.partyId))throw new ForbiddenException('Shipper can only create its own forwarding booking');
    if(role==='CONSIGNEE'&&(!roles.includes('CONSIGNEE')||customerId!==user.partyId))throw new ForbiddenException('Consignee can only create its own forwarding booking');

    const quantity=Math.max(1,Math.min(999,Math.floor(Number(body?.quantity||1))));
    const bookingNo='FWD-'+Date.now().toString().slice(-10);
    const bookingChannel=role==='CUSTOMER'?'CUSTOMER_PORTAL':role==='SHIPPER'?'SHIPPER_PORTAL':role==='CONSIGNEE'?'CONSIGNEE_PORTAL':'ADMIN_FORWARDING';
    const shipper=role==='SHIPPER'?party.name:(body?.shipper?String(body.shipper):null);
    const consignee=role==='CONSIGNEE'?party.name:(body?.consignee?String(body.consignee):null);
    const row=await this.prisma.booking.create({data:{
      bookingNo,businessModel:'FORWARDING',bookingChannel,customerId,producingAgentId:null,owningBranchId:null,salesOwner:user.email,
      bookingType:String(body?.bookingType||'FCL').toUpperCase(),transportMode:String(body?.transportMode||'SEA').toUpperCase(),serviceType:String(body?.serviceType||'PORT_TO_PORT').toUpperCase(),
      bookingDate:new Date(),customerReference:body?.customerReference?String(body.customerReference):null,
      shipper,consignee,
      origin,destination,portOfLoading:String(body?.portOfLoading||origin).trim().toUpperCase(),portOfDischarge:String(body?.portOfDischarge||destination).trim().toUpperCase(),
      placeOfReceipt:body?.placeOfReceipt?String(body.placeOfReceipt):null,placeOfDelivery:body?.placeOfDelivery?String(body.placeOfDelivery):null,
      equipment,quantity,commodity:body?.commodity?String(body.commodity):null,grossWeight:body?.grossWeight!==''&&body?.grossWeight!=null?Number(body.grossWeight):null,volumeCbm:body?.volumeCbm!==''&&body?.volumeCbm!=null?Number(body.volumeCbm):null,
      specialCargo:body?.specialCargo&&String(body.specialCargo).toUpperCase()!=='NONE'?String(body.specialCargo).toUpperCase():null,
      freightTerms:String(body?.freightTerms||'PREPAID').toUpperCase(),currency:String(body?.currency||'USD').toUpperCase(),
      etd:body?.etd?new Date(body.etd):null,status:'DRAFT',notes:'Created through ANCLINE Global Forwarding Portal'
    }});
    await this.audit.log({actorId:user.sub,action:'FORWARDING_PORTAL_BOOKING_CREATE',objectType:'Booking',objectId:row.id,bookingId:row.id,detail:{role,businessModel:'FORWARDING',bookingChannel,bookingNo:row.bookingNo,customerId,origin,destination,equipment,quantity}});
    return row;
  }

  async nvoccParties(user:ScopeUser){
    const role=this.allowedNvoccRole(user);
    if(role==='AGENT'){
      if(!user.agentId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.agentId},select:{id:true,code:true,name:true,active:true,roles:true}});
      return row&&row.active?[row]:[];
    }
    return this.prisma.organization.findMany({
      where:{active:true,OR:[{roles:{has:'AGENT'}},{roles:{has:'CUSTOMER'}}]},
      select:{id:true,code:true,name:true,active:true,roles:true},
      orderBy:{name:'asc'},take:500
    });
  }

  async nvoccDirectBooking(body:any,user:ScopeUser){
    const role=this.allowedNvoccRole(user);
    const origin=String(body?.origin||'').trim().toUpperCase(),destination=String(body?.destination||'').trim().toUpperCase(),equipment=String(body?.equipment||'').trim().toUpperCase();
    if(!origin||!destination||!equipment)throw new BadRequestException('Origin, destination and equipment are required');
    if(origin===destination)throw new BadRequestException('Origin and destination must be different');
    let customerId=String(body?.customerId||'').trim(),producingAgentId:string|null=null,owningBranchId:string|null=null;
    if(role==='AGENT'){
      if(!user.agentId)throw new ForbiddenException('Agent account is not linked');
      customerId=user.agentId;producingAgentId=user.agentId;
    }else if(role==='BRANCH_OPS'){
      if(!user.branchId)throw new ForbiddenException('Branch account is not linked');
      owningBranchId=user.branchId;
    }
    if(!customerId)throw new BadRequestException('Contracting agent / customer is required');
    const party=await this.prisma.organization.findUnique({where:{id:customerId}});
    if(!party||!party.active)throw new BadRequestException('Contracting party must be active');
    const roles=Array.isArray(party.roles)?party.roles:[];
    if(!roles.includes('AGENT')&&!roles.includes('CUSTOMER'))throw new BadRequestException('NVOCC contracting party must be an Agent or Customer organization');
    if(role==='AGENT'&&customerId!==user.agentId)throw new ForbiddenException('Agent can only create its own NVOCC booking request');
    if(role!=='AGENT'&&roles.includes('AGENT'))producingAgentId=customerId;
    const quantity=Math.max(1,Math.min(999,Math.floor(Number(body?.quantity||1))));
    const bookingNo='NVOCC-'+Date.now().toString().slice(-10);
    const bookingChannel=role==='AGENT'?'NVOCC_AGENT_PORTAL':role==='BRANCH_OPS'?'NVOCC_BRANCH_PORTAL':'NVOCC_ADMIN_PORTAL';
    const row=await this.prisma.booking.create({data:{
      bookingNo,businessModel:'NVOCC',bookingChannel,customerId,producingAgentId,owningBranchId,salesOwner:user.email,
      bookingType:String(body?.bookingType||'FCL').toUpperCase(),transportMode:String(body?.transportMode||'SEA').toUpperCase(),serviceType:String(body?.serviceType||'PORT_TO_PORT').toUpperCase(),
      bookingDate:new Date(),customerReference:body?.customerReference?String(body.customerReference):null,
      shipper:body?.shipper?String(body.shipper):null,consignee:body?.consignee?String(body.consignee):null,
      origin,destination,portOfLoading:String(body?.portOfLoading||origin).trim().toUpperCase(),portOfDischarge:String(body?.portOfDischarge||destination).trim().toUpperCase(),
      placeOfReceipt:body?.placeOfReceipt?String(body.placeOfReceipt):null,placeOfDelivery:body?.placeOfDelivery?String(body.placeOfDelivery):null,
      equipment,quantity,commodity:body?.commodity?String(body.commodity):null,grossWeight:body?.grossWeight!==''&&body?.grossWeight!=null?Number(body.grossWeight):null,volumeCbm:body?.volumeCbm!==''&&body?.volumeCbm!=null?Number(body.volumeCbm):null,
      specialCargo:body?.specialCargo&&String(body.specialCargo).toUpperCase()!=='NONE'?String(body.specialCargo).toUpperCase():null,
      freightTerms:String(body?.freightTerms||'PREPAID').toUpperCase(),currency:String(body?.currency||'USD').toUpperCase(),
      etd:body?.etd?new Date(body.etd):null,status:'DRAFT',notes:'Created through ANCLINE NVOCC Portal'
    }});
    await this.audit.log({actorId:user.sub,action:'NVOCC_PORTAL_BOOKING_CREATE',objectType:'Booking',objectId:row.id,bookingId:row.id,detail:{role,businessModel:'NVOCC',bookingChannel,bookingNo:row.bookingNo,customerId,producingAgentId,owningBranchId,origin,destination,equipment,quantity}});
    return row;
  }

  async nvoccRates(bookingId:string,user:ScopeUser){
    const role=this.allowedNvoccRole(user);
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId}});
    if(!booking)throw new BadRequestException('Booking not found');
    if(String((booking as any).businessModel||'NVOCC').toUpperCase()!=='NVOCC')throw new BadRequestException('NVOCC rates are available only for NVOCC jobs');
    const now=new Date();
    const rows=await this.prisma.rateQuote.findMany({
      where:{customerId:booking.customerId,validFrom:{lte:now},validTo:{gte:now},status:{in:['Rate Approved','Quote Sent','DRAFT']}},
      orderBy:[{validTo:'asc'},{createdAt:'desc'}],take:300
    });
    const norm=(v:any)=>String(v||'').trim().toUpperCase().replace(/\s+/g,'');
    const origin=norm(booking.portOfLoading||booking.origin),destination=norm(booking.portOfDischarge||booking.destination),equipment=norm(booking.equipment);
    const laneMatch=(trade:any)=>{
      const parts=String(trade||'').toUpperCase().split(/\s*(?:->|>|\/|→|-)\s*/).filter(Boolean).map(norm);
      return parts.length>=2&&parts[0]===origin&&parts[parts.length-1]===destination;
    };
    return rows.filter((r:any)=>{
      const source=String(r.source||'').toUpperCase();
      const nvoccSource=!source.startsWith('CARRIER_')&&!source.startsWith('FORWARDING_');
      return nvoccSource&&laneMatch(r.trade)&&(!equipment||norm(r.equipment)===equipment);
    }).map((r:any)=>({
      rateId:r.id,quoteNo:r.quoteNo,trade:r.trade,equipment:r.equipment,sellRate:r.sellRate,currency:r.currency,
      validFrom:r.validFrom,validTo:r.validTo,source:r.source||'NVOCC_COMMERCIAL_DESK',
      ...(role==='GLOBAL_ADMIN'?{buyRate:r.buyRate}: {})
    }));
  }

  async nvoccSelectRate(bookingId:string,rateId:string,user:ScopeUser){
    const role=this.allowedNvoccRole(user);
    const offers:any[]=await this.nvoccRates(bookingId,user);
    if(!offers.some(x=>x.rateId===rateId))throw new BadRequestException('Selected NVOCC rate is not available for this booking');
    const [booking,template]=await Promise.all([
      this.prisma.booking.findUnique({where:{id:bookingId}}),
      this.prisma.rateQuote.findUnique({where:{id:rateId}})
    ]);
    if(!booking||!template)throw new BadRequestException('NVOCC booking or rate was not found');
    const quoteNo=`NVQ-${Date.now().toString().slice(-10)}`;
    const quote=await this.prisma.$transaction(async(tx:any)=>{
      const q=await tx.rateQuote.create({data:{
        quoteNo,customerId:booking.customerId,trade:template.trade,equipment:template.equipment,
        buyRate:template.buyRate,sellRate:template.sellRate,currency:template.currency,
        validFrom:new Date(),validTo:template.validTo,status:'Quote Sent',source:`NVOCC_PORTAL:${template.id}`
      }});
      await tx.booking.update({where:{id:bookingId},data:{rateQuoteId:q.id,currency:q.currency,status:'QUOTE_SENT'}});
      return q;
    });
    await this.audit.log({actorId:user.sub,action:'NVOCC_PORTAL_RATE_SELECTED',objectType:'Booking',objectId:bookingId,bookingId,detail:{templateRateId:rateId,quoteNo:quote.quoteNo,role}});
    return {quote:{id:quote.id,quoteNo:quote.quoteNo,sellRate:quote.sellRate,currency:quote.currency,status:quote.status,validTo:quote.validTo}};
  }

  async nvoccAcceptQuote(bookingId:string,user:ScopeUser){
    this.allowedNvoccRole(user);await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},include:{rateQuote:true}});
    if(!booking)throw new BadRequestException('Booking not found');
    if(String((booking as any).businessModel||'NVOCC').toUpperCase()!=='NVOCC')throw new BadRequestException('This booking does not belong to the NVOCC Portal');
    const quote=booking.rateQuote;if(!quote)throw new BadRequestException('No quoted NVOCC rate is linked to this booking');
    if(new Date(quote.validTo).getTime()<Date.now())throw new BadRequestException('The quoted NVOCC rate has expired');
    const qStatus=String(quote.status||'').toUpperCase().replace(/[\s_-]+/g,'');
    if(!['QUOTESENT','RATEAPPROVED','DRAFT','CUSTOMERACCEPTED'].includes(qStatus))throw new BadRequestException('NVOCC quote is not available for acceptance');
    if(qStatus!=='CUSTOMERACCEPTED')await this.prisma.rateQuote.update({where:{id:quote.id},data:{status:'Customer Accepted'}});
    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{status:'BOOKING_REQUESTED'}});
    await this.audit.log({actorId:user.sub,action:'NVOCC_RATE_ACCEPTED_BOOKING_REQUESTED',objectType:'Booking',objectId:bookingId,bookingId,detail:{quoteNo:quote.quoteNo,role:user.role}});
    return {booking:updated,quote:{id:quote.id,quoteNo:quote.quoteNo,sellRate:quote.sellRate,currency:quote.currency,status:'Customer Accepted'}};
  }

  async nvoccBookings(user:ScopeUser){
    this.allowedNvoccRole(user);
    const rows=await this.prisma.booking.findMany({
      where:{AND:[bookingScope(user),{businessModel:'NVOCC'}]},
      select:{
        businessModel:true,bookingChannel:true,id:true,bookingNo:true,status:true,origin:true,destination:true,portOfLoading:true,portOfDischarge:true,terminal:true,
        etd:true,eta:true,atd:true,ata:true,carrier:true,vesselVoyage:true,houseBL:true,masterBL:true,creditStatus:true,slotStatus:true,equipmentStatus:true,
        customer:{select:{id:true,name:true,code:true}},producingAgent:{select:{id:true,name:true,code:true}},
        rateQuote:{select:{id:true,quoteNo:true,sellRate:true,currency:true,status:true,validTo:true}},
        documents:{select:{id:true,documentNo:true,type:true,status:true,releaseControl:true,version:true,updatedAt:true}},
        containers:{select:{id:true,containerNo:true,type:true,status:true,location:true,sealNo:true}}
      },
      orderBy:{createdAt:'desc'}
    });
    return rows;
  }

  async nvoccDocuments(user:ScopeUser){
    this.allowedNvoccRole(user);
    return this.prisma.document.findMany({
      where:{booking:{AND:[bookingScope(user),{businessModel:'NVOCC'}]}},
      include:{booking:{select:{id:true,bookingNo:true,status:true,origin:true,destination:true,customer:{select:{id:true,name:true,code:true}},producingAgent:{select:{id:true,name:true,code:true}}}}},
      orderBy:{updatedAt:'desc'}
    });
  }

  private readPath(obj:any,path:any){
    const p=String(path||'').trim();if(!p)return undefined;
    let cur=obj;for(const key of p.replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean)){if(cur==null)return undefined;cur=cur[key];}
    return cur;
  }

  private carrierAuthHeaders(provider:any){
    const headers:any={'content-type':'application/json','accept':'application/json'};
    const mode=String(provider?.authMode||'NONE').toUpperCase();if(mode==='NONE')return headers;
    const secret=provider?.secretEnv?process.env[String(provider.secretEnv)]:undefined;
    if(!secret)throw new Error('Carrier booking secret is not configured');
    if(mode==='BASIC')headers.authorization=`Basic ${Buffer.from(`${provider.username||''}:${secret}`).toString('base64')}`;
    if(mode==='BEARER')headers.authorization=`Bearer ${secret}`;
    if(mode==='API_KEY')headers[provider.apiKeyHeader||'x-api-key']=secret;
    return headers;
  }

  private async autoForwardingCarrierBooking(booking:any,quote:any,user:ScopeUser){
    const source='ANCLINE_FORWARDING_AUTOMATION';
    const selected=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateOffer',eventType:'RATE_OFFER_SELECTED',externalId:booking.id},orderBy:{createdAt:'desc'}});
    const selection:any=selected?.payload||{};
    const providerCode=String(selection.providerCode||'').trim();
    if(!providerCode){
      await this.prisma.integrationEvent.create({data:{sourceSystem:source,eventType:'CARRIER_BOOKING_AUTOMATION_PENDING',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'PENDING',payload:{bookingId:booking.id,reason:'Selected forwarding rate has no online carrier provider',createdBy:user.sub}}});
      await this.prisma.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_AUTOMATION_PENDING'}});
      return {status:'PENDING',reason:'Selected rate has no online carrier booking provider'};
    }
    const providerEvent=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateProvider',eventType:'PROVIDER_PROFILE_SET',objectId:providerCode},orderBy:{createdAt:'desc'}});
    const provider:any=providerEvent?.payload||{};
    const bookingEndpoint=String(provider.bookingEndpoint||'').trim();
    if(!bookingEndpoint){
      await this.prisma.integrationEvent.create({data:{sourceSystem:source,eventType:'CARRIER_BOOKING_AUTOMATION_PENDING',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'PENDING',payload:{bookingId:booking.id,providerCode,carrier:selection.carrier||booking.carrier||null,reason:'Carrier booking API endpoint is not configured',createdBy:user.sub}}});
      await this.prisma.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_AUTOMATION_PENDING'}});
      return {status:'PENDING_CONFIGURATION',providerCode};
    }
    const request={
      bookingId:booking.id,bookingNo:booking.bookingNo,customerReference:booking.customerReference||null,
      carrierQuoteReference:selection.externalQuoteRef||null,quoteNo:quote.quoteNo,
      origin:booking.origin,destination:booking.destination,portOfLoading:booking.portOfLoading||booking.origin,portOfDischarge:booking.portOfDischarge||booking.destination,
      equipment:booking.equipment,quantity:booking.quantity||1,commodity:booking.commodity||null,grossWeight:booking.grossWeight||null,volumeCbm:booking.volumeCbm||null,
      requestedEtd:booking.etd||null,shipper:booking.shipper||null,consignee:booking.consignee||null,freightTerms:booking.freightTerms||null
    };
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await (globalThis as any).fetch(bookingEndpoint,{method:'POST',headers:this.carrierAuthHeaders(provider),body:JSON.stringify(request),signal:controller.signal});
      const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{data={message:raw};}
      if(!response.ok)throw new Error(data?.message||`Carrier booking API returned HTTP ${response.status}`);
      const refPath=provider?.bookingFieldMap?.carrierBookingNo||provider?.carrierBookingNoPath;
      const carrierBookingNo=String((refPath?this.readPath(data,refPath):undefined)??data?.carrierBookingNo??data?.bookingReference??data?.bookingNo??'').trim()||null;
      const confirmation=String(data?.status||data?.confirmationStatus||(carrierBookingNo?'CONFIRMED':'SUBMITTED')).toUpperCase();
      await this.prisma.$transaction(async(tx:any)=>{
        await tx.integrationEvent.create({data:{sourceSystem:source,eventType:carrierBookingNo?'FORWARDING_CARRIER_BOOKING_CONFIRMED':'FORWARDING_CARRIER_BOOKING_SUBMITTED',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'COMPLETED',payload:{bookingId:booking.id,providerCode,carrier:selection.carrier||booking.carrier||null,carrierBookingNo,confirmation,responseMeta:data?.meta||null,submittedBy:user.sub},completedAt:new Date()}});
        await tx.booking.update({where:{id:booking.id},data:{carrier:selection.carrier||booking.carrier||null,carrierBookingNo,slotStatus:carrierBookingNo?'CONFIRMED':'REQUESTED',shipmentStatus:carrierBookingNo?'CARRIER_CONFIRMED':'CARRIER_BOOKING_SUBMITTED'}});
      });
      return {status:carrierBookingNo?'CONFIRMED':'SUBMITTED',providerCode,carrierBookingNo};
    }catch(e:any){
      const reason=e?.name==='AbortError'?'Carrier booking API timed out':String(e?.message||'Carrier booking submission failed');
      await this.prisma.$transaction(async(tx:any)=>{
        await tx.integrationEvent.create({data:{sourceSystem:source,eventType:'FORWARDING_CARRIER_BOOKING_FAILED',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'FAILED',payload:{bookingId:booking.id,providerCode,reason,failedBy:user.sub}}});
        await tx.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_BOOKING_EXCEPTION'}});
      });
      return {status:'EXCEPTION',providerCode,reason};
    }finally{clearTimeout(timer);}
  }

  async acceptQuote(bookingId:string,user:ScopeUser){
    this.allowedPortalRole(user);await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},include:{rateQuote:true}});
    if(!booking)throw new BadRequestException('Booking not found');
    if(String((booking as any).businessModel||'NVOCC').toUpperCase()!=='FORWARDING')throw new BadRequestException('Online portal quote acceptance is available only for FORWARDING bookings');
    const quote=booking.rateQuote;if(!quote)throw new BadRequestException('No quoted rate is linked to this booking');
    if(new Date(quote.validTo).getTime()<Date.now())throw new BadRequestException('The quoted rate has expired');
    const status=String(quote.status||'').toUpperCase().replace(/[\s_-]+/g,'');
    if(!['QUOTESENT','RATEAPPROVED','DRAFT'].includes(status)&&status!=='CUSTOMERACCEPTED')throw new BadRequestException('Quote is not available for acceptance');
    if(status!=='CUSTOMERACCEPTED')await this.prisma.rateQuote.update({where:{id:quote.id},data:{status:'Customer Accepted'}});
    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{status:'BOOKING_REQUESTED'}});
    const automation=await this.autoForwardingCarrierBooking(updated,quote,user);
    await this.audit.log({actorId:user.sub,action:'PORTAL_QUOTE_ACCEPTED_BOOKING_REQUESTED',objectType:'Booking',objectId:bookingId,bookingId,detail:{quoteNo:quote.quoteNo,role:user.role,forwardingCarrierAutomation:automation.status}});
    return {booking:updated,quote:{id:quote.id,quoteNo:quote.quoteNo,sellRate:quote.sellRate,currency:quote.currency,status:'Customer Accepted'},automation};
  }

  async releaseSecurity(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    return evaluateReleaseSecurity(this.prisma as any,bookingId);
  }

  async bookings(user:ScopeUser){
    this.allowedPortalRole(user);
    const customerView=['CUSTOMER','SHIPPER','CONSIGNEE'].includes(String(user.role||'').toUpperCase());
    const rows=await this.prisma.booking.findMany({
      where:{AND:[bookingScope(user),{businessModel:'FORWARDING'}]},
      select:{
        businessModel:true,bookingChannel:true,
        id:true,bookingNo:true,status:true,origin:true,destination:true,portOfLoading:true,portOfDischarge:true,terminal:true,
        etd:true,eta:true,atd:true,ata:true,carrier:true,vesselVoyage:true,houseBL:true,masterBL:true,
        customer:{select:{id:true,name:true}},
        documents:{
          where:customerView?{status:'Released'}:undefined,
          select:{id:true,documentNo:true,type:true,status:true,releaseControl:true,version:true}
        },
        containers:{
          select:{
            id:true,containerNo:true,type:true,status:true,location:true,sealNo:true,
            movements:{select:{id:true,eventCode:true,eventLabel:true,status:true,location:true,occurredAt:true,source:true},orderBy:{occurredAt:'desc'},take:5}
          }
        },
        milestones:{
          select:{id:true,code:true,label:true,location:true,plannedAt:true,actualAt:true,status:true,source:true},
          orderBy:[{actualAt:'asc'},{plannedAt:'asc'},{createdAt:'asc'}]
        }
      },
      orderBy:{createdAt:'desc'}
    });

    return rows.map(b=>{
      const latestMovement=(b.containers||[]).flatMap(c=>(c.movements||[]).map(m=>({...m,containerNo:c.containerNo}))).sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime())[0]||null;
      const completedMilestones=(b.milestones||[]).filter(m=>String(m.status).toUpperCase()==='COMPLETED');
      const nextMilestone=(b.milestones||[]).filter(m=>String(m.status).toUpperCase()!=='COMPLETED').sort((a,b)=>new Date(a.plannedAt||'9999-12-31').getTime()-new Date(b.plannedAt||'9999-12-31').getTime())[0]||null;
      return {...b,latestMovement,progress:{completed:completedMilestones.length,total:(b.milestones||[]).length,nextMilestone}};
    });
  }
}
