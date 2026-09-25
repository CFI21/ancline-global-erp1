import { AccountingService } from '../src/modules/accounting/accounting.service';
import { OperationsService } from '../src/modules/operations/operations.service';

const user:any={sub:'finance-uat',email:'finance@ancline.invalid',role:'GLOBAL_ADMIN',dataScope:'GLOBAL'};
const scope:any={
  assertFinanceAccess:()=>true,
  assertInternal:()=>true,
  assertBookingAccess:async()=>true
};
const audit:any={log:async()=>({ok:true})};
const alerts:any={scan:async()=>({})};

function invoiceEvents(bookingId:string,invoiceNo:string,total:number,paid:number,status:'ISSUED'|'DISPUTED'='ISSUED'){
  const now=new Date();
  const rows:any[]=[
    {id:'c-'+invoiceNo,sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice',objectId:invoiceNo,eventType:'INVOICE_CREATED',createdAt:now,payload:{invoiceNo,invoiceType:'AR',bookingId,bookingNo:'50001',currency:'USD',totalAmount:total,subtotal:total,taxAmount:0,lines:[]}},
    {id:'i-'+invoiceNo,sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice',objectId:invoiceNo,eventType:'INVOICE_ISSUED',createdAt:now,payload:{invoiceNo}}
  ];
  if(paid>0)rows.push({id:'p-'+invoiceNo,sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice',objectId:invoiceNo,eventType:'PAYMENT_RECORDED',createdAt:now,payload:{invoiceNo,amount:paid,currency:'USD',method:'BANK_TRANSFER',reference:'PAY-'+invoiceNo}});
  if(status==='DISPUTED')rows.push({id:'d-'+invoiceNo,sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice',objectId:invoiceNo,eventType:'INVOICE_DISPUTED',createdAt:now,payload:{invoiceNo,reason:'Synthetic dispute'}});
  return rows;
}

describe('CR-013 finance reconciliation control',()=>{
  it('classifies outstanding balances as OPEN and blocks financial close',async()=>{
    const booking:any={id:'b1',bookingNo:'50001',status:'COMPLETED',origin:'NLRTM',destination:'AEJEA',currency:'USD',customer:{id:'c1',name:'Test Customer',code:'TC'}};
    const lines:any[]=[
      {id:'r1',bookingId:'b1',type:'REVENUE',amount:1200,finalAmount:1200,currency:'USD',status:'FINAL',invoiceNo:'AR-1'},
      {id:'c1',bookingId:'b1',type:'COST',amount:900,finalAmount:900,currency:'USD',status:'FINAL',invoiceNo:'AP-1'}
    ];
    const events=[...invoiceEvents('b1','AR-1',1200,600),...invoiceEvents('b1','AP-1',900,900)];
    const prisma:any={
      booking:{findMany:async()=>[booking],findUnique:async()=>booking,update:async({data}:any)=>({...booking,...data})},
      financeLine:{findMany:async()=>lines},
      integrationEvent:{findMany:async()=>events},
      jobCloseoutChecklist:{findMany:async()=>[{id:'x1',bookingId:'b1',itemCode:'OPS_COMPLETE',itemLabel:'Ops',mandatory:true,completed:true}],createMany:async()=>({count:0})},
      task:{findMany:async()=>[]},
      approval:{findMany:async()=>[]}
    };
    const accounting=new AccountingService(prisma,scope,audit);
    const dashboard:any=await accounting.reconciliation(user);
    expect(dashboard.rows[0].state).toBe('PARTIAL');
    expect(dashboard.rows[0].totals.arBalance).toBe(600);
    expect(dashboard.rows[0].reasons.some((x:any)=>x.code==='OUTSTANDING_INVOICE_BALANCE')).toBe(true);

    const operations=new OperationsService(prisma,scope,audit,alerts);
    const readiness:any=await operations.closeoutReadiness('b1',user);
    expect(readiness.ready).toBe(false);
    expect(readiness.financeBlockers.some((x:any)=>x.code==='OUTSTANDING_INVOICE_BALANCE')).toBe(true);
    await expect(operations.finalizeCloseout('b1',user)).rejects.toThrow('OUTSTANDING_INVOICE_BALANCE');
  });

  it('allows closeout only after finance lines and invoice balances reconcile',async()=>{
    const booking:any={id:'b2',bookingNo:'50002',status:'COMPLETED',origin:'SGSIN',destination:'NLRTM',currency:'USD',customer:{id:'c2',name:'Matched Customer',code:'MC'}};
    const lines:any[]=[
      {id:'r2',bookingId:'b2',type:'REVENUE',amount:1500,finalAmount:1500,currency:'USD',status:'FINAL',invoiceNo:'AR-2'},
      {id:'c2',bookingId:'b2',type:'COST',amount:1000,finalAmount:1000,currency:'USD',status:'PAID',invoiceNo:'AP-2'}
    ];
    const events=[...invoiceEvents('b2','AR-2',1500,1500),...invoiceEvents('b2','AP-2',1000,1000)];
    let saved={...booking};
    const prisma:any={
      booking:{findMany:async()=>[saved],findUnique:async()=>saved,update:async({data}:any)=>(saved={...saved,...data})},
      financeLine:{findMany:async()=>lines},
      integrationEvent:{findMany:async()=>events},
      jobCloseoutChecklist:{findMany:async()=>[
        {id:'x1',bookingId:'b2',itemCode:'OPS_COMPLETE',itemLabel:'Ops',mandatory:true,completed:true},
        {id:'x2',bookingId:'b2',itemCode:'REVENUE_FINAL',itemLabel:'Revenue',mandatory:true,completed:true}
      ],createMany:async()=>({count:0})},
      task:{findMany:async()=>[]},
      approval:{findMany:async()=>[]}
    };
    const accounting=new AccountingService(prisma,scope,audit);
    const row:any=(await accounting.reconciliation(user)).rows[0];
    expect(row.state).toBe('MATCHED');
    expect(row.closeReady).toBe(true);
    expect(row.financials[0].gp).toBe(500);

    const operations=new OperationsService(prisma,scope,audit,alerts);
    expect((await operations.closeoutReadiness('b2',user)).ready).toBe(true);
    const closed:any=await operations.finalizeCloseout('b2',user);
    expect(closed.status).toBe('FINANCIALLY_CLOSED');
  });

  it('blocks disputed invoices and unresolved finance lines',async()=>{
    const booking:any={id:'b3',bookingNo:'50003',status:'COMPLETED',currency:'USD',customer:{id:'c3',name:'Disputed Customer',code:'DC'}};
    const lines:any[]=[
      {id:'r3',bookingId:'b3',type:'REVENUE',amount:1000,currency:'USD',status:'DISPUTED',invoiceNo:'AR-3'},
      {id:'c3',bookingId:'b3',type:'COST',amount:700,currency:'USD',status:'FINAL',invoiceNo:'AP-3'}
    ];
    const events=[...invoiceEvents('b3','AR-3',1000,0,'DISPUTED'),...invoiceEvents('b3','AP-3',700,700)];
    const prisma:any={
      booking:{findMany:async()=>[booking]},
      financeLine:{findMany:async()=>lines},
      integrationEvent:{findMany:async()=>events}
    };
    const accounting=new AccountingService(prisma,scope,audit);
    const row:any=(await accounting.reconciliation(user)).rows[0];
    expect(row.state).toBe('DISPUTED');
    expect(row.reasons.some((x:any)=>x.code==='DISPUTED_INVOICES')).toBe(true);
    expect(row.reasons.some((x:any)=>x.code==='FINANCE_LINES_OPEN')).toBe(true);
  });
});
