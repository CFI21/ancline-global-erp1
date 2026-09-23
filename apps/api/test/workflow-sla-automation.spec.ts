import { WorkflowAutomationService } from '../src/modules/workflow-automation/workflow-automation.service';

const admin:any={sub:'admin-1',email:'admin@ancline.test',role:'GLOBAL_ADMIN'};

describe('CR-20260923-004 SLA automation',()=>{
  function make(){
    const events:any[]=[];
    const integrationEvent={
      findUnique:jest.fn(async ({where}:any)=>events.find(x=>x.id===where.id)||null),
      findMany:jest.fn(async ({where}:any={})=>events.filter(x=>{
        if(!where)return true;
        if(where.sourceSystem&&x.sourceSystem!==where.sourceSystem)return false;
        if(where.objectType&&x.objectType!==where.objectType)return false;
        return true;
      })),
      create:jest.fn(async ({data}:any)=>{
        const id=data.id||'evt-'+(events.length+1);
        if(events.some(x=>x.id===id)){const e:any=new Error('duplicate');e.code='P2002';throw e;}
        const row={createdAt:new Date(),...data,id};events.push(row);return row;
      }),
      update:jest.fn(async ({where,data}:any)=>{
        const row=events.find(x=>x.id===where.id);if(!row)throw new Error('missing '+where.id);
        Object.assign(row,data);return row;
      })
    };
    let taskSeq=0;
    const prisma:any={
      integrationEvent,
      task:{create:jest.fn(async ({data}:any)=>({id:'esc-'+(++taskSeq),...data}))},
      approval:{findMany:jest.fn().mockResolvedValue([])}
    };
    const scope:any={assertInternal:jest.fn(),assertBookingAccess:jest.fn()};
    const audit:any={log:jest.fn().mockResolvedValue({})};
    const service=new WorkflowAutomationService(prisma,scope,audit);
    return {service,prisma,scope,audit,events};
  }

  it('creates a deterministic Level 1 in-app reminder and timer for at-risk task',async()=>{
    const {service,events}=make();
    const task:any={id:'t1',bookingId:'b1',title:'Submit SI',ownerId:'ops@ancline.test',dueAt:new Date(Date.now()+2*3600000),status:'In Progress',slaState:'At Risk'};
    const first:any=await service.processTaskSla(task,admin);
    const second:any=await service.processTaskSla(task,admin);
    expect(first.level).toBe('LEVEL_1');
    expect(first.notificationId).toBeTruthy();
    expect(first.timerId).toBeTruthy();
    expect(second.duplicate).toBe(true);
    expect(events.filter(x=>x.objectType==='AutomationNotification')).toHaveLength(1);
    expect(events.filter(x=>x.objectType==='EscalationTimer')).toHaveLength(1);
  });

  it('creates Level 2 overdue escalation and Level 3 control-tower escalation for persistent critical queue work',async()=>{
    const {service,events}=make();
    const overdue:any={id:'t2',bookingId:'b1',title:'Submit VGM',ownerId:'ops@ancline.test',dueAt:new Date(Date.now()-2*3600000),status:'In Progress',slaState:'Overdue'};
    const persistent:any={id:'t3',bookingId:'b1',title:'[OC:cutoff-b1] Critical cut-off',ownerId:'ops@ancline.test',dueAt:new Date(Date.now()-26*3600000),status:'In Progress',slaState:'Overdue'};
    const l2:any=await service.processTaskSla(overdue,admin);
    const l3:any=await service.processTaskSla(persistent,admin);
    expect(l2.level).toBe('LEVEL_2');
    expect(l2.timerId).toBeTruthy();
    expect(l3.level).toBe('LEVEL_3');
    expect(l3.timerId).toBeNull();
    const notifications=events.filter(x=>x.objectType==='AutomationNotification').map(x=>x.payload);
    expect(notifications.find((x:any)=>x.level==='LEVEL_2').recipients).toContain('Operations Manager');
    expect(notifications.find((x:any)=>x.level==='LEVEL_3').recipients).toContain('CONTROL_TOWER');
  });

  it('does not escalate completed tasks',async()=>{
    const {service,events}=make();
    const result:any=await service.processTaskSla({id:'done',bookingId:'b1',title:'Done',dueAt:new Date(Date.now()-3600000),status:'Completed',slaState:'Met'},admin);
    expect(result.status).toBe('NO_ESCALATION');
    expect(events).toHaveLength(0);
  });

  it('skips a due timer when another worker already holds the processing claim',async()=>{
    const {service,prisma,events}=make();
    const timerId='timer-race';
    events.push({
      id:timerId,sourceSystem:'ANCLINE_ORCHESTRATION',objectType:'EscalationTimer',objectId:timerId,
      eventType:'ESCALATION_TIMER_CREATED',status:'COMPLETED',createdAt:new Date(),
      payload:{timerId,process:'OPERATIONS_ACTION_QUEUE',trigger:'TASK_SLA_ESCALATION',bookingId:'b1',objectType:'Task',objectId:'t-race',ownerRole:'CONTROL_TOWER',dueAt:new Date(Date.now()-1000).toISOString(),status:'PENDING'}
    });
    const executionId=(service as any).deterministicId('timerexec',timerId);
    events.push({
      id:executionId,sourceSystem:'ANCLINE_ORCHESTRATION',objectType:'EscalationExecution',objectId:timerId,
      eventType:'ESCALATION_EXECUTION_CLAIMED',status:'PROCESSING',createdAt:new Date(),payload:{timerId,startedAt:new Date().toISOString()}
    });
    const result:any=await service.runDue(admin);
    expect(result.executed).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('claims due timer execution idempotently before creating escalation task',async()=>{
    const {service,prisma,events}=make();
    events.push({
      id:'timer-one',sourceSystem:'ANCLINE_ORCHESTRATION',objectType:'EscalationTimer',objectId:'timer-one',
      eventType:'ESCALATION_TIMER_CREATED',status:'COMPLETED',createdAt:new Date(),
      payload:{timerId:'timer-one',process:'OPERATIONS_ACTION_QUEUE',trigger:'TASK_SLA_ESCALATION',bookingId:'b1',objectType:'Task',objectId:'t1',ownerRole:'CONTROL_TOWER',dueAt:new Date(Date.now()-1000).toISOString(),status:'PENDING'}
    });
    const first:any=await service.runDue(admin);
    const second:any=await service.runDue(admin);
    expect(first.executed).toBe(1);
    expect(second.executed).toBe(0);
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });
});
