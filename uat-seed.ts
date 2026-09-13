import { PrismaClient, OrgRole, BookingStatus, FinanceType, FinanceStatus } from '@prisma/client';
const db=new PrismaClient();

async function main(){
  const customer=await db.organization.upsert({
    where:{code:'UAT-CUSTOMER'},
    update:{},
    create:{code:'UAT-CUSTOMER',name:'ANCLINE UAT Customer',roles:[OrgRole.CUSTOMER],countryCode:'NL'}
  });
  const agent=await db.organization.upsert({
    where:{code:'UAT-AGENT'},
    update:{},
    create:{code:'UAT-AGENT',name:'ANCLINE UAT Agent',roles:[OrgRole.AGENT],countryCode:'AE'}
  });
  const booking=await db.booking.upsert({
    where:{bookingNo:'UAT-BK-0001'},
    update:{},
    create:{
      bookingNo:'UAT-BK-0001',
      customerId:customer.id,
      producingAgentId:agent.id,
      origin:'Shanghai',
      destination:'Rotterdam',
      status:BookingStatus.CONFIRMED,
      carrier:'UAT Carrier',
      vesselVoyage:'UAT 001E',
      equipment:'1x40HC',
      creditStatus:'Passed',
      slotStatus:'Protected',
      equipmentStatus:'Available',
      currency:'USD'
    }
  });
  const existing=await db.financeLine.count({where:{bookingId:booking.id}});
  if(!existing){
    await db.financeLine.createMany({data:[
      {bookingId:booking.id,type:FinanceType.REVENUE,chargeCode:'UAT_SELL',amount:2500,currency:'USD',status:FinanceStatus.POSTED,source:'UAT'},
      {bookingId:booking.id,type:FinanceType.COST,chargeCode:'UAT_BUY',amount:1800,currency:'USD',status:FinanceStatus.POSTED,source:'UAT'}
    ]});
  }
  const notifyCount=await db.notification.count({where:{userId:'uat-admin'}});
  if(!notifyCount) await db.notification.create({data:{userId:'uat-admin',category:'OPERATIONS',title:'UAT booking ready',message:'UAT-BK-0001 is available for workflow testing',objectType:'Booking',objectId:booking.id}});
  const intCount=await db.integrationEvent.count({where:{externalId:'UAT-EVT-0001'}});
  if(!intCount) await db.integrationEvent.create({data:{sourceSystem:'UAT-CARRIER',eventType:'BOOKING_CONFIRMATION',externalId:'UAT-EVT-0001',objectType:'Booking',objectId:booking.id,payload:{bookingNo:booking.bookingNo,status:'CONFIRMED'},status:'COMPLETED',completedAt:new Date()}});
  console.log('UAT seed ready', booking.bookingNo);
  console.log('UAT integration event and notification ready');
}
main().finally(()=>db.$disconnect());
