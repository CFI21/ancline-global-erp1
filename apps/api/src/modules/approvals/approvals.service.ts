import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class ApprovalsService {
  constructor(private prisma:PrismaService){}
  list(){return this.prisma.approval.findMany({orderBy:{createdAt:'desc'}});}
  create(body:any){return this.prisma.approval.create({data:body});}
  approve(id:string){return this.prisma.approval.update({where:{id},data:{status:'Approved'}});}
  reject(id:string){return this.prisma.approval.update({where:{id},data:{status:'Rejected'}});}
}
