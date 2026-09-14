import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SchedulesService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  async list(user:ScopeUser){
    this.scope.assertInternal(user);
    return this.prisma.vesselVoyageSchedule.findMany({orderBy:[{etd:'asc'},{carrier:'asc'},{vessel:'asc'}]});
  }

  private date(value:any,label:string,required=false){
    if(!value){if(required) throw new BadRequestException(`${label} is required`);return null;}
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) throw new BadRequestException(`${label} is invalid`);
    return d;
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    for(const key of ['carrier','vessel','voyage','portOfLoading','portOfDischarge']) if(!String(body?.[key]||'').trim()) throw new BadRequestException(`${key} is required`);
    const etd=this.date(body?.etd,'ETD',true)!;
    const eta=this.date(body?.eta,'ETA',true)!;
    if(eta.getTime()<=etd.getTime()) throw new BadRequestException('ETA must be later than ETD');
    const scheduleNo=String(body?.scheduleNo||`SCH-${Date.now().toString(36).toUpperCase()}`).trim().toUpperCase();
    const exists=await this.prisma.vesselVoyageSchedule.findUnique({where:{scheduleNo}});
    if(exists) throw new BadRequestException('Schedule number already exists');
    const row=await this.prisma.vesselVoyageSchedule.create({data:{
      scheduleNo,carrier:String(body.carrier).trim(),serviceName:body.serviceName||null,vessel:String(body.vessel).trim(),imoNo:body.imoNo||null,
      voyage:String(body.voyage).trim(),direction:body.direction||null,portOfLoading:String(body.portOfLoading).trim(),portOfDischarge:String(body.portOfDischarge).trim(),terminal:body.terminal||null,
      etd,eta,atd:this.date(body.atd,'ATD'),ata:this.date(body.ata,'ATA'),cyClosing:this.date(body.cyClosing,'CY Closing'),siCutoff:this.date(body.siCutoff,'SI Cutoff'),vgmCutoff:this.date(body.vgmCutoff,'VGM Cutoff'),docCutoff:this.date(body.docCutoff,'Document Cutoff'),
      capacityTeu:body.capacityTeu===undefined||body.capacityTeu===''?null:Number(body.capacityTeu),status:String(body.status||'PLANNED'),source:String(body.source||'MANUAL'),remarks:body.remarks||null,createdBy:user.sub
    }});
    await this.audit.log({actorId:user.sub,action:'VESSEL_SCHEDULE_CREATE',objectType:'VesselVoyageSchedule',objectId:row.id,detail:{scheduleNo:row.scheduleNo,carrier:row.carrier,vessel:row.vessel,voyage:row.voyage}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.vesselVoyageSchedule.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Schedule not found');
    const data:any={};
    const textFields=['scheduleNo','carrier','serviceName','vessel','imoNo','voyage','direction','portOfLoading','portOfDischarge','terminal','status','source','remarks'];
    for(const key of textFields) if(Object.prototype.hasOwnProperty.call(body,key)) data[key]=body[key]?String(body[key]).trim():null;
    const dateFields=['etd','eta','atd','ata','cyClosing','siCutoff','vgmCutoff','docCutoff'];
    for(const key of dateFields) if(Object.prototype.hasOwnProperty.call(body,key)) data[key]=this.date(body[key],key.toUpperCase());
    if(Object.prototype.hasOwnProperty.call(body,'capacityTeu')) data.capacityTeu=body.capacityTeu===''||body.capacityTeu===null?null:Number(body.capacityTeu);
    const etd=data.etd||current.etd; const eta=data.eta||current.eta;
    if(eta.getTime()<=etd.getTime()) throw new BadRequestException('ETA must be later than ETD');
    if(data.scheduleNo) data.scheduleNo=String(data.scheduleNo).toUpperCase();
    try{
      const row=await this.prisma.vesselVoyageSchedule.update({where:{id},data});
      await this.audit.log({actorId:user.sub,action:'VESSEL_SCHEDULE_UPDATE',objectType:'VesselVoyageSchedule',objectId:id,detail:{changedFields:Object.keys(data)}});
      return row;
    }catch(e:any){if(e?.code==='P2002') throw new BadRequestException('Schedule number already exists');throw e;}
  }

  async remove(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.vesselVoyageSchedule.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Schedule not found');
    await this.prisma.vesselVoyageSchedule.delete({where:{id}});
    await this.audit.log({actorId:user.sub,action:'VESSEL_SCHEDULE_DELETE',objectType:'VesselVoyageSchedule',objectId:id,detail:{scheduleNo:current.scheduleNo}});
    return {ok:true};
  }

  async applyToBooking(id:string,bookingId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    if(!bookingId) throw new BadRequestException('Booking is required');
    await this.scope.assertBookingAccess(user,bookingId);
    const schedule=await this.prisma.vesselVoyageSchedule.findUnique({where:{id}});
    if(!schedule) throw new BadRequestException('Schedule not found');

    const booking=await this.prisma.booking.update({where:{id:bookingId},data:{
      carrier:schedule.carrier,vesselVoyage:`${schedule.vessel} / ${schedule.voyage}`,portOfLoading:schedule.portOfLoading,portOfDischarge:schedule.portOfDischarge,terminal:schedule.terminal,
      etd:schedule.etd,eta:schedule.eta,atd:schedule.atd,ata:schedule.ata,cyClosing:schedule.cyClosing,siCutoff:schedule.siCutoff,vgmCutoff:schedule.vgmCutoff,docCutoff:schedule.docCutoff
    }});

    const mainLeg=await this.prisma.bookingLeg.findFirst({where:{bookingId,legType:'MAIN'},orderBy:{sequence:'asc'}});
    if(mainLeg){
      await this.prisma.bookingLeg.update({where:{id:mainLeg.id},data:{
        mode:'SEA',origin:schedule.portOfLoading,destination:schedule.portOfDischarge,carrier:schedule.carrier,
        vessel:schedule.vessel,voyage:schedule.voyage,terminal:schedule.terminal,etd:schedule.etd,eta:schedule.eta,
        atd:schedule.atd,ata:schedule.ata,status:schedule.status,remarks:`Schedule ${schedule.scheduleNo}`
      }});
    }else{
      const last=await this.prisma.bookingLeg.findFirst({where:{bookingId},orderBy:{sequence:'desc'},select:{sequence:true}});
      await this.prisma.bookingLeg.create({data:{
        bookingId,sequence:(last?.sequence||0)+1,legType:'MAIN',mode:'SEA',origin:schedule.portOfLoading,destination:schedule.portOfDischarge,
        carrier:schedule.carrier,vessel:schedule.vessel,voyage:schedule.voyage,terminal:schedule.terminal,etd:schedule.etd,eta:schedule.eta,
        atd:schedule.atd,ata:schedule.ata,status:schedule.status,remarks:`Schedule ${schedule.scheduleNo}`
      }});
    }

    await this.audit.log({actorId:user.sub,action:'VESSEL_SCHEDULE_APPLY',objectType:'VesselVoyageSchedule',objectId:id,bookingId,detail:{scheduleNo:schedule.scheduleNo,vessel:schedule.vessel,voyage:schedule.voyage,routingSynced:true}});
    return booking;
  }
}
