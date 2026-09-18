import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeUser, bookingScope } from './scope';

@Injectable()
export class ScopeService {
  constructor(private prisma:PrismaService){}

  async assertBookingAccess(user:ScopeUser, bookingId:string){
    const count=await this.prisma.booking.count({where:{id:bookingId,...bookingScope(user)}});
    if(count!==1) throw new ForbiddenException('Booking is outside your authorized scope');
  }

  assertFinanceAccess(user:ScopeUser){
    if(!['GLOBAL_ADMIN','FINANCE'].includes(user.role))
      throw new ForbiddenException('Finance access denied');
  }

  assertInternal(user:ScopeUser){
    if(['CUSTOMER','SHIPPER','CONSIGNEE','AGENT'].includes(user.role))
      throw new ForbiddenException('Internal-only operation');
  }
}
