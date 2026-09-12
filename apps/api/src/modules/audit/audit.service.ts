import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma:PrismaService){}
  log(input:{actorId:string;action:string;objectType:string;objectId:string;bookingId?:string|null;detail?:any}){
    return this.prisma.auditEvent.create({data:{
      actorId:input.actorId,
      action:input.action,
      objectType:input.objectType,
      objectId:input.objectId,
      bookingId:input.bookingId||null,
      detail:input.detail||{}
    }});
  }
}
