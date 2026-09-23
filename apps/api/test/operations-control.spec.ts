import { OperationsControlService } from '../src/modules/operations/operations-control.service';

const admin:any={sub:'admin-1',email:'admin@ancline.test',role:'GLOBAL_ADMIN'};

describe('Operations Control dashboard aggregation',()=>{
  function make(){
    const now=Date.now();
    const booking={
      id:'b1',bookingNo:'50001',businessModel:'NVOCC',owningBranchId:'br1',operator:'OPS-1',status:'OPERATIONAL',
      creditStatus:'Blocked',slotStatus:'Waitlist',equipmentStatus:'Shortage',atd:null,
      cyClosing:new Date(now+2*3600000),siCutoff:new Date(now+3*3600000),vgmCutoff:null,docCutoff:null,portCutoff:null,
      updatedAt:new Date(now-1000),
      documents:[{id:'d1',type:'HOUSE_BL',status:'DRAFT',releaseControl:'HOLD',updatedAt:new Date(now-1000)}],
      tasks:[{id:'t1',title:'Submit SI',ownerId:'OPS-1',status:'Open',dueAt:new Date(now-2*3600000),updatedAt:new Date(now-1000)}],
      approvals:[{id:'a1',type:'RATE_OVERRIDE',approverId:'MGR-1',status:'Pending',reason:'Margin review',updatedAt:new Date(now-1000)}],
      milestones:[{id:'m1',code:'GATE_IN',label:'Gate in',location:'NLRTM',plannedAt:new Date(now-3*3600000),status:'PLANNED',updatedAt:new Date(now-1000)}],
      financeLines:[{id:'f1',chargeCode:'OCEAN',currency:'USD',amount:100,status:'DISPUTED'}]
    };
    const prisma:any={
      booking:{findMany:jest.fn().mockResolvedValue([booking])},
      branch:{findMany:jest.fn().mockResolvedValue([{id:'br1',code:'RTM'}])},
      integrationEvent:{findMany:jest.fn().mockResolvedValue([{id:'e1',sourceSystem:'CARRIER_API',eventType:'BOOKING_SUBMIT',objectType:'Booking',objectId:'b1',externalId:null,status:'FAILED',payload:{bookingId:'b1',error:'provider timeout'},createdAt:new Date(now-1000),updatedAt:new Date(now-1000)}])},
      task:{findUnique:jest.fn(),findFirst:jest.fn(),create:jest.fn(),update:jest.fn()}
    };
    const scope:any={assertInternal:jest.fn(),assertBookingAccess:jest.fn()};
    const audit:any={log:jest.fn()};
    return {service:new OperationsControlService(prisma,scope,audit),prisma,scope,audit};
  }

  it('consolidates every approved exception family without duplicate IDs',async()=>{
    const {service}=make();
    const result:any=await service.dashboard(admin);
    const categories=new Set(result.rows.map((x:any)=>x.category));
    expect(categories).toEqual(new Set([
      'ACTION_REQUIRED','CUT_OFF_RISK','DOCUMENT_GAP','PAYMENT_RELEASE_BLOCK','FAILED_EVENT','LATE_MILESTONE','RECONCILIATION_EXCEPTION'
    ]));
    expect(new Set(result.rows.map((x:any)=>x.id)).size).toBe(result.rows.length);
    expect(result.summary.open).toBe(result.rows.length);
    expect(result.summary.critical).toBeGreaterThan(0);
    expect(result.rows.find((x:any)=>x.category==='DOCUMENT_GAP').actionHref).toBe('/documents?bookingId=b1');
    expect(result.rows.find((x:any)=>x.category==='LATE_MILESTONE').actionHref).toBe('/tracking?bookingId=b1');
    expect(result.rows.find((x:any)=>x.category==='FAILED_EVENT').actionHref).toBe('/connectivity');
    const taskRow=result.rows.find((x:any)=>x.id==='action-task-t1');
    expect(taskRow.taskId).toBe('t1');
    expect(taskRow.queueMutable).toBe(true);
  });

  it('claims a booking-bound exception into the existing Task model and audits the action',async()=>{
    const {service,prisma,scope,audit}=make();
    prisma.task.findFirst.mockResolvedValue(null);
    prisma.task.create.mockImplementation(({data}:any)=>Promise.resolve({id:'q1',...data}));
    const row:any=await service.claim('action-credit-b1',admin);
    expect(scope.assertBookingAccess).toHaveBeenCalledWith(admin,'b1');
    expect(prisma.task.create).toHaveBeenCalledWith({data:expect.objectContaining({bookingId:'b1',ownerId:'admin@ancline.test',status:'Acknowledged'})});
    expect(row.id).toBe('q1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({action:'OPERATIONS_CONTROL_CLAIM',bookingId:'b1'}));
  });

  it('uses existing booking scope and hides unbound platform failures from branch users',async()=>{
    const {service,prisma}=make();
    prisma.integrationEvent.findMany.mockResolvedValue([{id:'e2',sourceSystem:'PLATFORM',eventType:'CALLBACK',objectType:'Provider',objectId:'provider-1',status:'FAILED',payload:{error:'down'},createdAt:new Date(),updatedAt:new Date()}]);
    const branchUser:any={sub:'ops-2',email:'branch@ancline.test',role:'BRANCH_OPS',branchId:'br1'};
    const result:any=await service.dashboard(branchUser);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{owningBranchId:'br1'}}));
    expect(result.rows.some((x:any)=>x.id==='event-e2')).toBe(false);
  });
});
