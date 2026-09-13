import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
@Injectable()
export class DocumentOpsService{
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  async summary(bookingId:string,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId);
    const booking=await this.prisma.booking.findUnique({where:{id:bookingId},include:{documents:true,billsOfLading:true,manifests:true,dgDeclarations:true,legs:true,equipmentReleases:true,agentAssignments:true,operationalExceptions:true}});
    if(!booking) throw new BadRequestException('Booking not found');
    return booking;
  }
  async cro(bookingId:string,user:ScopeUser){await this.scope.assertBookingAccess(user,bookingId);return this.prisma.equipmentReleaseOrder.findMany({where:{bookingId},orderBy:{createdAt:'desc'}})}
  async createCro(bookingId:string,body:any,user:ScopeUser){
    await this.scope.assertBookingAccess(user,bookingId); this.scope.assertInternal(user);
    const dg=await this.prisma.dGDeclaration.findFirst({where:{bookingId}});
    const dgRequired=!!dg;
    if(dgRequired && (!dg || dg.carrierApproval!=='APPROVED' || dg.terminalAcceptance!=='APPROVED')) throw new BadRequestException('DG CRO blocked until carrier and terminal approvals are approved');
    const row=await this.prisma.equipmentReleaseOrder.create({data:{...body,bookingId,dgRequired,dgApproved:dgRequired}});
    await this.audit.log({actorId:user.sub,action:'CRO_CREATE',objectType:'EquipmentReleaseOrder',objectId:row.id,bookingId,detail:{croNo:row.croNo,equipmentType:row.equipmentType,quantity:row.quantity}}); return row;
  }
  async releaseCro(id:string,user:ScopeUser){
    const row=await this.prisma.equipmentReleaseOrder.findUnique({where:{id}}); if(!row) throw new BadRequestException('CRO not found');
    await this.scope.assertBookingAccess(user,row.bookingId); this.scope.assertInternal(user);
    if(row.dgRequired&&!row.dgApproved) throw new BadRequestException('DG CRO release blocked');
    const out=await this.prisma.equipmentReleaseOrder.update({where:{id},data:{releaseStatus:'RELEASED',releasedBy:user.sub,releasedAt:new Date()}});
    await this.audit.log({actorId:user.sub,action:'CRO_RELEASE',objectType:'EquipmentReleaseOrder',objectId:id,bookingId:row.bookingId,detail:{croNo:row.croNo}}); return out;
  }
  async agents(bookingId:string,user:ScopeUser){await this.scope.assertBookingAccess(user,bookingId);return this.prisma.portAgentAssignment.findMany({where:{bookingId},orderBy:[{legSequence:'asc'},{role:'asc'}]})}
  async assignAgent(bookingId:string,body:any,user:ScopeUser){await this.scope.assertBookingAccess(user,bookingId);this.scope.assertInternal(user);if(!['POL_AGENT','TRANSIT_AGENT','POD_AGENT'].includes(body.role))throw new BadRequestException('Invalid port agent role');const row=await this.prisma.portAgentAssignment.upsert({where:{bookingId_role_port:{bookingId,role:body.role,port:body.port}},update:{agentId:body.agentId,legSequence:body.legSequence,instructions:body.instructions,status:'ASSIGNED'},create:{bookingId,...body}});await this.audit.log({actorId:user.sub,action:'PORT_AGENT_ASSIGN',objectType:'PortAgentAssignment',objectId:row.id,bookingId,detail:{role:row.role,port:row.port,agentId:row.agentId}});return row}
  exceptions(user:ScopeUser){return this.prisma.operationalException.findMany({where:{booking:bookingScope(user)},include:{booking:{select:{bookingNo:true,origin:true,destination:true}}},orderBy:[{status:'asc'},{createdAt:'desc'}]})}
  async createException(bookingId:string,body:any,user:ScopeUser){await this.scope.assertBookingAccess(user,bookingId);this.scope.assertInternal(user);const row=await this.prisma.operationalException.create({data:{bookingId,...body}});await this.audit.log({actorId:user.sub,action:'OP_EXCEPTION_CREATE',objectType:'OperationalException',objectId:row.id,bookingId,detail:{code:row.code,severity:row.severity}});return row}
  async resolveException(id:string,body:any,user:ScopeUser){const row=await this.prisma.operationalException.findUnique({where:{id}});if(!row)throw new BadRequestException('Exception not found');await this.scope.assertBookingAccess(user,row.bookingId);this.scope.assertInternal(user);const out=await this.prisma.operationalException.update({where:{id},data:{status:'RESOLVED',resolution:body.resolution||'Resolved',resolvedAt:new Date()}});await this.audit.log({actorId:user.sub,action:'OP_EXCEPTION_RESOLVE',objectType:'OperationalException',objectId:id,bookingId:row.bookingId,detail:{resolution:out.resolution}});return out}
}
