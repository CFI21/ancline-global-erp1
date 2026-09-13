import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TasksService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  list(user:ScopeUser){
    this.scope.assertInternal(user);
    const scoped=bookingScope(user);
    return this.prisma.task.findMany({
      where:Object.keys(scoped).length?{booking:{is:scoped}}:{},
      include:{booking:{select:{bookingNo:true,origin:true,destination:true}}},
      orderBy:{createdAt:'desc'}
    });
  }

  async create(body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    if(!body?.title) throw new BadRequestException('Task title is required');
    if(body.bookingId) await this.scope.assertBookingAccess(user,String(body.bookingId));
    const row=await this.prisma.task.create({data:{bookingId:body.bookingId||null,title:String(body.title),ownerId:body.ownerId||null,dueAt:body.dueAt?new Date(body.dueAt):null,status:body.status||'Open',slaState:body.slaState||'On Track'}});
    await this.audit.log({actorId:user.sub,action:'TASK_CREATE',objectType:'Task',objectId:row.id,bookingId:row.bookingId||undefined,detail:{title:row.title,ownerId:row.ownerId}});
    return row;
  }

  async complete(id:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.task.findUnique({where:{id}});
    if(!current) throw new BadRequestException('Task not found');
    if(current.bookingId) await this.scope.assertBookingAccess(user,current.bookingId);
    const row=await this.prisma.task.update({where:{id},data:{status:'Completed',slaState:'Met'}});
    await this.audit.log({actorId:user.sub,action:'TASK_COMPLETE',objectType:'Task',objectId:id,bookingId:row.bookingId||undefined,detail:{title:row.title}});
    return row;
  }
}
