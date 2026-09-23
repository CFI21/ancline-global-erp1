import { PortalService } from '../src/modules/portal/portal.service';

const admin:any={sub:'admin-1',email:'admin@test',role:'GLOBAL_ADMIN'};
const customer:any={sub:'cust-1',email:'cust@test',role:'CUSTOMER',customerId:'org-c1'};
const finance:any={sub:'fin-1',email:'fin@test',role:'FINANCE'};

describe('CR-20260924-007 external communications',()=>{
  function make(){
    const events:any[]=[];
    const audits:any[]=[];
    const booking={id:'b1',bookingNo:'50001'};
    const prisma:any={
      booking:{
        findMany:jest.fn(async()=>[booking]),
        findUnique:jest.fn(async({where}:any)=>where.id==='b1'?booking:null)
      },
      integrationEvent:{
        findUnique:jest.fn(async({where}:any)=>events.find(x=>x.id===where.id)||null),
        findMany:jest.fn(async({where}:any={})=>events.filter(x=>{
          if(where?.sourceSystem&&x.sourceSystem!==where.sourceSystem)return false;
          if(where?.objectType&&x.objectType!==where.objectType)return false;
          if(where?.eventType&&x.eventType!==where.eventType)return false;
          if(where?.status&&x.status!==where.status)return false;
          if(where?.objectId?.startsWith&&!String(x.objectId||'').startsWith(where.objectId.startsWith))return false;
          return true;
        })),
        create:jest.fn(async({data}:any)=>{const row={createdAt:new Date(),updatedAt:new Date(),...data};events.push(row);return row;}),
        update:jest.fn(async({where,data}:any)=>{const row=events.find(x=>x.id===where.id);Object.assign(row,data);return row;})
      }
    };
    const scope:any={
      assertInternal:jest.fn((u:any)=>{if(!['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE'].includes(u.role))throw new Error('internal denied');}),
      assertBookingAccess:jest.fn(async()=>true)
    };
    const audit:any={log:jest.fn(async(x:any)=>{audits.push(x);})};
    return {service:new PortalService(prisma,scope,audit),prisma,scope,audit,events,audits};
  }

  it('publishes one logical message idempotently and fails email closed without provider config',async()=>{
    const {service,events}=make();
    delete process.env.ANCLINE_EXTERNAL_EMAIL_ENDPOINT;
    const body={bookingId:'b1',category:'DOCUMENT_REQUEST',title:'Documents required',message:'Please upload the required shipment documents.',audienceRoles:['CUSTOMER'],channels:['IN_APP','EMAIL'],requiresAcknowledgement:true,idempotencyKey:'CR007-IDEM-1'};
    const a:any=await service.publishExternalCommunication(body,admin);
    const b:any=await service.publishExternalCommunication(body,admin);
    expect(a.duplicate).toBe(false);
    expect(a.email.deliveryStatus).toBe('PENDING_CONFIGURATION');
    expect(b.duplicate).toBe(true);
    expect(events.filter(x=>x.objectType==='ExternalCommunication')).toHaveLength(1);
    expect(events.some(x=>x.objectType==='ExternalCommunicationDelivery'&&x.status==='RETRY_PENDING')).toBe(true);
  });

  it('rejects internal/confidential wording before external publication',async()=>{
    const {service}=make();
    await expect(service.publishExternalCommunication({bookingId:'b1',category:'MILESTONE_UPDATE',title:'Internal note',message:'CONTROL_TOWER SLA LEVEL_3 buy rate margin',audienceRoles:['CUSTOMER'],channels:['IN_APP']},admin)).rejects.toThrow(/prohibited internal content/i);
  });

  it('limits finance to approved payment/release categories',async()=>{
    const {service}=make();
    await expect(service.publishExternalCommunication({bookingId:'b1',category:'MILESTONE_UPDATE',title:'Update',message:'Shipment updated.',audienceRoles:['CUSTOMER'],channels:['IN_APP']},finance)).rejects.toThrow(/Finance may publish only/i);
  });

  it('returns only addressed, booking-scoped messages and supports read/ack persistence',async()=>{
    const {service}=make();
    const pub:any=await service.publishExternalCommunication({bookingId:'b1',category:'DOCUMENT_REQUEST',title:'Docs',message:'Please provide documents.',audienceRoles:['CUSTOMER'],channels:['IN_APP'],requiresAcknowledgement:true,idempotencyKey:'CR007-CUST-1'},admin);
    let feed:any=await service.externalCommunications(customer);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toEqual(expect.objectContaining({bookingId:'b1',title:'Docs',requiresAcknowledgement:true,read:false,acknowledged:false}));
    expect(feed.items[0]).not.toHaveProperty('publishedBy');
    await service.markExternalCommunicationRead(pub.message.id,customer);
    await service.acknowledgeExternalCommunication(pub.message.id,customer);
    feed=await service.externalCommunications(customer);
    expect(feed.items[0].read).toBe(true);
    expect(feed.items[0].acknowledged).toBe(true);
  });

  it('does not require forwarding-exception permission for normal AGENT communication access',async()=>{
    const {service}=make();
    const agent:any={sub:'agent-1',email:'agent@test',role:'AGENT',agentId:'org-a1',permissions:['NVOCC_PORTAL']};
    await service.publishExternalCommunication({bookingId:'b1',category:'BOOKING_CONFIRMATION',title:'Confirmed',message:'Your booking is confirmed.',audienceRoles:['AGENT'],channels:['IN_APP'],idempotencyKey:'CR007-AGENT-1'},admin);
    const feed:any=await service.externalCommunications(agent);
    expect(feed.items).toHaveLength(1);
  });

  it('external users cannot call the internal publication path',async()=>{
    const {service}=make();
    await expect(service.publishExternalCommunication({bookingId:'b1',category:'BOOKING_CONFIRMATION',title:'Confirmed',message:'Booking confirmed.',audienceRoles:['CUSTOMER'],channels:['IN_APP']},customer)).rejects.toThrow('internal denied');
  });
});
