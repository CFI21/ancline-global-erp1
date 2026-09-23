import { OperationsService } from '../src/modules/operations/operations.service';

const admin:any={sub:'admin-1',email:'admin@ancline.test',role:'GLOBAL_ADMIN'};
const branchUser:any={sub:'ops-1',email:'ops@ancline.test',role:'BRANCH_OPS',branchId:'br1'};

describe('CR-20260923-005 Unified Operations Communication Center',()=>{
  function make(){
    const events:any[]=[
      {id:'auto1',sourceSystem:'ANCLINE_ORCHESTRATION',objectType:'AutomationNotification',eventType:'AUTOMATION_NOTIFICATION_CREATED',status:'COMPLETED',payload:{bookingId:'b1',severity:'CRITICAL',title:'SLA critical',message:'LEVEL_3 escalation',level:'LEVEL_3'},createdAt:new Date()},
      {id:'fail1',sourceSystem:'CARRIER_API',objectType:'Booking',objectId:'b1',eventType:'BOOKING_PUSH',status:'FAILED',payload:{bookingId:'b1',error:'timeout'},errorMessage:'timeout',createdAt:new Date()}
    ];
    const prisma:any={
      booking:{findMany:jest.fn().mockResolvedValue([{id:'b1',bookingNo:'50001',owningBranchId:'br1'}])},
      notification:{findMany:jest.fn().mockResolvedValue([
        {id:'n1',userId:'admin-1',category:'WARNING · DOCUMENT',title:'Document hold: 50001',message:'BL is held [booking:b1]',objectType:'AUTO_RISK',objectId:'DOCUMENT:d1:HOLD',status:'UNREAD',readAt:null,createdAt:new Date(),updatedAt:new Date()}
      ])},
      integrationEvent:{
        findMany:jest.fn(async ({where}:any={})=>{
          if(where?.sourceSystem==='ANCLINE_COMMUNICATION')return events.filter(x=>x.sourceSystem==='ANCLINE_COMMUNICATION');
          if(where?.sourceSystem==='ANCLINE_GOVERNANCE')return events.filter(x=>x.sourceSystem==='ANCLINE_GOVERNANCE');
          return events;
        }),
        findUnique:jest.fn(async ({where}:any)=>events.find(x=>x.id===where.id)||null),
        create:jest.fn(async ({data}:any)=>{const row={createdAt:new Date(),...data};events.push(row);return row;}),
        update:jest.fn(async ({where,data}:any)=>{const row=events.find(x=>x.id===where.id);Object.assign(row,data);return row;})
      },
      auditEvent:{findMany:jest.fn().mockResolvedValue([
        {id:'a1',bookingId:'b1',actorId:'ops',action:'OPERATIONS_CONTROL_CLAIM',objectType:'Task',objectId:'t1',detail:{after:{ownerId:'ops'}},createdAt:new Date()}
      ])}
    };
    const scope:any={assertInternal:jest.fn(),assertBookingAccess:jest.fn()};
    const audit:any={log:jest.fn()};
    const alerts:any={scan:jest.fn().mockResolvedValue({activeRisks:1})};
    return {service:new OperationsService(prisma,scope,audit,alerts),prisma,scope,audit,alerts,events};
  }

  it('consolidates risk, action queue, SLA escalation and failed integration with direct action links',async()=>{
    const {service}=make();
    const result:any=await service.communicationCenter(admin);
    expect(result.items.some((x:any)=>x.source==='OPERATIONAL_RISK'&&x.actionHref.includes('/documents'))).toBe(true);
    expect(result.items.some((x:any)=>x.source==='SLA_AUTOMATION'&&x.escalationLevel==='LEVEL_3'&&x.mandatory)).toBe(true);
    expect(result.items.some((x:any)=>x.kind==='FAILED_INTEGRATION'&&x.actionHref==='/connectivity')).toBe(true);
    expect(result.items.some((x:any)=>x.kind==='ACTION_QUEUE'&&x.actionHref.includes('/exceptions'))).toBe(true);
    expect(new Set(result.items.map((x:any)=>x.id)).size).toBe(result.items.length);
  });

  it('acknowledges a visible item idempotently and writes audit evidence',async()=>{
    const {service,events,audit}=make();
    const first:any=await service.acknowledgeCommunication('note:n1',admin);
    const second:any=await service.acknowledgeCommunication('note:n1',admin);
    expect(first.itemId).toBe('note:n1');
    expect(second.itemId).toBe('note:n1');
    expect(events.filter(x=>x.sourceSystem==='ANCLINE_COMMUNICATION')).toHaveLength(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({action:'COMMUNICATION_ACKNOWLEDGE',objectId:'note:n1'}));
  });

  it('forces CRITICAL delivery even when optional notifications are muted',async()=>{
    const {service}=make();
    await service.updateCommunicationPreferences({muteOptional:true,severities:[]},admin);
    const result:any=await service.communicationCenter(admin);
    expect(result.preferences.mandatoryCritical).toBe(true);
    expect(result.items.some((x:any)=>x.severity==='CRITICAL'&&x.escalationLevel==='LEVEL_3')).toBe(true);
    expect(result.items.some((x:any)=>x.severity==='WARNING')).toBe(false);
  });

  it('uses existing branch booking scope for branch operations',async()=>{
    const {service,prisma}=make();
    await service.communicationCenter(branchUser);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{owningBranchId:'br1'}}));
  });

  it('fails closed when external role reaches the internal center',async()=>{
    const {service,scope}=make();
    scope.assertInternal.mockImplementation((u:any)=>{if(u.role==='CUSTOMER')throw new Error('Internal access required');});
    await expect(service.communicationCenter({sub:'c1',email:'c@test',role:'CUSTOMER'} as any)).rejects.toThrow('Internal access required');
  });
});
