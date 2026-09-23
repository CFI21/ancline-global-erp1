import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TasksService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  private normalizedStatus(value:any,current='Open'){
    const raw=String(value??current).trim().toUpperCase().replace(/[ -]+/g,'_');
    const map:Record<string,string>={OPEN:'Open',ACKNOWLEDGED:'Acknowledged',IN_PROGRESS:'In Progress',COMPLETED:'Completed'};
    if(!map[raw]) throw new BadRequestException('Task status must be Open, Acknowledged, In Progress or Completed');
    return map[raw];
  }

  private slaState(status:string,dueAt:Date|null,current?:string|null){
    if(status==='Completed')return 'Met';
    if(!dueAt)return current||'On Track';
    const ms=dueAt.getTime()-Date.now();
    if(ms<0)return 'Overdue';
    if(ms<=24*3600000)return 'At Risk';
    return 'On Track';
  }

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
    const status=this.normalizedStatus(body.status,'Open');
    const dueAt=body.dueAt?new Date(body.dueAt):null;
    if(dueAt&&Number.isNaN(dueAt.getTime()))throw new BadRequestException('Invalid due date');
    const row=await this.prisma.task.create({data:{
      bookingId:body.bookingId||null,title:String(body.title),ownerId:body.ownerId||null,dueAt,status,
      slaState:this.slaState(status,dueAt,body.slaState)
    }});
    await this.audit.log({actorId:user.sub,action:'TASK_CREATE',objectType:'Task',objectId:row.id,bookingId:row.bookingId||undefined,detail:{title:row.title,ownerId:row.ownerId,dueAt:row.dueAt,status:row.status,slaState:row.slaState}});
    return row;
  }

  async update(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const current=await this.prisma.task.findUnique({where:{id}});
    if(!current)throw new BadRequestException('Task not found');
    if(current.bookingId)await this.scope.assertBookingAccess(user,current.bookingId);

    const allowed=new Set(['ownerId','dueAt','status']);
    if(!Object.keys(body||{}).some(k=>allowed.has(k)))throw new BadRequestException('No supported task fields supplied');

    const status=Object.prototype.hasOwnProperty.call(body,'status')?this.normalizedStatus(body.status,current.status):current.status;
    let dueAt=current.dueAt;
    if(Object.prototype.hasOwnProperty.call(body,'dueAt')){
      dueAt=body.dueAt?new Date(body.dueAt):null;
      if(dueAt&&Number.isNaN(dueAt.getTime()))throw new BadRequestException('Invalid due date');
    }
    const ownerId=Object.prototype.hasOwnProperty.call(body,'ownerId')?(body.ownerId?String(body.ownerId).trim():null):current.ownerId;
    const next={ownerId,dueAt,status,slaState:this.slaState(status,dueAt,current.slaState)};
    const row=await this.prisma.task.update({where:{id},data:next});
    await this.audit.log({
      actorId:user.sub,action:'TASK_ACTION_QUEUE_UPDATE',objectType:'Task',objectId:id,bookingId:row.bookingId||undefined,
      detail:{before:{ownerId:current.ownerId,dueAt:current.dueAt,status:current.status,slaState:current.slaState},after:{ownerId:row.ownerId,dueAt:row.dueAt,status:row.status,slaState:row.slaState}}
    });
    return row;
  }

  async complete(id:string,user:ScopeUser){
    return this.update(id,{status:'Completed'},user);
  }
}
