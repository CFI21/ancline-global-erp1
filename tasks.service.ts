import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class TasksService {
  constructor(private prisma:PrismaService){}
  list(){return this.prisma.task.findMany({orderBy:{createdAt:'desc'}});}
  create(body:any){return this.prisma.task.create({data:body});}
  complete(id:string){return this.prisma.task.update({where:{id},data:{status:'Completed',slaState:'Met'}});}
}
