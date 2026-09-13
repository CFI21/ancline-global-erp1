import { PrismaClient, OrgRole, BookingStatus, FinanceType, FinanceStatus } from '@prisma/client';
const db = new PrismaClient();

async function main(){
  const customer = await db.organization.upsert({
    where:{code:'CUS-ABC'},
    update:{},
    create:{code:'CUS-ABC',name:'ABC Trading LLC',roles:[OrgRole.CUSTOMER],countryCode:'AE'}
  });
  const agent = await db.organization.upsert({
    where:{code:'AGT-XYZ'},
    update:{},
    create:{code:'AGT-XYZ',name:'XYZ Dubai',roles:[OrgRole.AGENT],countryCode:'AE'}
  });
  const booking = await db.booking.upsert({
    where:{bookingNo:'BK00182'},
    update:{},
    create:{
      bookingNo:'BK00182',customerId:customer.id,producingAgentId:agent.id,
      origin:'Shanghai',destination:'Jebel Ali',carrier:'CMA CGM',
      vesselVoyage:'CMA TITAN 218E',equipment:'5x40HC',currency:'USD',
      status:BookingStatus.OPERATIONAL,creditStatus:'Passed',slotStatus:'Protected',equipmentStatus:'Available'
    }
  });
  await db.financeLine.createMany({data:[
    {bookingId:booking.id,type:FinanceType.REVENUE,chargeCode:'OCEAN_FREIGHT',amount:10600,currency:'USD',status:FinanceStatus.POSTED,source:'Customer Rate'},
    {bookingId:booking.id,type:FinanceType.COST,chargeCode:'OCEAN_SLOT',amount:7900,currency:'USD',status:FinanceStatus.POSTED,source:'Carrier Contract'}
  ],skipDuplicates:true});
}
main().finally(()=>db.$disconnect());
