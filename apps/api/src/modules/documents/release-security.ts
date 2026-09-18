export async function evaluateReleaseSecurity(db:any,bookingId:string){
  const booking=await db.booking.findUnique({where:{id:bookingId},include:{financeLines:true}});
  if(!booking)return {clear:false,mode:'UNKNOWN',blockers:['Booking not found'],requiredPrepaidPct:0,paidAmount:0,requiredAmount:0,creditStatus:null};
  if(String(booking.businessModel||'NVOCC').toUpperCase()!=='FORWARDING')return {clear:true,mode:'NVOCC_SEPARATE_CONTROL',blockers:[],requiredPrepaidPct:0,paidAmount:0,requiredAmount:0,invoicedAmount:0,revenueAmount:0,creditStatus:booking.creditStatus||null,profileHold:false,freightTerms:booking.freightTerms||null,businessModel:booking.businessModel||'NVOCC'};
  const freightTerms=String(booking.freightTerms||'').toUpperCase();
  const creditEvent=await db.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_CREDIT_CONTROL',objectType:'CreditProfile',objectId:booking.customerId,eventType:'CREDIT_PROFILE_SET'},orderBy:{createdAt:'desc'}});
  const profile:any=creditEvent?.payload||{};
  const customerPaymentMode=String(profile.customerPaymentMode||(freightTerms==='PREPAID'?'PREPAID':'CREDIT')).toUpperCase();
  let requiredPrepaidPct=customerPaymentMode==='PREPAID'?100:Number(profile.prepaidPct||0);
  if(customerPaymentMode==='PARTIAL_PREPAID'&&requiredPrepaidPct<=0)requiredPrepaidPct=Number(profile.prepaidPct||0);
  if(customerPaymentMode==='CREDIT')requiredPrepaidPct=0;
  requiredPrepaidPct=Math.max(0,Math.min(100,requiredPrepaidPct));

  const invoiceEvents:any[]=await db.integrationEvent.findMany({where:{sourceSystem:'ANCLINE_ACCOUNTING',objectType:'FinanceInvoice'},orderBy:{createdAt:'asc'}});
  const grouped=new Map<string,any[]>();
  for(const e of invoiceEvents){if(!grouped.has(e.objectId))grouped.set(e.objectId,[]);grouped.get(e.objectId)!.push(e);}
  let invoicedAmount=0,paidAmount=0;
  for(const events of grouped.values()){
    const created=events.find((e:any)=>e.eventType==='INVOICE_CREATED');
    const p:any=created?.payload||{};
    if(!created||String(p.bookingId||'')!==String(bookingId)||String(p.invoiceType||'AR').toUpperCase()!=='AR')continue;
    invoicedAmount+=Number(p.totalAmount||0);
    paidAmount+=events.filter((e:any)=>e.eventType==='PAYMENT_RECORDED').reduce((s:number,e:any)=>s+Number((e.payload as any)?.amount||0),0);
  }

  const revenueLines=(booking.financeLines||[]).filter((x:any)=>x.type==='REVENUE'&&x.status!=='CANCELLED');
  const revenueAmount=revenueLines.reduce((s:number,x:any)=>s+Number(x.finalAmount??x.amount??0),0);
  const securedByLine=revenueLines.length>0&&revenueLines.every((x:any)=>['PAID','CLEARED'].includes(String(x.status||'').toUpperCase()));
  const baseAmount=invoicedAmount>0?invoicedAmount:revenueAmount;
  const requiredAmount=Math.round(baseAmount*requiredPrepaidPct)/100;
  const paymentClear=requiredPrepaidPct<=0||securedByLine||(requiredAmount>0&&paidAmount+0.005>=requiredAmount);

  const profileHold=Boolean(profile.creditHold)||String(profile.riskRating||'').toUpperCase()==='RESTRICTED';
  const creditClear=String(booking.creditStatus||'').toUpperCase()==='PASSED'&&!profileHold;

  const mode=requiredPrepaidPct>0?(requiredPrepaidPct>=100?'PREPAID':'PARTIAL_PREPAID'):'CREDIT';
  const blockers:string[]=[];
  if(mode==='PREPAID'&&!paymentClear)blockers.push(requiredAmount>0?'Required prepaid amount is not secured ('+paidAmount.toFixed(2)+' / '+requiredAmount.toFixed(2)+')':'Prepaid shipment has no secured customer payment');
  if(mode==='CREDIT'&&!creditClear)blockers.push(profileHold?'Customer credit profile is on hold':'Customer credit/security status is not Passed');
  if(String(booking.status||'').toUpperCase()==='CANCELLED')blockers.push('Booking is cancelled');

  return {clear:blockers.length===0,mode,customerPaymentMode,blockers,requiredPrepaidPct,businessModel:'FORWARDING',bookingChannel:booking.bookingChannel||'INTERNAL',paidAmount:Math.round(paidAmount*100)/100,requiredAmount:Math.round(requiredAmount*100)/100,invoicedAmount:Math.round(invoicedAmount*100)/100,revenueAmount:Math.round(revenueAmount*100)/100,creditStatus:booking.creditStatus||null,profileHold,freightTerms:booking.freightTerms||null};
}
