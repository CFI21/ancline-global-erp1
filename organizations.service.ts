import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class OrganizationsService {
  constructor(private prisma:PrismaService){}
  list(){ return this.prisma.organization.findMany({orderBy:{name:'asc'}}); }
  get(id:string){ return this.prisma.organization.findUnique({where:{id}}); }
  create(body:any){ return this.prisma.organization.create({data:body}); }
}
