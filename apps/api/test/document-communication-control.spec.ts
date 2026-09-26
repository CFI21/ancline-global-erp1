import { DocumentAutomationService } from '../src/modules/document-automation/document-automation.service';

const admin:any={sub:'docs-uat',email:'docs@ancline.invalid',role:'GLOBAL_ADMIN',dataScope:'GLOBAL'};
const scope:any={assertInternal:()=>true,assertBookingAccess:async()=>true};
const audit:any={log:async()=>({ok:true})};

function make(){
  const booking:any={id:'b1',bookingNo:'50001',customerId:'cust1',origin:'NLRTM',destination:'AEJEA',status:'CONFIRMED',customer:{id:'cust1',name:'Test Customer',code:'TC'},containers:[],routingLegs:[],documents:[]};
  const events:any[]=[];
  const documents:any[]=[];
  const prisma:any={
    booking:{
      findMany:async()=>[booking],
      findUnique:async()=>({...booking,documents:[...documents]})
    },
    document:{
      findMany:async({where}:any)=>{
        if(where?.id?.in)return documents.filter(d=>where.id.in.includes(d.id)&&(!where.bookingId||d.bookingId===where.bookingId));
        return [...documents];
      },
      findUnique:async()=>null
    },
    integrationEvent:{
      findMany:async()=>[...events],
      create:async({data}:any)=>{
        const row={id:'e'+(events.length+1),createdAt:new Date(),...data};
        events.push(row);return row;
      }
    }
  };
  return {service:new DocumentAutomationService(prisma,scope,audit),booking,events,documents};
}

describe('CR-014 document communication control',()=>{
  it('marks unreleased or release-blocked documents as BLOCKED',async()=>{
    const {service,documents}=make();
    documents.push(
      {id:'d1',bookingId:'b1',documentNo:'DOC-1',type:'HOUSE_BL',version:1,status:'Draft',releaseControl:'Clear'},
      {id:'d2',bookingId:'b1',documentNo:'DOC-2',type:'MASTER_BL',version:1,status:'Released',releaseControl:'Blocked'}
    );
    const row:any=await service.readiness('b1',admin);
    expect(row.state).toBe('BLOCKED');
    expect(row.reasons.some((x:any)=>x.code==='DOCUMENTS_NOT_RELEASED')).toBe(true);
    expect(row.reasons.some((x:any)=>x.code==='DOCUMENT_RELEASE_BLOCK')).toBe(true);
  });

  it('re-queues FAILED communication without live dispatch and is idempotent by requestId',async()=>{
    const {service,events}=make();
    events.push({
      id:'e0',createdAt:new Date(),sourceSystem:'ANCLINE_DOCUMENT_AUTOMATION',
      objectType:'Communication',objectId:'COM-1',eventType:'COMMUNICATION_CREATED',status:'COMPLETED',
      payload:{communicationId:'COM-1',bookingId:'b1',bookingNo:'50001',channel:'EMAIL',recipients:['ops@example.com'],subject:'Test',message:'Test',status:'FAILED',documentIds:[],retryCount:0}
    });
    const first:any=await service.retryCommunication('COM-1',{requestId:'REQ-1'},admin);
    expect(first.status).toBe('QUEUED');
    expect(first.retryCount).toBe(1);
    expect(first.deliveryMessage).toContain('live provider dispatch remains disabled');

    const duplicate:any=await service.retryCommunication('COM-1',{requestId:'REQ-1'},admin);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.retryCount).toBe(1);
  });

  it('blocks retry when an attached document is not released and clear',async()=>{
    const {service,events,documents}=make();
    documents.push({id:'d1',bookingId:'b1',documentNo:'DOC-1',type:'HOUSE_BL',version:1,status:'Draft',releaseControl:'Clear'});
    events.push({
      id:'e0',createdAt:new Date(),sourceSystem:'ANCLINE_DOCUMENT_AUTOMATION',
      objectType:'Communication',objectId:'COM-2',eventType:'COMMUNICATION_CREATED',status:'COMPLETED',
      payload:{communicationId:'COM-2',bookingId:'b1',bookingNo:'50001',channel:'EMAIL',recipients:['ops@example.com'],subject:'Test',message:'Test',status:'BOUNCED',documentIds:['d1']}
    });
    await expect(service.retryCommunication('COM-2',{requestId:'REQ-2'},admin)).rejects.toThrow('release-control clear');
  });
});
