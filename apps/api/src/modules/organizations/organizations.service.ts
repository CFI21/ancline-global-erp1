import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';

@Injectable()
export class OrganizationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService){}
  list(){ return this.prisma.organization.findMany({orderBy:{name:'asc'}}); }
  get(id:string){ return this.prisma.organization.findUnique({where:{id}}); }
  create(body:any,user:ScopeUser){ this.scope.assertInternal(user); return this.prisma.organization.create({data:body}); }
}
