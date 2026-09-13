import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class RatesService {
  constructor(private prisma:PrismaService){}
  list(){return this.prisma.rateQuote.findMany({orderBy:{createdAt:'desc'}});}
  get(id:string){return this.prisma.rateQuote.findUnique({where:{id}});}
  create(body:any){return this.prisma.rateQuote.create({data:body});}
  setStatus(id:string,status:string){return this.prisma.rateQuote.update({where:{id},data:{status}});}
}
