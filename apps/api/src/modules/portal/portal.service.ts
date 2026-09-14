import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { bookingScope, ScopeUser } from '../auth/scope';

@Injectable()
export class PortalService {
  constructor(private prisma:PrismaService){}

  async bookings(user:ScopeUser){
    const customerView=user.role==='CUSTOMER';
    const rows=await this.prisma.booking.findMany({
      where:bookingScope(user),
      select:{
        id:true,bookingNo:true,status:true,origin:true,destination:true,portOfLoading:true,portOfDischarge:true,terminal:true,
        etd:true,eta:true,atd:true,ata:true,carrier:true,vesselVoyage:true,houseBL:true,masterBL:true,
        customer:{select:{id:true,name:true}},
        documents:{
          where:customerView?{status:'Released'}:undefined,
          select:{id:true,documentNo:true,type:true,status:true,releaseControl:true,version:true}
        },
        containers:{
          select:{
            id:true,containerNo:true,type:true,status:true,location:true,sealNo:true,
            movements:{select:{id:true,eventCode:true,eventLabel:true,status:true,location:true,occurredAt:true,source:true},orderBy:{occurredAt:'desc'},take:5}
          }
        },
        milestones:{
          select:{id:true,code:true,label:true,location:true,plannedAt:true,actualAt:true,status:true,source:true},
          orderBy:[{actualAt:'asc'},{plannedAt:'asc'},{createdAt:'asc'}]
        }
      },
      orderBy:{createdAt:'desc'}
    });

    return rows.map(b=>{
      const latestMovement=(b.containers||[]).flatMap(c=>(c.movements||[]).map(m=>({...m,containerNo:c.containerNo}))).sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime())[0]||null;
      const completedMilestones=(b.milestones||[]).filter(m=>String(m.status).toUpperCase()==='COMPLETED');
      const nextMilestone=(b.milestones||[]).filter(m=>String(m.status).toUpperCase()!=='COMPLETED').sort((a,b)=>new Date(a.plannedAt||'9999-12-31').getTime()-new Date(b.plannedAt||'9999-12-31').getTime())[0]||null;
      return {...b,latestMovement,progress:{completed:completedMilestones.length,total:(b.milestones||[]).length,nextMilestone}};
    });
  }
}
