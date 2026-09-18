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
    if(!['AGENT','BRANCH_OPS','GLOBAL_ADMIN','CONTROL_TOWER'].includes(role))throw new ForbiddenException('NVOCC Portal access is limited to Agent, Branch Office and Admin / Control Tower users');
    return role;
  }

  private allowedPortalRole(user:ScopeUser){
    const role=String(user.role||'').toUpperCase();
    if(!['CUSTOMER','AGENT','BRANCH_OPS','GLOBAL_ADMIN','CONTROL_TOWER'].includes(role))throw new ForbiddenException('Portal booking access denied');
    return role;
  }

  async customers(user:ScopeUser){
    const role=this.allowedPortalRole(user);
    if(role==='CUSTOMER'){
      if(!user.customerId)return [];
      const row=await this.prisma.organization.findUnique({where:{id:user.customerId},select:{id:true,code:true,name:true,active:true}});
      return row&&row.active?[row]:[];
    }
    if(role==='AGENT'){
      if(!user.agentId)return [];
      const [agent,rows]=await Promise.all([this.prisma.organization.findUnique({where:{id:user.agentId},select:{id:true,code:true,name:true,active:true}}),this.prisma.booking.findMany({where:{producingAgentId:user.agentId},select:{customer:{select:{id:true,code:true,name:true,active:true}}},distinct:['customerId'],take:200})]);
      const all=[agent,...rows.map(x=>x.customer)].filter((x:any)=>x?.active),seen=new Set<string>();return all.filter((x:any)=>!seen.has(x.id)&&Boolean(seen.add(x.id))).sort((a:any,b:any)=>a.name.localeCompare(b.name));
    }
    return this.prisma.organization.findMany({where:{active:true,roles:{has:'CUSTOMER'}},select:{id:true,code:true,name:true,active:true},orderBy:{name:'asc'},take:500});
  }

  async directBooking(body:any,user:ScopeUser){
    const role=this.allowedPortalRole(user);
    const origin=String(body?.origin||'').trim().toUpperCase(),destination=String(body?.destination||'').trim().toUpperCase(),equipment=String(body?.equipment||'').trim().toUpperCase();
    if(!origin||!destination||!equipment)throw new BadRequestException('Origin, destination and equipment are required');
    if(origin===destination)throw new BadRequestException('Origin and destination must be different');
    let customerId=String(body?.customerId||'').trim(),producingAgentId:string|null=null,owningBranchId:string|null=null;
    if(role==='CUSTOMER'){if(!user.customerId)throw new ForbiddenException('Customer account is not linked');customerId=user.customerId;}
    else if(role==='AGENT'){if(!user.agentId)throw new ForbiddenException('Agent account is not linked');producingAgentId=user.agentId;if(!customerId)customerId=user.agentId;}
    else if(role==='BRANCH_OPS'){if(!user.branchId)throw new ForbiddenException('Branch account is not linked');owningBranchId=user.branchId;}
    if(!customerId)throw new BadRequestException('Customer is required');
    const customer=await this.prisma.organization.findUnique({where:{id:customerId}});
    const agentSelf=role==='AGENT'&&customerId===user.agentId&&Array.isArray(customer?.roles)&&customer.roles.includes('AGENT');
    if(!customer||!customer.active||(!agentSelf&&(!Array.isArray(customer.roles)||!customer.roles.includes('CUSTOMER'))))throw new BadRequestException('Contracting party must be an active customer or the logged-in agent organization');
    if(role==='AGENT'&&!agentSelf){const allowed=(await this.customers(user)).some((x:any)=>x.id===customerId);if(!allowed)throw new ForbiddenException('Agent can only book for itself or customers already assigned to the agent');}
    const quantity=Math.max(1,Math.min(999,Math.floor(Number(body?.quantity||1))));
    const bookingNo='WEB-'+Date.now().toString().slice(-10);
    const bookingChannel=role==='CUSTOMER'?'CUSTOMER_PORTAL':role==='AGENT'?'AGENT_PORTAL':role==='BRANCH_OPS'?'BRANCH_PORTAL':'INTERNAL';
    const row=await this.prisma.booking.create({data:{
      bookingNo,businessModel:'FORWARDING',bookingChannel,customerId,producingAgentId,owningBranchId,salesOwner:user.email,
      bookingType:String(body?.bookingType||'FCL').toUpperCase(),transportMode:String(body?.transportMode||'SEA').toUpperCase(),serviceType:String(body?.serviceType||'PORT_TO_PORT').toUpperCase(),
      bookingDate:new Date(),customerReference:body?.customerReference?String(body.customerReference):null,
      shipper:body?.shipper?String(body.shipper):null,consignee:body?.consignee?String(body.consignee):null,
      origin,destination,portOfLoading:String(body?.portOfLoading||origin).trim().toUpperCase(),portOfDischarge:String(body?.portOfDischarge||destination).trim().toUpperCase(),
      placeOfReceipt:body?.placeOfReceipt?String(body.placeOfReceipt):null,placeOfDelivery:body?.placeOfDelivery?String(body.placeOfDelivery):null,
      equipment,quantity,commodity:body?.commodity?String(body.commodity):null,grossWeight:body?.grossWeight!==''&&body?.grossWeight!=null?Number(body.grossWeight):null,volumeCbm:body?.volumeCbm!==''&&body?.volumeCbm!=null?Number(body.volumeCbm):null,
      specialCargo:body?.specialCargo&&String(body.specialCargo).toUpperCase()!=='NONE'?String(body.specialCargo).toUpperCase():null,
      freightTerms:String(body?.freightTerms||'PREPAID').toUpperCase(),currency:String(body?.currency||'USD').toUpperCase(),
      etd:body?.etd?new Date(body.etd):null,status:'DRAFT',notes:'Created through ANCLINE online forwarding channel'
    }});
    await this.audit.log({actorId:user.sub,action:'PORTAL_DIRECT_BOOKING_CREATE',objectType:'Booking',objectId:row.id,bookingId:row.id,detail:{role,businessModel:'FORWARDING',bookingChannel,bookingNo:row.bookingNo,customerId,producingAgentId,owningBranchId,origin,destination,equipment,quantity}});
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
    await this.audit.log({actorId:user.sub,action:'PORTAL_QUOTE_ACCEPTED_BOOKING_REQUESTED',objectType:'Booking',objectId:bookingId,bookingId,detail:{quoteNo:quote.quoteNo,role:user.role}});
    return {booking:updated,quote:{id:quote.id,quoteNo:quote.quoteNo,sellRate:quote.sellRate,currency:quote.currency,status:'Customer Accepted'}};
  }

  async releaseSecurity(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    return evaluateReleaseSecurity(this.prisma as any,bookingId);
  }

  async bookings(user:ScopeUser){
    const customerView=user.role==='CUSTOMER';
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
