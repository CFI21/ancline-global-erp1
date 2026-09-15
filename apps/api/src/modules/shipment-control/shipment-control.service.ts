import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ShipmentControlService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private date(v:any,name:string,required=false){
    if(v===undefined||v===null||v===''){
      if(required) throw new BadRequestException(`${name} is required`);
      return null;
    }
    const d=new Date(v);
    if(Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date for ${name}`);
    return d;
  }

  private consolScope(user:ScopeUser){
    this.scope.assertInternal(user);
    if(user.role==='BRANCH_OPS') return user.branchId?{owningBranchId:user.branchId}:{id:'__none__'};
    return {};
  }

  async shipments(user:ScopeUser){
    this.scope.assertInternal(user);
    return this.prisma.booking.findMany({
      where:{...bookingScope(user),shipmentNo:{not:null}},
      select:{
        id:true,bookingNo:true,shipmentNo:true,shipmentStatus:true,consolId:true,status:true,
        customerReference:true,houseBL:true,masterBL:true,origin:true,destination:true,
        portOfLoading:true,portOfDischarge:true,carrier:true,vesselVoyage:true,etd:true,eta:true,atd:true,ata:true,
        equipment:true,quantity:true,packageCount:true,packageType:true,grossWeight:true,volumeCbm:true,
        customer:{select:{name:true,code:true}},
        consol:{select:{id:true,consolNo:true,status:true,masterBL:true,vessel:true,voyage:true,carrier:true}}
      },
      orderBy:{updatedAt:'desc'}
    });
  }

  async consols(user:ScopeUser){
    const where=this.consolScope(user);
    return this.prisma.consol.findMany({
      where,
      include:{shipments:{select:{id:true,bookingNo:true,shipmentNo:true,shipmentStatus:true,houseBL:true,customerReference:true,customer:{select:{name:true}}}}},
      orderBy:[{etd:'asc'},{createdAt:'desc'}]
    });
  }

  async dashboard(user:ScopeUser){
    const [shipments,consols]=await Promise.all([this.shipments(user),this.consols(user)]);
    return {
      houseShipments:shipments.length,
      unconsolidated:shipments.filter((s:any)=>!s.consolId).length,
      activeConsols:consols.filter((c:any)=>c.status!=='CLOSED').length,
      inTransit:consols.filter((c:any)=>c.status==='DEPARTED').length,
      arrived:consols.filter((c:any)=>c.status==='ARRIVED').length
    };
  }

  async promoteBooking(bookingId:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId}});
    if(!booking) throw new BadRequestException('Booking not found');
    if(booking.status==='CANCELLED') throw new BadRequestException('Cancelled booking cannot become a shipment');
    if(booking.shipmentNo) return booking;

    const shipmentNo=String(body?.shipmentNo||`SHP-${booking.bookingNo}`).trim().toUpperCase();
    if(!shipmentNo) throw new BadRequestException('Shipment number is required');
    const exists=await this.prisma.booking.findFirst({where:{shipmentNo}});
    if(exists) throw new BadRequestException(`Shipment ${shipmentNo} already exists`);

    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{shipmentNo,shipmentStatus:'OPEN'}});
    await this.audit.log({actorId:user.sub,action:'BOOKING_PROMOTE_SHIPMENT',objectType:'Booking',objectId:bookingId,bookingId,detail:{bookingNo:booking.bookingNo,shipmentNo}});
    return updated;
  }

  async createConsol(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const origin=String(body?.origin||'').trim().toUpperCase();
    const destination=String(body?.destination||'').trim().toUpperCase();
    const portOfLoading=String(body?.portOfLoading||origin).trim().toUpperCase();
    const portOfDischarge=String(body?.portOfDischarge||destination).trim().toUpperCase();
    if(!origin||!destination||!portOfLoading||!portOfDischarge) throw new BadRequestException('Origin, destination, POL and POD are required');
    const etd=this.date(body?.etd,'ETD',true)!;
    const eta=this.date(body?.eta,'ETA',true)!;
    if(eta<=etd) throw new BadRequestException('ETA must be after ETD');
    const consolNo=String(body?.consolNo||`CNS-${Date.now().toString().slice(-10)}`).trim().toUpperCase();
    const duplicate=await this.prisma.consol.findUnique({where:{consolNo}});
    if(duplicate) throw new BadRequestException(`Consol ${consolNo} already exists`);

    const row=await this.prisma.consol.create({data:{
      consolNo,
      mode:String(body?.mode||'SEA').trim().toUpperCase(),
      carrier:body?.carrier?String(body.carrier).trim():null,
      serviceName:body?.serviceName?String(body.serviceName).trim():null,
      masterBL:body?.masterBL?String(body.masterBL).trim().toUpperCase():null,
      vessel:body?.vessel?String(body.vessel).trim():null,
      voyage:body?.voyage?String(body.voyage).trim():null,
      origin,destination,portOfLoading,portOfDischarge,
      terminal:body?.terminal?String(body.terminal).trim():null,
      etd,eta,status:'PLANNED',
      owningBranchId:user.branchId||body?.owningBranchId||null,
      remarks:body?.remarks?String(body.remarks):null,
      createdBy:user.sub
    }});
    await this.audit.log({actorId:user.sub,action:'CONSOL_CREATE',objectType:'Consol',objectId:row.id,detail:{consolNo:row.consolNo,route:`${origin}-${destination}`,carrier:row.carrier,vessel:row.vessel,voyage:row.voyage}});
    return row;
  }

  async assign(consolId:string,bookingId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    await this.scope.assertBookingAccess(user,bookingId);
    const [consol,booking]=await Promise.all([
      this.prisma.consol.findUnique({where:{id:consolId}}),
      this.prisma.booking.findUnique({where:{id:bookingId}})
    ]);
    if(!consol) throw new BadRequestException('Consol not found');
    if(!booking) throw new BadRequestException('Shipment not found');
    if(!booking.shipmentNo) throw new BadRequestException('Booking must be promoted to a shipment first');
    if(!['PLANNED','CONFIRMED'].includes(consol.status)) throw new BadRequestException('Cannot assign shipments after consol departure');
    if(booking.consolId&&booking.consolId!==consolId) throw new BadRequestException('Shipment is already assigned to another consol');
    if(booking.consolId===consolId) return booking;

    const vesselVoyage=[consol.vessel,consol.voyage].filter(Boolean).join(' / ')||booking.vesselVoyage;
    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{
      consolId,
      shipmentStatus:'CONSOLIDATED',
      masterBL:consol.masterBL||booking.masterBL,
      carrier:consol.carrier||booking.carrier,
      vesselVoyage,
      etd:consol.etd,
      eta:consol.eta,
      portOfLoading:booking.portOfLoading||consol.portOfLoading,
      portOfDischarge:booking.portOfDischarge||consol.portOfDischarge
    }});
    await this.audit.log({actorId:user.sub,action:'SHIPMENT_ASSIGN_CONSOL',objectType:'Booking',objectId:bookingId,bookingId,detail:{shipmentNo:booking.shipmentNo,consolId,consolNo:consol.consolNo}});
    return updated;
  }

  async unassign(consolId:string,bookingId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    await this.scope.assertBookingAccess(user,bookingId);
    const [consol,booking]=await Promise.all([
      this.prisma.consol.findUnique({where:{id:consolId}}),
      this.prisma.booking.findUnique({where:{id:bookingId}})
    ]);
    if(!consol||!booking) throw new BadRequestException('Consol or shipment not found');
    if(!['PLANNED','CONFIRMED'].includes(consol.status)) throw new BadRequestException('Cannot unassign shipments after consol departure');
    if(booking.consolId!==consolId) throw new BadRequestException('Shipment is not assigned to this consol');
    const updated=await this.prisma.booking.update({where:{id:bookingId},data:{consolId:null,shipmentStatus:'OPEN'}});
    await this.audit.log({actorId:user.sub,action:'SHIPMENT_UNASSIGN_CONSOL',objectType:'Booking',objectId:bookingId,bookingId,detail:{shipmentNo:booking.shipmentNo,consolNo:consol.consolNo}});
    return updated;
  }

  async transition(consolId:string,next:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const consol=await this.prisma.consol.findUnique({where:{id:consolId},include:{shipments:{select:{id:true,bookingNo:true,shipmentNo:true,status:true}}}});
    if(!consol) throw new BadRequestException('Consol not found');
    if(user.role==='BRANCH_OPS'&&consol.owningBranchId!==user.branchId) throw new BadRequestException('Consol is outside your branch scope');
    const allowed:Record<string,string[]>={PLANNED:['CONFIRMED'],CONFIRMED:['DEPARTED'],DEPARTED:['ARRIVED'],ARRIVED:['CLOSED'],CLOSED:[]};
    if(!(allowed[consol.status]||[]).includes(next)) throw new BadRequestException(`Consol cannot move from ${consol.status} to ${next}`);
    if(next==='DEPARTED'&&consol.shipments.length===0) throw new BadRequestException('Cannot depart an empty consol');
    const now=new Date();

    const result=await this.prisma.$transaction(async tx=>{
      const data:any={status:next};
      if(next==='DEPARTED') data.atd=now;
      if(next==='ARRIVED') data.ata=now;
      const updated=await tx.consol.update({where:{id:consolId},data});
      for(const shipment of consol.shipments){
        const bookingData:any={shipmentStatus:next==='CONFIRMED'?'CONSOL_CONFIRMED':next};
        if(next==='DEPARTED'){
          bookingData.atd=now;
          if(!['CANCELLED','FINANCIALLY_CLOSED'].includes(String(shipment.status))) bookingData.status='OPERATIONAL';
        }
        if(next==='ARRIVED') bookingData.ata=now;
        await tx.booking.update({where:{id:shipment.id},data:bookingData});
        if(next==='DEPARTED'||next==='ARRIVED'){
          const code=next==='DEPARTED'?'DEPARTED':'ARRIVED';
          const label=next==='DEPARTED'?'Departed':'Arrived';
          const location=next==='DEPARTED'?consol.portOfLoading:consol.portOfDischarge;
          const existing=await tx.shipmentMilestone.findFirst({where:{bookingId:shipment.id,code},orderBy:{createdAt:'asc'}});
          if(existing) await tx.shipmentMilestone.update({where:{id:existing.id},data:{status:'COMPLETED',actualAt:now,location,source:'CONSOL'}});
          else await tx.shipmentMilestone.create({data:{bookingId:shipment.id,code,label,status:'COMPLETED',actualAt:now,location,source:'CONSOL'}});
        }
      }
      return updated;
    });
    await this.audit.log({actorId:user.sub,action:`CONSOL_${next}`,objectType:'Consol',objectId:consolId,detail:{consolNo:consol.consolNo,from:consol.status,to:next,shipmentCount:consol.shipments.length}});
    return result;
  }
}
