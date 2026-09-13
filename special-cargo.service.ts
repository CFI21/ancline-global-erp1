import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
@Injectable()
export class SpecialCargoService {
 constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
 async dg(bookingId:string,body:any,user:ScopeUser){ await this.scope.assertBookingAccess(user,bookingId); this.scope.assertInternal(user); if(!body.unNumber||!body.properShippingName||!body.imoClass) throw new BadRequestException('UN number, proper shipping name and IMO class are required'); const row=await this.prisma.dGDeclaration.create({data:{...body,bookingId}}); await this.audit.log({actorId:user.sub,action:'DG_DECLARATION_CREATE',objectType:'DGDeclaration',objectId:row.id,bookingId,detail:{unNumber:row.unNumber,imoClass:row.imoClass}}); return row; }
 async oog(bookingId:string,body:any,user:ScopeUser){ await this.scope.assertBookingAccess(user,bookingId); this.scope.assertInternal(user); const slotKill=Math.max(0,Number(body.slotKillTeu||0)); const row=await this.prisma.oOGProfile.create({data:{...body,bookingId,slotKillTeu:slotKill}}); await this.audit.log({actorId:user.sub,action:'OOG_PROFILE_CREATE',objectType:'OOGProfile',objectId:row.id,bookingId,detail:{equipment:row.equipment,slotKillTeu:String(row.slotKillTeu)}}); return {...row,effectiveTeu:Number(row.baseTeu)+Number(row.slotKillTeu)}; }
 async readiness(bookingId:string,user:ScopeUser){ await this.scope.assertBookingAccess(user,bookingId); const b=await this.prisma.booking.findUnique({where:{id:bookingId},include:{dgDeclarations:true,oogProfiles:true}}); if(!b) throw new BadRequestException('Booking not found'); const dgBlocked=b.specialCargo==='DG' && !b.dgDeclarations.some(x=>x.carrierApproval==='APPROVED'&&x.terminalAcceptance==='APPROVED'); const oogBlocked=b.specialCargo==='OOG' && !b.oogProfiles.some(x=>x.approvalStatus==='APPROVED'); return {bookingId,dgBlocked,oogBlocked,ready:!dgBlocked&&!oogBlocked}; }
}
