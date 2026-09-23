import { TasksService } from '../src/modules/tasks/tasks.service';

const admin:any={sub:'admin-1',email:'admin@ancline.test',role:'GLOBAL_ADMIN'};

describe('Operations action queue task mutations',()=>{
  function make(){
    const current:any={id:'t1',bookingId:'b1',title:'Resolve cut-off risk',ownerId:null,dueAt:new Date(Date.now()-3600000),status:'Open',slaState:'On Track'};
    const prisma:any={
      task:{
        findUnique:jest.fn().mockResolvedValue(current),
        update:jest.fn().mockImplementation(({data}:any)=>Promise.resolve({...current,...data}))
      }
    };
    const scope:any={assertInternal:jest.fn(),assertBookingAccess:jest.fn()};
    const audit:any={log:jest.fn()};
    const automation:any={processTaskSla:jest.fn().mockResolvedValue({status:'NO_ESCALATION'})};
    return {service:new TasksService(prisma,scope,audit,automation),prisma,scope,audit,automation,current};
  }

  it('reassigns, acknowledges and derives overdue SLA with before/after audit',async()=>{
    const {service,prisma,scope,audit,automation}=make();
    const row:any=await service.update('t1',{ownerId:'ops@ancline.test',status:'Acknowledged'},admin);
    expect(scope.assertInternal).toHaveBeenCalledWith(admin);
    expect(scope.assertBookingAccess).toHaveBeenCalledWith(admin,'b1');
    expect(prisma.task.update).toHaveBeenCalledWith({where:{id:'t1'},data:expect.objectContaining({ownerId:'ops@ancline.test',status:'Acknowledged',slaState:'Overdue'})});
    expect(row.slaState).toBe('Overdue');
    expect(automation.processTaskSla).toHaveBeenCalledWith(expect.objectContaining({id:'t1',slaState:'Overdue'}),admin);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action:'TASK_ACTION_QUEUE_UPDATE',
      detail:expect.objectContaining({before:expect.objectContaining({ownerId:null}),after:expect.objectContaining({ownerId:'ops@ancline.test'})})
    }));
  });

  it('completes through the governed update path and marks SLA met',async()=>{
    const {service,prisma,audit}=make();
    const row:any=await service.complete('t1',admin);
    expect(prisma.task.update).toHaveBeenCalledWith({where:{id:'t1'},data:expect.objectContaining({status:'Completed',slaState:'Met'})});
    expect(row.status).toBe('Completed');
    expect(audit.log).toHaveBeenCalled();
  });

  it('rejects unsupported queue mutations',async()=>{
    const {service,prisma}=make();
    await expect(service.update('t1',{title:'silent rewrite'},admin)).rejects.toThrow('No supported task fields supplied');
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
