import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { bookingScope, ScopeUser } from '../auth/scope';
import { ScopeService } from '../auth/scope.service';
import { AuditService } from '../audit/audit.service';
import { evaluateReleaseSecurity } from '../documents/release-security';
import { assertAncCarrierOutboundPayload } from '../carrier-outbound-policy';
import { createHash } from 'crypto';

@Injectable()
export class PortalService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private async nextJobRef(){
    const rows=await this.prisma.booking.findMany({select:{bookingNo:true}});
    const used=rows.map(x=>String(x.bookingNo||'')).filter(x=>/^\d{5}$/.test(x)).map(Number);
    let next=Math.max(10000,...used)+1;
    if(next>99999)throw new BadRequestException('No 5-digit ANCLINE job references are available');
    while(await this.prisma.booking.findUnique({where:{bookingNo:String(next).padStart(5,'0')}})){
      next+=1;
      if(next>99999)throw new BadRequestException('No 5-digit ANCLINE job references are available');
    }
    return String(next).padStart(5,'0');
  }

  private allowedNvoccRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if(!['AGENT','BRANCH_OPS','GLOBAL_ADMIN'].includes(role))throw new ForbiddenException('NVOCC Portal access is limited to Agent, Branch Office and Global Admin users');
    return role;
  }

  private allowedPortalRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if(['CUSTOMER','SHIPPER','CONSIGNEE','GLOBAL_ADMIN'].includes(role))return role;
    if(role==='AGENT'&&Array.isArray(user.permissions)&&user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE'))return role;
    throw new ForbiddenException('Global Forwarding Portal access denied');
  }

  async customers(user:ScopeUser){
    const role=this.allowedPortalRole(user);
    const select={id:true,code:true,name:true,active:true,roles:true,customerRef:true,costCenterCode:true,kycStatus:true} as const;
    if(role==='CUSTOMER'){
      if(!user.customerId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.customerId},select});
      return row&&row.active?[row]:[];
    }
    if(role==='SHIPPER'||role==='CONSIGNEE'){
      if(!user.partyId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.partyId},select});
      return row&&row.active?[row]:[];
    }
    if(role==='AGENT'){
      if(!user.agentId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.agentId},select});
      return row&&row.active?[row]:[];
    }
    return this.prisma.organization.findMany({
      where:{active:true,kycStatus:'APPROVED',customerRef:{not:null}},
      select,orderBy:{name:'asc'},take:500
    });
  }

  async directBooking(body:any,user:ScopeUser){
    this.allowedPortalRole(user);
    throw new BadRequestException('Forwarding booking cannot be created directly. Search carrier rates, issue an ANC quote, accept the ANC quote and terms, then ANCLINE creates the booking.');
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
    const bookingNo=await this.nextJobRef();
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
    const allowedStatuses=role==='GLOBAL_ADMIN'?['Rate Approved','Quote Sent','DRAFT']:['Rate Approved','Quote Sent'];
    const rows=await this.prisma.rateQuote.findMany({
      where:{customerId:booking.customerId,validFrom:{lte:now},validTo:{gte:now},status:{in:allowedStatuses}},
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
    const quoteNo=`ANC-NVOCC-Q-${Date.now().toString().slice(-10)}`;
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
    const quoteOffer:any=quote?.carrierOfferData&&typeof quote.carrierOfferData==='object'?quote.carrierOfferData:{};
    const providerCode=String(quote?.carrierCode||selection.providerCode||quoteOffer.providerCode||'').trim();
    if(!providerCode){
      await this.prisma.integrationEvent.create({data:{sourceSystem:source,eventType:'CARRIER_BOOKING_AUTOMATION_PENDING',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'PENDING',payload:{bookingId:booking.id,reason:'Selected forwarding rate has no online carrier provider',createdBy:user.sub}}});
      await this.prisma.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_AUTOMATION_PENDING'}});
      return {status:'PENDING',reason:'Selected rate has no online carrier booking provider'};
    }
    const providerEvent=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateProvider',eventType:'PROVIDER_PROFILE_SET',objectId:providerCode},orderBy:{createdAt:'desc'}});
    const provider:any=providerEvent?.payload||{};
    if(booking.carrierBookingNo)return {status:'CONFIRMED',providerCode,carrierBookingNo:booking.carrierBookingNo};
    const priorSubmission=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:source,externalId:booking.id,eventType:{in:['FORWARDING_CARRIER_BOOKING_CONFIRMED','FORWARDING_CARRIER_BOOKING_SUBMITTED']}},orderBy:{createdAt:'desc'}});
    if(priorSubmission){const p:any=priorSubmission.payload||{};return {status:p.carrierBookingNo?'CONFIRMED':'SUBMITTED',providerCode,carrierBookingNo:p.carrierBookingNo||null,idempotent:true};}
    const carrierOperationNo='CBR-FWD-'+String(booking.bookingNo);
    const carrierOpsExisting=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_CARRIER_OPERATIONS',objectType:'CarrierBooking',objectId:carrierOperationNo,eventType:'CARRIER_BOOKING_REQUESTED'}});
    if(!carrierOpsExisting){
      const requestedPayload={
        carrierOperationNo,bookingId:booking.id,bookingNo:booking.bookingNo,shipmentNo:booking.shipmentNo||null,
        businessModel:'FORWARDING',bookingChannel:booking.bookingChannel,costCenterCode:booking.costCenterCode||null,customerRef:booking.customerRef||null,
        jobType:booking.jobType||'FORWARDING',forwardingTradeType:booking.forwardingTradeType||'STANDARD',
        rateQuoteNo:quote.quoteNo,carrierQuoteRef:quote.carrierQuoteRef||null,
        carrierId:provider.carrierOrgId||null,carrierCode:providerCode,carrierName:quoteOffer.carrier||booking.carrier||provider.carrier||provider.name||providerCode,
        scheduleId:null,scheduleNo:quoteOffer.serviceName||null,scheduleCarrier:quoteOffer.carrier||null,serviceName:quoteOffer.serviceName||null,
        vessel:quoteOffer.vessel||null,voyage:quoteOffer.voyage||null,portOfLoading:booking.portOfLoading||booking.origin,portOfDischarge:booking.portOfDischarge||booking.destination,
        terminal:booking.terminal||null,etd:booking.etd||quoteOffer.etd||null,eta:booking.eta||quoteOffer.eta||null,cyClosing:booking.cyClosing||null,siCutoff:booking.siCutoff||null,vgmCutoff:booking.vgmCutoff||null,docCutoff:booking.docCutoff||null,
        equipmentType:booking.equipment||null,quantity:booking.quantity||1,spaceTeu:(String(booking.equipment||'').includes('40')||String(booking.equipment||'').includes('45')?2:1)*Math.max(1,Number(booking.quantity||1)),
        carrierBookingNo:null,confirmationStatus:'REQUESTED',allocationStatus:'UNALLOCATED',allocationRef:null,equipmentReleaseStatus:'PENDING',releaseOrderNo:null,emptyDepot:null,releaseValidUntil:null,
        notes:'Automatically created from accepted ANC Forwarding quote '+quote.quoteNo,requestedBy:user.sub,automation:true
      };
      await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_CARRIER_OPERATIONS',eventType:'CARRIER_BOOKING_REQUESTED',externalId:carrierOperationNo,objectType:'CarrierBooking',objectId:carrierOperationNo,status:'COMPLETED',payload:requestedPayload,completedAt:new Date()}});
    }
    const bookingEndpoint=String(provider.bookingEndpoint||'').trim();
    if(!bookingEndpoint){
      await this.prisma.integrationEvent.create({data:{sourceSystem:source,eventType:'CARRIER_BOOKING_AUTOMATION_PENDING',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'PENDING',payload:{bookingId:booking.id,providerCode,carrier:quoteOffer.carrier||selection.carrier||booking.carrier||null,reason:'Carrier booking API endpoint is not configured',createdBy:user.sub}}});
      await this.prisma.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_AUTOMATION_PENDING'}});
      return {status:'PENDING_CONFIGURATION',providerCode};
    }
    const paymentEvent=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_CARRIER_PAYMENT',objectType:'CarrierPaymentInstruction',objectId:booking.id,eventType:'CARRIER_PAYMENT_INSTRUCTIONS_SET'},orderBy:{createdAt:'desc'}});
    if(!paymentEvent){
      const existingHold=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:source,eventType:'CARRIER_PAYMENT_CONTROL_PENDING',externalId:booking.id,objectType:'Booking',objectId:booking.id},orderBy:{createdAt:'desc'}});
      if(!existingHold)await this.prisma.integrationEvent.create({data:{sourceSystem:source,eventType:'CARRIER_PAYMENT_CONTROL_PENDING',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'PENDING',payload:{bookingId:booking.id,bookingNo:booking.bookingNo,providerCode,reason:'ANC carrier payment / payer instructions must be validated before carrier submission',createdBy:user.sub}}});
      await this.prisma.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_PAYMENT_CONTROL_PENDING'}});
      return {status:'PENDING_PAYMENT_CONTROL',providerCode};
    }
    const paymentPayload:any=paymentEvent?.payload||{};
    const paymentInstructions=(Array.isArray(paymentPayload.instructions)?paymentPayload.instructions:[])
      .filter((x:any)=>x?.applicable!==false&&String(x?.term||'').toUpperCase()!=='NOT_APPLICABLE')
      .map((x:any)=>({
        chargeGroup:x.chargeGroup,
        term:x.term,
        payerType:x.payerType,
        payerCode:x.carrierPayerCode||x.payerCode||null,
        payerName:x.payerName||null,
        payerAddress:x.term==='PREPAID_ELSEWHERE'?(x.payerAddress||null):null,
        payerCountryCode:x.payerCountryCode||null
      }));
    const request:any={
      requestReference:'ANC-BOOK-'+String(booking.bookingNo||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48),
      bookingParty:{name:provider?.carrierIdentity?.accountName||'ANC',accountCode:provider?.carrierIdentity?.accountCode||null},
      carrierQuoteReference:quote?.carrierQuoteRef||selection.externalQuoteRef||quoteOffer.carrierQuoteRef||null,
      origin:booking.origin,destination:booking.destination,portOfLoading:booking.portOfLoading||booking.origin,portOfDischarge:booking.portOfDischarge||booking.destination,
      equipment:booking.equipment,quantity:booking.quantity||1,commodity:booking.commodity||null,grossWeight:booking.grossWeight||null,volumeCbm:booking.volumeCbm||null,
      requestedEtd:booking.etd||null
    };
    if(paymentInstructions.length)request.paymentInstructions=paymentInstructions;
    assertAncCarrierOutboundPayload(request);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await (globalThis as any).fetch(bookingEndpoint,{method:'POST',headers:this.carrierAuthHeaders(provider),body:JSON.stringify(request),signal:controller.signal});
      const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{data={message:raw};}
      if(!response.ok)throw new Error(data?.message||`Carrier booking API returned HTTP ${response.status}`);
      const refPath=provider?.bookingFieldMap?.carrierBookingNo||provider?.carrierBookingNoPath;
      const carrierBookingNo=String((refPath?this.readPath(data,refPath):undefined)??data?.carrierBookingNo??data?.bookingReference??data?.bookingNo??'').trim()||null;
      const confirmation=String(data?.status||data?.confirmationStatus||(carrierBookingNo?'CONFIRMED':'SUBMITTED')).toUpperCase();
      await this.prisma.$transaction(async(tx:any)=>{
        await tx.integrationEvent.create({data:{sourceSystem:source,eventType:carrierBookingNo?'FORWARDING_CARRIER_BOOKING_CONFIRMED':'FORWARDING_CARRIER_BOOKING_SUBMITTED',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'COMPLETED',payload:{bookingId:booking.id,providerCode,carrier:quoteOffer.carrier||selection.carrier||booking.carrier||null,carrierBookingNo,confirmation,responseMeta:data?.meta||null,submittedBy:user.sub},completedAt:new Date()}});
        if(carrierBookingNo)await tx.integrationEvent.create({data:{sourceSystem:'ANCLINE_CARRIER_OPERATIONS',eventType:'CARRIER_BOOKING_CONFIRMED',externalId:carrierOperationNo,objectType:'CarrierBooking',objectId:carrierOperationNo,status:'COMPLETED',payload:{carrierBookingNo,confirmationStatus:'CONFIRMED',confirmedAt:new Date().toISOString(),confirmedBy:user.sub,automation:true},completedAt:new Date()}});
        await tx.booking.update({where:{id:booking.id},data:{carrier:quoteOffer.carrier||selection.carrier||booking.carrier||null,carrierBookingNo,slotStatus:carrierBookingNo?'CONFIRMED':'REQUESTED',shipmentStatus:carrierBookingNo?'CARRIER_CONFIRMED':'CARRIER_BOOKING_SUBMITTED'}});
      });
      return {status:carrierBookingNo?'CONFIRMED':'SUBMITTED',providerCode,carrierBookingNo};
    }catch(e:any){
      const reason=e?.name==='AbortError'?'Carrier booking API timed out':String(e?.message||'Carrier booking submission failed');
      await this.prisma.$transaction(async(tx:any)=>{
        await tx.integrationEvent.create({data:{sourceSystem:source,eventType:'FORWARDING_CARRIER_BOOKING_FAILED',externalId:booking.id,objectType:'Booking',objectId:booking.id,status:'FAILED',payload:{bookingId:booking.id,providerCode,reason,failedBy:user.sub}}});
        await tx.integrationEvent.create({data:{sourceSystem:'ANCLINE_CARRIER_OPERATIONS',eventType:'CARRIER_BOOKING_AUTOMATION_EXCEPTION',externalId:carrierOperationNo,objectType:'CarrierBooking',objectId:carrierOperationNo,status:'FAILED',payload:{automationException:reason,automationExceptionAt:new Date().toISOString()},completedAt:new Date()}});
        await tx.booking.update({where:{id:booking.id},data:{shipmentStatus:'CARRIER_BOOKING_EXCEPTION'}});
      });
      return {status:'EXCEPTION',providerCode,reason};
    }finally{clearTimeout(timer);}
  }

  async submitForwardingCarrierBooking(bookingId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    await this.scope.assertBookingAccess(user,bookingId);
    const booking:any=await this.prisma.booking.findUnique({where:{id:bookingId},include:{rateQuote:true}});
    if(!booking)throw new BadRequestException('Booking not found');
    if(String(booking.businessModel||'NVOCC').toUpperCase()!=='FORWARDING')throw new BadRequestException('Carrier automation submission is Forwarding-only');
    const quote:any=booking.rateQuote;
    if(!quote||String(quote.status)!=='Customer Accepted'||!quote.termsAcceptedAt)throw new BadRequestException('Accepted ANC Forwarding quote is required before carrier submission');
    return this.autoForwardingCarrierBooking(booking,quote,user);
  }

  async acceptQuote(bookingId:string,user:ScopeUser){
    this.allowedPortalRole(user);
    throw new BadRequestException('Legacy booking-first quote acceptance is disabled. Accept the ANC Forwarding quote reference instead.');
  }

  async forwardingQuotes(user:ScopeUser){
    const role=this.allowedPortalRole(user);
    let customerId:string|undefined;
    if(role==='CUSTOMER')customerId=user.customerId||undefined;
    if(role==='SHIPPER'||role==='CONSIGNEE')customerId=user.partyId||undefined;
    if(role==='AGENT')customerId=user.agentId||undefined;
    const where:any={source:{startsWith:'FORWARDING_CARRIER:'}};
    if(role!=='GLOBAL_ADMIN'){if(!customerId)return [];where.customerId=customerId;}
    const rows=await this.prisma.rateQuote.findMany({where,orderBy:{createdAt:'desc'},take:300});
    return rows.map((q:any)=>({id:q.id,quoteNo:q.quoteNo,customerRef:q.customerRef,costCenterCode:q.costCenterCode,trade:q.trade,equipment:q.equipment,sellRate:q.sellRate,currency:q.currency,validFrom:q.validFrom,validTo:q.validTo,status:q.status,termsVersion:q.termsVersion,termsAcceptedAt:q.termsAcceptedAt,...(role==='GLOBAL_ADMIN'?{carrierCode:q.carrierCode,carrierQuoteRef:q.carrierQuoteRef,requestData:q.requestData}: {})}));
  }

  async acceptForwardingQuote(quoteId:string,body:any,user:ScopeUser){
    const role=this.allowedPortalRole(user);
    const quote:any=await this.prisma.rateQuote.findUnique({where:{id:quoteId}});
    if(!quote||!String(quote.source||'').startsWith('FORWARDING_CARRIER:'))throw new BadRequestException('ANC Forwarding quote was not found');
    if(new Date(quote.validTo).getTime()<Date.now())throw new BadRequestException('ANC Forwarding quote has expired');
    if(!quote.carrierCode||!quote.carrierQuoteRef)throw new BadRequestException('ANC quote is missing the linked carrier code / carrier quote reference');
    if(body?.termsAccepted!==true)throw new BadRequestException('All ANC Forwarding booking terms must be accepted before booking starts');
    if(!quote.termsVersion||String(body?.termsVersion||'')!==String(quote.termsVersion))throw new BadRequestException('Accepted terms version does not match the ANC quote');
    let scopedCustomerId:string|undefined;
    if(role==='CUSTOMER')scopedCustomerId=user.customerId||undefined;
    if(role==='SHIPPER'||role==='CONSIGNEE')scopedCustomerId=user.partyId||undefined;
    if(role==='AGENT')scopedCustomerId=user.agentId||undefined;
    if(role!=='GLOBAL_ADMIN'&&scopedCustomerId!==quote.customerId)throw new ForbiddenException('ANC quote is outside your registered customer scope');
    const customer:any=await this.prisma.organization.findUnique({where:{id:quote.customerId}});
    if(!customer||!customer.active||customer.kycStatus!=='APPROVED'||!customer.customerRef||customer.customerRef!==quote.customerRef)throw new BadRequestException('Customer KYC / ANC customer reference is not valid for booking');
    const request:any=quote.requestData||{},offer:any=quote.carrierOfferData||{};
    const tradeType=String(request.forwardingTradeType||'STANDARD').toUpperCase();
    if(role==='AGENT'){
      if(!Array.isArray(user.permissions)||!user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE'))throw new ForbiddenException('Agent Forwarding right is not assigned');
      if(!['DIRECT_COLOAD','CROSS_TRADE'].includes(tradeType))throw new ForbiddenException('Agent Forwarding bookings are limited to direct co-load / cross-trade');
    }
    const costCenterCode=String(role==='AGENT'?(user.costCenterCode||''):(quote.costCenterCode||customer.costCenterCode||'')).trim().toUpperCase();
    if(!costCenterCode)throw new BadRequestException('Forwarding booking requires a cost center');
    const existing=await this.prisma.booking.findFirst({where:{rateQuoteId:quote.id}});
    if(existing){const base:any={booking:{id:existing.id,bookingNo:existing.bookingNo,status:existing.status,shipmentStatus:existing.shipmentStatus},quote:{id:quote.id,quoteNo:quote.quoteNo,status:'Customer Accepted'},automation:{status:existing.shipmentStatus||'BOOKING_REQUESTED'}};if(role==='GLOBAL_ADMIN')base.booking=existing;return base;}
    const bookingNo=await this.nextJobRef();
    const bookingChannel=role==='CUSTOMER'?'CUSTOMER_PORTAL':role==='SHIPPER'?'SHIPPER_PORTAL':role==='CONSIGNEE'?'CONSIGNEE_PORTAL':role==='AGENT'?'AGENT_FORWARDING_CROSS_TRADE':'ADMIN_FORWARDING';
    const shipper=role==='SHIPPER'?customer.name:(request.shipper||null),consignee=role==='CONSIGNEE'?customer.name:(request.consignee||null);
    const vesselVoyage=[offer.vessel,offer.voyage].filter(Boolean).join(' / ')||null;
    const booking=await this.prisma.$transaction(async(tx:any)=>{
      await tx.rateQuote.update({where:{id:quote.id},data:{status:'Customer Accepted',termsAcceptedAt:new Date(),termsAcceptedBy:user.sub}});
      const b=await tx.booking.create({data:{
        bookingNo,businessModel:'FORWARDING',bookingChannel,customerId:quote.customerId,customerRef:quote.customerRef,costCenterCode,
        jobType:role==='AGENT'?'FORWARDING_AGENT':'FORWARDING',forwardingTradeType:tradeType,
        producingAgentId:role==='AGENT'?user.agentId:null,owningBranchId:null,rateQuoteId:quote.id,salesOwner:user.email,
        bookingType:String(request.bookingType||'FCL').toUpperCase(),transportMode:String(request.transportMode||'SEA').toUpperCase(),serviceType:String(request.serviceType||'PORT_TO_PORT').toUpperCase(),
        bookingDate:new Date(),customerReference:request.customerReference||null,shipper,consignee,
        origin:String(request.origin||'').toUpperCase(),destination:String(request.destination||'').toUpperCase(),
        portOfLoading:String(request.portOfLoading||request.origin||'').toUpperCase(),portOfDischarge:String(request.portOfDischarge||request.destination||'').toUpperCase(),
        placeOfReceipt:request.placeOfReceipt||null,placeOfDelivery:request.placeOfDelivery||null,
        carrier:offer.carrier||null,vesselVoyage,etd:offer.etd?new Date(offer.etd):(request.etd?new Date(request.etd):null),eta:offer.eta?new Date(offer.eta):null,
        equipment:quote.equipment,quantity:Math.max(1,Number(request.quantity||1)),commodity:request.commodity||null,
        grossWeight:request.grossWeight==null?null:Number(request.grossWeight),volumeCbm:request.volumeCbm==null?null:Number(request.volumeCbm),
        specialCargo:request.specialCargo&&request.specialCargo!=='NONE'?request.specialCargo:null,freightTerms:String(request.freightTerms||'PREPAID').toUpperCase(),
        currency:quote.currency,status:'BOOKING_REQUESTED',slotStatus:'REQUESTED',equipmentStatus:'PENDING',
        notes:`Created only after acceptance of ANC quote ${quote.quoteNo}; carrier quote ${quote.carrierCode}/${quote.carrierQuoteRef}`
      }});
      await tx.integrationEvent.create({data:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',eventType:'RATE_OFFER_SELECTED',externalId:b.id,objectType:'CarrierRateOffer',objectId:String(offer.offerId||quote.id),status:'COMPLETED',payload:{bookingId:b.id,quoteId:quote.id,quoteNo:quote.quoteNo,providerCode:quote.carrierCode,carrier:offer.carrier||null,externalQuoteRef:quote.carrierQuoteRef,selectedBy:user.sub},completedAt:new Date()}});
      return b;
    });
    const automation=await this.autoForwardingCarrierBooking(booking,quote,user);
    await this.audit.log({actorId:user.sub,action:'FORWARDING_QUOTE_ACCEPTED_BOOKING_CREATE',objectType:'Booking',objectId:booking.id,bookingId:booking.id,detail:{bookingNo,quoteNo:quote.quoteNo,customerRef:quote.customerRef,carrierCode:quote.carrierCode,carrierQuoteRef:quote.carrierQuoteRef,costCenterCode,forwardingTradeType:tradeType,termsVersion:quote.termsVersion,role,automation:automation.status}});
    const publicBooking:any={id:booking.id,bookingNo:booking.bookingNo,status:booking.status,shipmentStatus:automation.status};
    const publicQuote:any={id:quote.id,quoteNo:quote.quoteNo,customerRef:quote.customerRef,sellRate:quote.sellRate,currency:quote.currency,status:'Customer Accepted',termsVersion:quote.termsVersion};
    if(role==='GLOBAL_ADMIN'){publicQuote.carrierCode=quote.carrierCode;publicQuote.carrierQuoteRef=quote.carrierQuoteRef;return {booking,quote:publicQuote,automation};}
    return {booking:publicBooking,quote:publicQuote,automation:{status:automation.status}};
  }

  private externalMessageId(key:string){return 'extmsg_'+createHash('sha256').update(key).digest('hex').slice(0,32);}
  private externalEventPayload(row:any){return row?.payload&&typeof row.payload==='object'?row.payload:{};}
  private externalRoles(){return ['CUSTOMER','SHIPPER','CONSIGNEE','AGENT'];}
  private allowedExternalCommunicationRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if([...this.externalRoles(),'GLOBAL_ADMIN'].includes(role))return role;
    throw new ForbiddenException('External portal communication access denied');
  }
  private externalCategories(){return ['BOOKING_CONFIRMATION','DOCUMENT_REQUEST','SCHEDULE_CHANGE','CUT_OFF_CHANGE','MILESTONE_UPDATE','APPROVED_DELAY_NOTICE','APPROVED_EXCEPTION_NOTICE','PAYMENT_REQUEST','DOCUMENT_RELEASE_REQUEST','RELEASE_NOTICE'];}
  private externalForbiddenText(value:any){
    const s=String(value||'').toUpperCase();
    return ['CONTROL_TOWER','CONTROL TOWER','SLA LEVEL','LEVEL_1','LEVEL_2','LEVEL_3','BUY RATE','BUYRATE','GROSS MARGIN','PROFIT MARGIN','BENEFICIAL OWNER','KYC','PROVIDER SECRET','API KEY','PASSWORD','INTERNAL NOTE'].find(x=>s.includes(x))||null;
  }
  private externalPreferenceId(user:ScopeUser){return 'extpref_'+createHash('sha256').update(String(user.sub)).digest('hex').slice(0,32);}
  private externalReceiptId(kind:string,user:ScopeUser,messageId:string){return 'ext'+kind+'_'+createHash('sha256').update(String(user.sub)+':'+messageId).digest('hex').slice(0,32);}
  private async externalBookingIds(user:ScopeUser){
    const rows=await this.prisma.booking.findMany({where:bookingScope(user),select:{id:true}});
    return rows.map(x=>String(x.id));
  }
  private async assertExternalMessageVisible(messageId:string,user:ScopeUser){
    this.allowedExternalCommunicationRole(user);
    const event=await this.prisma.integrationEvent.findUnique({where:{id:messageId}});
    if(!event||event.sourceSystem!=='ANCLINE_EXTERNAL_COMMUNICATION'||event.objectType!=='ExternalCommunication'||event.eventType!=='EXTERNAL_MESSAGE_PUBLISHED')throw new BadRequestException('External communication was not found');
    const p:any=this.externalEventPayload(event),bookingId=String(p.bookingId||'');
    if(!bookingId)throw new BadRequestException('External communication is not booking-bound');
    await this.scope.assertBookingAccess(user,bookingId);
    const audience=Array.isArray(p.audienceRoles)?p.audienceRoles.map((x:any)=>String(x).toUpperCase()):[];
    if(user.role!=='GLOBAL_ADMIN'&&!audience.includes(String(user.role).toUpperCase()))throw new ForbiddenException('Communication is not addressed to this portal role');
    return {event,p,bookingId};
  }

  async externalCommunicationPreferences(user:ScopeUser){
    this.allowedExternalCommunicationRole(user);
    const id=this.externalPreferenceId(user);
    const event=await this.prisma.integrationEvent.findUnique({where:{id}});
    const p:any=this.externalEventPayload(event);
    return {
      channels:Array.isArray(p.channels)?p.channels:['IN_APP','EMAIL'],
      categories:Array.isArray(p.categories)?p.categories:[],
      muteOptional:Boolean(p.muteOptional),
      mandatoryOperational:true
    };
  }

  async updateExternalCommunicationPreferences(body:any,user:ScopeUser){
    this.allowedExternalCommunicationRole(user);
    const allowedChannels=['IN_APP','EMAIL'];
    const channels=(Array.isArray(body?.channels)?body.channels:['IN_APP','EMAIL']).map((x:any)=>String(x).toUpperCase()).filter((x:string)=>allowedChannels.includes(x));
    const allowedCategories=this.externalCategories();
    const categories=(Array.isArray(body?.categories)?body.categories:[]).map((x:any)=>String(x).toUpperCase()).filter((x:string)=>allowedCategories.includes(x));
    const payload={channels:[...new Set(channels.length?channels:['IN_APP'])],categories:[...new Set(categories)],muteOptional:Boolean(body?.muteOptional),mandatoryOperational:true,updatedBy:user.sub,updatedAt:new Date().toISOString()};
    const id=this.externalPreferenceId(user);
    const existing=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(existing)await this.prisma.integrationEvent.update({where:{id},data:{status:'COMPLETED',payload,completedAt:new Date()}});
    else await this.prisma.integrationEvent.create({data:{id,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_PREFERENCE_UPDATED',objectType:'ExternalCommunicationPreference',objectId:String(user.sub),status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'EXTERNAL_COMMUNICATION_PREFERENCE_UPDATE',objectType:'ExternalCommunicationPreference',objectId:String(user.sub),detail:{channels:payload.channels,categories:payload.categories,muteOptional:payload.muteOptional}});
    return payload;
  }

  async externalCommunications(user:ScopeUser){
    this.allowedExternalCommunicationRole(user);
    const bookingIds=await this.externalBookingIds(user);
    if(!bookingIds.length)return {summary:{total:0,unread:0,ackRequired:0,acknowledged:0},preferences:await this.externalCommunicationPreferences(user),items:[]};
    const [messages,reads,acks,prefs]=await Promise.all([
      this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',objectType:'ExternalCommunication',eventType:'EXTERNAL_MESSAGE_PUBLISHED',status:'COMPLETED'},orderBy:{createdAt:'desc'},take:500}),
      this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',objectType:'ExternalCommunicationRead',objectId:{startsWith:String(user.sub)+':'}},orderBy:{createdAt:'desc'},take:500}),
      this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',objectType:'ExternalCommunicationAcknowledgement',objectId:{startsWith:String(user.sub)+':'}},orderBy:{createdAt:'desc'},take:500}),
      this.externalCommunicationPreferences(user)
    ]);
    const readSet=new Set(reads.map(x=>String(this.externalEventPayload(x).messageId||'')));
    const ackSet=new Set(acks.map(x=>String(this.externalEventPayload(x).messageId||'')));
    const role=String(user.role).toUpperCase();
    const items:any[]=[];
    for(const e of messages){
      const p:any=this.externalEventPayload(e),bookingId=String(p.bookingId||'');
      if(!bookingIds.includes(bookingId))continue;
      const audience=Array.isArray(p.audienceRoles)?p.audienceRoles.map((x:any)=>String(x).toUpperCase()):[];
      if(role!=='GLOBAL_ADMIN'&&!audience.includes(role))continue;
      const category=String(p.category||'MILESTONE_UPDATE').toUpperCase();
      const mandatory=Boolean(p.requiresAcknowledgement)||['PAYMENT_REQUEST','DOCUMENT_REQUEST','DOCUMENT_RELEASE_REQUEST'].includes(category);
      if(!mandatory&&prefs.muteOptional)continue;
      if(!mandatory&&prefs.categories.length&&!prefs.categories.includes(category))continue;
      const read=readSet.has(e.id),acknowledged=ackSet.has(e.id);
      items.push({
        id:e.id,bookingId,bookingNo:p.bookingNo||null,category,title:p.title,message:p.message,
        channels:Array.isArray(p.channels)?p.channels:['IN_APP'],requiresAcknowledgement:Boolean(p.requiresAcknowledgement),
        read,acknowledged,publishedAt:p.publishedAt||e.createdAt,deliveryStatus:p.deliveryStatus||{},
        actionHref:role==='AGENT'?'/agent-portal?bookingId='+encodeURIComponent(bookingId):'/customer-portal?bookingId='+encodeURIComponent(bookingId)
      });
    }
    return {summary:{total:items.length,unread:items.filter(x=>!x.read).length,ackRequired:items.filter(x=>x.requiresAcknowledgement&&!x.acknowledged).length,acknowledged:items.filter(x=>x.acknowledged).length},preferences:prefs,items};
  }

  async markExternalCommunicationRead(messageId:string,user:ScopeUser){
    await this.assertExternalMessageVisible(messageId,user);
    const id=this.externalReceiptId('read',user,messageId),payload={messageId,readBy:user.sub,readAt:new Date().toISOString()};
    const existing=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!existing)await this.prisma.integrationEvent.create({data:{id,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_MESSAGE_READ',objectType:'ExternalCommunicationRead',objectId:String(user.sub)+':'+messageId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'EXTERNAL_COMMUNICATION_READ',objectType:'ExternalCommunication',objectId:messageId,detail:{messageId}});
    return payload;
  }

  async acknowledgeExternalCommunication(messageId:string,user:ScopeUser){
    const visible=await this.assertExternalMessageVisible(messageId,user);
    if(!Boolean(visible.p.requiresAcknowledgement))throw new BadRequestException('This communication does not require acknowledgement');
    const id=this.externalReceiptId('ack',user,messageId),payload={messageId,bookingId:visible.bookingId,acknowledgedBy:user.sub,acknowledgedAt:new Date().toISOString()};
    const existing=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(!existing)await this.prisma.integrationEvent.create({data:{id,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_MESSAGE_ACKNOWLEDGED',objectType:'ExternalCommunicationAcknowledgement',objectId:String(user.sub)+':'+messageId,status:'COMPLETED',payload,completedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'EXTERNAL_COMMUNICATION_ACKNOWLEDGE',objectType:'ExternalCommunication',objectId:messageId,bookingId:visible.bookingId,detail:{messageId}});
    return payload;
  }

  private async dispatchExternalEmail(messageEvent:any,attemptReason:string,user:ScopeUser){
    const p:any=this.externalEventPayload(messageEvent);
    const deliveryId='extdel_'+createHash('sha256').update(messageEvent.id+':EMAIL:'+String(Date.now())).digest('hex').slice(0,32);
    const endpoint=String(process.env.ANCLINE_EXTERNAL_EMAIL_ENDPOINT||'').trim();
    const basePayload={messageId:messageEvent.id,bookingId:p.bookingId,bookingNo:p.bookingNo||null,category:p.category,title:p.title,message:p.message,audienceRoles:p.audienceRoles,channel:'EMAIL',attemptReason,requestedBy:user.sub,attemptedAt:new Date().toISOString()};
    if(!endpoint){
      const payload={...basePayload,deliveryStatus:'PENDING_CONFIGURATION',reason:'Approved external email provider endpoint is not configured'};
      await this.prisma.integrationEvent.create({data:{id:deliveryId,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_EMAIL_DELIVERY_ATTEMPT',objectType:'ExternalCommunicationDelivery',objectId:messageEvent.id,status:'RETRY_PENDING',payload,errorMessage:payload.reason}});
      return payload;
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const token=String(process.env.ANCLINE_EXTERNAL_EMAIL_TOKEN||'').trim();
      const r=await (globalThis as any).fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(basePayload),signal:controller.signal});
      if(!r.ok)throw new Error('External email provider returned HTTP '+r.status);
      const payload={...basePayload,deliveryStatus:'SENT',sentAt:new Date().toISOString()};
      await this.prisma.integrationEvent.create({data:{id:deliveryId,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_EMAIL_DELIVERY_ATTEMPT',objectType:'ExternalCommunicationDelivery',objectId:messageEvent.id,status:'COMPLETED',payload,completedAt:new Date()}});
      return payload;
    }catch(e:any){
      const reason=e?.name==='AbortError'?'External email provider timed out':String(e?.message||'External email delivery failed');
      const payload={...basePayload,deliveryStatus:'FAILED',reason};
      await this.prisma.integrationEvent.create({data:{id:deliveryId,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_EMAIL_DELIVERY_ATTEMPT',objectType:'ExternalCommunicationDelivery',objectId:messageEvent.id,status:'FAILED',payload,errorMessage:reason}});
      return payload;
    }finally{clearTimeout(timer);}
  }

  externalCommunicationTemplates(user:ScopeUser){
    this.scope.assertInternal(user);
    return [
      {id:'BOOKING_CONFIRMATION',category:'BOOKING_CONFIRMATION',title:'Booking confirmed',message:'Your ANCLINE booking has been confirmed. Open the shipment to review the latest booking details.',requiresAcknowledgement:false},
      {id:'DOCUMENT_REQUEST',category:'DOCUMENT_REQUEST',title:'Documents required',message:'Additional shipment documents are required. Please open the shipment and provide the requested documents.',requiresAcknowledgement:true},
      {id:'SCHEDULE_CHANGE',category:'SCHEDULE_CHANGE',title:'Schedule updated',message:'The shipment schedule has been updated. Please review the latest ETD/ETA and routing details in the portal.',requiresAcknowledgement:false},
      {id:'CUT_OFF_CHANGE',category:'CUT_OFF_CHANGE',title:'Cut-off updated',message:'A shipment cut-off has changed. Please review the latest cut-off details and take the required action.',requiresAcknowledgement:true},
      {id:'MILESTONE_UPDATE',category:'MILESTONE_UPDATE',title:'Shipment milestone update',message:'A new shipment milestone has been recorded. Open the shipment timeline for the latest status.',requiresAcknowledgement:false},
      {id:'APPROVED_DELAY_NOTICE',category:'APPROVED_DELAY_NOTICE',title:'Shipment delay notice',message:'An approved shipment delay has been recorded. Please review the updated schedule in the portal.',requiresAcknowledgement:false},
      {id:'APPROVED_EXCEPTION_NOTICE',category:'APPROVED_EXCEPTION_NOTICE',title:'Shipment exception update',message:'An approved customer-visible shipment exception requires your attention. Open the shipment for details.',requiresAcknowledgement:true},
      {id:'PAYMENT_REQUEST',category:'PAYMENT_REQUEST',title:'Payment action required',message:'A payment action is required before the next shipment release step can proceed. Please review the shipment account information.',requiresAcknowledgement:true},
      {id:'DOCUMENT_RELEASE_REQUEST',category:'DOCUMENT_RELEASE_REQUEST',title:'Document release action required',message:'A document release action is required. Please review the shipment documents and complete the requested action.',requiresAcknowledgement:true},
      {id:'RELEASE_NOTICE',category:'RELEASE_NOTICE',title:'Shipment release update',message:'A shipment release update is available. Open the shipment to review the latest release status.',requiresAcknowledgement:false}
    ];
  }

  async publishExternalCommunication(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const category=String(body?.category||'').trim().toUpperCase();
    if(!this.externalCategories().includes(category))throw new BadRequestException('Unsupported external communication category');
    if(user.role==='FINANCE'&&!['PAYMENT_REQUEST','DOCUMENT_RELEASE_REQUEST','RELEASE_NOTICE'].includes(category))throw new ForbiddenException('Finance may publish only approved payment/release communication categories');
    const bookingId=String(body?.bookingId||'').trim();
    if(!bookingId)throw new BadRequestException('Booking is required');
    await this.scope.assertBookingAccess(user,bookingId);
    const booking:any=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,bookingNo:true}});
    if(!booking)throw new BadRequestException('Booking not found');
    const title=String(body?.title||'').trim().slice(0,160),message=String(body?.message||'').trim().slice(0,4000);
    if(!title||!message)throw new BadRequestException('Title and message are required');
    const forbidden=this.externalForbiddenText(title+' '+message);
    if(forbidden)throw new BadRequestException('External communication contains prohibited internal content: '+forbidden);
    const audienceRoles=[...new Set((Array.isArray(body?.audienceRoles)?body.audienceRoles:[]).map((x:any)=>String(x).toUpperCase()).filter((x:string)=>this.externalRoles().includes(x)))];
    if(!audienceRoles.length)throw new BadRequestException('At least one external audience role is required');
    const channels=[...new Set((Array.isArray(body?.channels)?body.channels:['IN_APP']).map((x:any)=>String(x).toUpperCase()).filter((x:string)=>['IN_APP','EMAIL'].includes(x)))];
    if(!channels.length)throw new BadRequestException('At least one delivery channel is required');
    const key=String(body?.idempotencyKey||[bookingId,category,title,message,audienceRoles.sort().join(','),channels.sort().join(',')].join('|'));
    const id=this.externalMessageId(key);
    const existing=await this.prisma.integrationEvent.findUnique({where:{id}});
    if(existing)return {message:existing,duplicate:true};
    const payload:any={bookingId,bookingNo:booking.bookingNo,category,title,message,audienceRoles,channels,requiresAcknowledgement:Boolean(body?.requiresAcknowledgement),publishedBy:user.sub,publishedAt:new Date().toISOString(),externalSafe:true,deliveryStatus:{IN_APP:channels.includes('IN_APP')?'DELIVERED':'NOT_REQUESTED',EMAIL:channels.includes('EMAIL')?'PENDING':'NOT_REQUESTED'}};
    const event=await this.prisma.integrationEvent.create({data:{id,sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION',eventType:'EXTERNAL_MESSAGE_PUBLISHED',objectType:'ExternalCommunication',objectId:id,status:'COMPLETED',payload,completedAt:new Date()}});
    let email:any=null;
    if(channels.includes('EMAIL'))email=await this.dispatchExternalEmail(event,'PUBLISH',user);
    await this.audit.log({actorId:user.sub,action:'EXTERNAL_COMMUNICATION_PUBLISH',objectType:'ExternalCommunication',objectId:id,bookingId,detail:{category,audienceRoles,channels,requiresAcknowledgement:payload.requiresAcknowledgement,emailStatus:email?.deliveryStatus||'NOT_REQUESTED'}});
    return {message:event,email,duplicate:false};
  }

  async resendExternalCommunication(messageId:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const event=await this.prisma.integrationEvent.findUnique({where:{id:messageId}});
    if(!event||event.sourceSystem!=='ANCLINE_EXTERNAL_COMMUNICATION'||event.objectType!=='ExternalCommunication')throw new BadRequestException('External communication was not found');
    const p:any=this.externalEventPayload(event);
    await this.scope.assertBookingAccess(user,String(p.bookingId||''));
    const channel=String(body?.channel||'EMAIL').toUpperCase();
    if(channel!=='EMAIL')throw new BadRequestException('Only EMAIL delivery currently requires resend/retry');
    const result=await this.dispatchExternalEmail(event,'RESEND',user);
    await this.audit.log({actorId:user.sub,action:'EXTERNAL_COMMUNICATION_RESEND',objectType:'ExternalCommunication',objectId:messageId,bookingId:String(p.bookingId||''),detail:{channel,status:result.deliveryStatus}});
    return result;
  }

  async externalCommunicationHistory(user:ScopeUser){
    this.scope.assertInternal(user);
    const bookings=await this.prisma.booking.findMany({where:bookingScope(user),select:{id:true}});
    const ids=new Set(bookings.map(x=>String(x.id)));
    const rows=await this.prisma.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_EXTERNAL_COMMUNICATION'},orderBy:{createdAt:'desc'},take:800});
    return rows.filter(x=>{
      const p:any=this.externalEventPayload(x),bookingId=String(p.bookingId||'');
      if(x.objectType==='ExternalCommunicationPreference')return false;
      return bookingId&&ids.has(bookingId);
    }).map(x=>({id:x.id,eventType:x.eventType,objectType:x.objectType,objectId:x.objectId,status:x.status,createdAt:x.createdAt,payload:this.externalEventPayload(x)}));
  }

  async releaseSecurity(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    return evaluateReleaseSecurity(this.prisma as any,bookingId);
  }

  async bookings(user:ScopeUser){
    this.allowedPortalRole(user);
    const customerView=['CUSTOMER','SHIPPER','CONSIGNEE','AGENT'].includes(String(user.role||'').toUpperCase());
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
