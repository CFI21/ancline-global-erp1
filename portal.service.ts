import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { bookingScope, ScopeUser } from '../auth/scope';

@Injectable()
export class PortalService {
  constructor(private prisma:PrismaService){}
  bookings(user:ScopeUser){
    return this.prisma.booking.findMany({
      where:bookingScope(user),
      select:{
        id:true,bookingNo:true,status:true,origin:true,destination:true,etd:true,eta:true,
        customer:{select:{id:true,name:true}},
        documents:{select:{id:true,documentNo:true,type:true,status:true}},
        containers:{select:{id:true,containerNo:true,type:true,status:true,location:true}}
      },
      orderBy:{createdAt:'desc'}
    });
  }
}
