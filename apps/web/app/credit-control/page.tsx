'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Dashboard={customerCount:number;creditHoldCount:number;reviewCount:number;collectionCount:number;criticalCollectionCount:number;promiseBreachedCount:number;unreconciledBankCount:number;cashByCurrency:Array<{currency:string;unmatchedCredits:number;unmatchedDebits:number}>};
type Profile={creditLimit?:number|null;creditCurrency?:string;paymentTermsDays?:number;overdueHoldDays?:number;riskRating?:string;creditHold?:boolean;holdReason?:string|null;customerPaymentMode?:string;prepaidPct?:number;collectorId?:string|null;notes?:string|null};
type Customer={partyId:string;code:string;name:string;countryCode?:string|null;profile?:Profile|null;decision:string;creditCurrency:string;creditLimit?:number|null;exposure:number;availableCredit?:number|null;maxDaysOverdue:number;openInvoiceCount:number;disputedCount:number;exposures:Array<{currency:string;outstanding:number;overdue:number}>};
type Collection={invoiceNo:string;bookingNo:string;partyId?:string;partyName?:string;currency:string;balanceAmount:number;status:string;daysOverdue:number;priority:string;dueDate?:string|null;promiseBreached:boolean;lastAction?:any};
type Match={id:string;invoiceNo:string;amount:number;currency:string;bankReference:string;createdAt:string};
type BankTx={transactionId:string;bankReference:string;direction:'CREDIT'|'DEBIT';amount:number;currency:string;bookedAt:string;counterparty?:string|null;description?:string|null;account?:string|null;matchedAmount:number;remainingAmount:number;status:string;matches:Match[]};
type Invoice={invoiceNo:string;invoiceType:'AR'|'AP';partyName?:string;currency:string;balanceAmount:number;status:string;bookingNo?:string};

const profileDefault={creditLimit:'',creditCurrency:'USD',paymentTermsDays:'30',overdueHoldDays:'60',riskRating:'MEDIUM',creditHold:false,holdReason:'',customerPaymentMode:'CREDIT',prepaidPct:'0',collectorId:'',notes:''};
const collectionDefault={action:'CONTACTED',promiseDate:'',promisedAmount:'',nextActionDate:'',note:''};
const bankDefault={bankReference:'',direction:'CREDIT',amount:'',currency:'USD',bookedAt:new Date().toISOString().slice(0,10),counterparty:'',description:'',account:''};

export default function CreditControlPage(){
  const [token,setToken]=useState('');
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [collections,setCollections]=useState<Collection[]>([]);
  const [bank,setBank]=useState<BankTx[]>([]);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [selectedCustomer,setSelectedCustomer]=useState('');
  const [selectedCollection,setSelectedCollection]=useState('');
  const [profile,setProfile]=useState({...profileDefault});
  const [collectionForm,setCollectionForm]=useState({...collectionDefault});
  const [bankForm,setBankForm]=useState({...bankDefault});
  const [matchInvoice,setMatchInvoice]=useState<Record<string,string>>({});
  const [matchAmount,setMatchAmount]=useState<Record<string,string>>({});
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState<'credit'|'collections'|'bank'>('credit');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void refresh(t);},[]);

  async function refresh(t=token){
    try{
      const [d,c,q,b,i]=await Promise.all([
        api('/credit-control/dashboard',t),api('/credit-control/customers',t),api('/credit-control/collections',t),api('/credit-control/bank-transactions',t),api('/accounting/invoices',t)
      ]);
      setDashboard(d||null);setCustomers(Array.isArray(c)?c:[]);setCollections(Array.isArray(q)?q:[]);setBank(Array.isArray(b)?b:[]);setInvoices(Array.isArray(i)?i:[]);
      const arr=Array.isArray(c)?c:[];
      if(!selectedCustomer&&arr[0]) chooseCustomer(arr[0]);
      const queue=Array.isArray(q)?q:[];
      if(!selectedCollection&&queue[0]) setSelectedCollection(queue[0].invoiceNo);
    }catch(e:any){setMessage(e.message||'Unable to load credit control.');}
  }

  function chooseCustomer(row:Customer){
    setSelectedCustomer(row.partyId);
    const p=row.profile||{};
    setProfile({
      creditLimit:p.creditLimit==null?'':String(p.creditLimit),creditCurrency:p.creditCurrency||row.creditCurrency||'USD',
      paymentTermsDays:String(p.paymentTermsDays??30),overdueHoldDays:String(p.overdueHoldDays??60),riskRating:p.riskRating||'MEDIUM',
      creditHold:Boolean(p.creditHold),holdReason:p.holdReason||'',customerPaymentMode:p.customerPaymentMode||'CREDIT',prepaidPct:String(p.prepaidPct??(p.customerPaymentMode==='PREPAID'?100:0)),collectorId:p.collectorId||'',notes:p.notes||''
    });
  }

  async function run(path:string,body:any|undefined,success:string){
    setBusy(true);setMessage('');
    try{
      const result=await api(path,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});
      setMessage(success||result?.message||'Updated.');await refresh();return result;
    }catch(e:any){setMessage(e.message||'Action failed.');return null;}finally{setBusy(false);}
  }

  async function saveProfile(){
    if(!selectedCustomer){setMessage('Select a customer.');return;}
    await run(`/credit-control/customers/${selectedCustomer}/profile`,{
      ...profile,creditLimit:profile.creditLimit===''?null:Number(profile.creditLimit),paymentTermsDays:Number(profile.paymentTermsDays),overdueHoldDays:Number(profile.overdueHoldDays),prepaidPct:Number(profile.prepaidPct||0)
    },'Credit profile saved.');
  }

  async function applyBookings(){
    if(!selectedCustomer)return;
    const result=await run(`/credit-control/customers/${selectedCustomer}/apply-bookings`,undefined,'Credit decision applied to open bookings.');
    if(result) setMessage(`Credit decision ${result.decision}: ${result.updatedBookings} open booking(s) updated to ${result.creditStatus}.`);
  }

  async function addCollectionAction(){
    if(!selectedCollection){setMessage('Select an invoice from the collection queue.');return;}
    await run(`/credit-control/collections/${encodeURIComponent(selectedCollection)}/action`,{
      ...collectionForm,promisedAmount:collectionForm.promisedAmount?Number(collectionForm.promisedAmount):null
    },'Collection action recorded.');
    setCollectionForm({...collectionDefault});
  }

  async function importBank(){
    if(!bankForm.bankReference.trim()||!bankForm.amount){setMessage('Bank reference and amount are required.');return;}
    await run('/credit-control/bank-transactions',{...bankForm,amount:Number(bankForm.amount)},'Bank transaction imported.');
    setBankForm({...bankDefault,bookedAt:new Date().toISOString().slice(0,10)});
  }

  async function match(tx:BankTx){
    const invoiceNo=matchInvoice[tx.transactionId];
    if(!invoiceNo){setMessage('Select an invoice to match.');return;}
    const amount=matchAmount[tx.transactionId];
    await run(`/credit-control/bank-transactions/${tx.transactionId}/match`,{invoiceNo,amount:amount?Number(amount):undefined},'Bank transaction matched to invoice.');
    setMatchInvoice(x=>({...x,[tx.transactionId]:''}));setMatchAmount(x=>({...x,[tx.transactionId]:''}));
  }

  async function autoMatch(tx:BankTx){
    setBusy(true);setMessage('');
    try{
      const result=await api(`/credit-control/bank-transactions/${tx.transactionId}/auto-match`,token,{method:'POST'});
      if(result?.matched) setMessage(`Auto-matched ${tx.bankReference} to ${result.invoiceNo}.`);
      else setMessage(result?.reason||'No confident automatic match found.');
      await refresh();
    }catch(e:any){setMessage(e.message||'Auto-match failed.');}finally{setBusy(false);}
  }

  async function unmatch(tx:BankTx,m:Match){
    await run(`/credit-control/bank-transactions/${tx.transactionId}/unmatch/${m.id}`,undefined,`Match to ${m.invoiceNo} reversed.`);
  }

  const selectedCustomerRow=customers.find(x=>x.partyId===selectedCustomer);
  const selectedCollectionRow=collections.find(x=>x.invoiceNo===selectedCollection);
  const critical=dashboard?.criticalCollectionCount||0;
  const holds=dashboard?.creditHoldCount||0;
  const unreconciled=dashboard?.unreconciledBankCount||0;
  const openInvoices=useMemo(()=>invoices.filter(i=>['ISSUED','PART_PAID'].includes(i.status)&&Number(i.balanceAmount)>0),[invoices]);

  return <WorkspaceShell title="Credit Control / Collections / Cash" subtitle="Customer credit exposure, booking credit gates, debt collection and bank reconciliation" active="/credit-control" actions={<button className="btn" disabled={busy} onClick={()=>void refresh()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">CUSTOMERS</div><div className="kpi">{dashboard?.customerCount||0}</div></div>
      <div className="card"><div className="sub">CREDIT HOLDS / BREACHES</div><div className="kpi">{holds}</div></div>
      <div className="card"><div className="sub">COLLECTION QUEUE</div><div className="kpi">{dashboard?.collectionCount||0}</div><div className="sub">{critical} critical</div></div>
      <div className="card"><div className="sub">UNRECONCILED BANK ITEMS</div><div className="kpi">{unreconciled}</div></div>
    </div>

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <button className="btn" onClick={()=>setTab('credit')} disabled={tab==='credit'}>Credit Control</button>
      <button className="btn" onClick={()=>setTab('collections')} disabled={tab==='collections'}>Collections</button>
      <button className="btn" onClick={()=>setTab('bank')} disabled={tab==='bank'}>Cash / Bank Reconciliation</button>
      <span className="status">Promises breached: {dashboard?.promiseBreachedCount||0}</span>
      <span className="status">Credit reviews: {dashboard?.reviewCount||0}</span>
    </div>

    {tab==='credit'&&<>
      <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Customer Credit Profile</h3>
        <div style={formGrid}>
          <label><span style={labelStyle}>Customer</span><select style={fieldStyle} value={selectedCustomer} onChange={e=>{const row=customers.find(x=>x.partyId===e.target.value);if(row)chooseCustomer(row);}}><option value="">Select customer</option>{customers.map(c=><option key={c.partyId} value={c.partyId}>{c.code} · {c.name}</option>)}</select></label>
          <label><span style={labelStyle}>Credit Limit</span><input type="number" step="0.01" style={fieldStyle} value={profile.creditLimit} onChange={e=>setProfile({...profile,creditLimit:e.target.value})} placeholder="Leave blank for review"/></label>
          <label><span style={labelStyle}>Credit Currency</span><select style={fieldStyle} value={profile.creditCurrency} onChange={e=>setProfile({...profile,creditCurrency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label><span style={labelStyle}>Payment Terms (days)</span><input type="number" style={fieldStyle} value={profile.paymentTermsDays} onChange={e=>setProfile({...profile,paymentTermsDays:e.target.value})}/></label>
          <label><span style={labelStyle}>Customer Payment Mode</span><select style={fieldStyle} value={profile.customerPaymentMode} onChange={e=>setProfile({...profile,customerPaymentMode:e.target.value,prepaidPct:e.target.value==='PREPAID'?'100':e.target.value==='CREDIT'?'0':profile.prepaidPct})}><option value="CREDIT">CREDIT</option><option value="PREPAID">PREPAID 100%</option><option value="PARTIAL_PREPAID">PARTIAL PREPAID</option></select></label>
          <label><span style={labelStyle}>Customer Prepaid %</span><input type="number" min="0" max="100" style={fieldStyle} value={profile.prepaidPct} onChange={e=>setProfile({...profile,prepaidPct:e.target.value})} disabled={profile.customerPaymentMode!=='PARTIAL_PREPAID'}/></label>
          <label><span style={labelStyle}>Overdue Hold Threshold</span><input type="number" style={fieldStyle} value={profile.overdueHoldDays} onChange={e=>setProfile({...profile,overdueHoldDays:e.target.value})}/></label>
          <label><span style={labelStyle}>Risk Rating</span><select style={fieldStyle} value={profile.riskRating} onChange={e=>setProfile({...profile,riskRating:e.target.value})}>{['LOW','MEDIUM','HIGH','RESTRICTED'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label><span style={labelStyle}>Collector / Owner</span><input style={fieldStyle} value={profile.collectorId} onChange={e=>setProfile({...profile,collectorId:e.target.value})} placeholder="Finance owner"/></label>
          <label><span style={labelStyle}>Manual Credit Hold</span><select style={fieldStyle} value={profile.creditHold?'YES':'NO'} onChange={e=>setProfile({...profile,creditHold:e.target.value==='YES'})}><option>NO</option><option>YES</option></select></label>
          <label><span style={labelStyle}>Hold Reason</span><input style={fieldStyle} value={profile.holdReason} onChange={e=>setProfile({...profile,holdReason:e.target.value})} disabled={!profile.creditHold}/></label>
          <label style={{gridColumn:'1 / -1'}}><span style={labelStyle}>Credit Notes</span><input style={fieldStyle} value={profile.notes} onChange={e=>setProfile({...profile,notes:e.target.value})}/></label>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap',marginTop:12}}>
          {selectedCustomerRow&&<span className="status">Decision: {selectedCustomerRow.decision}</span>}
          <button className="btn" disabled={busy||!selectedCustomer} onClick={saveProfile}>Save Credit Profile</button>
          <button className="btn" disabled={busy||!selectedCustomer} onClick={applyBookings}>Apply Decision to Open Bookings</button>
        </div>
      </div>

      {selectedCustomerRow&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Selected Customer Exposure</h3><div className="grid">
        <div><div className="sub">DECISION</div><div className="kpi" style={{fontSize:18}}>{selectedCustomerRow.decision}</div></div>
        <div><div className="sub">EXPOSURE · {selectedCustomerRow.creditCurrency}</div><div className="kpi" style={{fontSize:18}}>{fmtMoney(selectedCustomerRow.exposure,selectedCustomerRow.creditCurrency)}</div></div>
        <div><div className="sub">LIMIT</div><div className="kpi" style={{fontSize:18}}>{selectedCustomerRow.creditLimit==null?'Not set':fmtMoney(selectedCustomerRow.creditLimit,selectedCustomerRow.creditCurrency)}</div></div>
        <div><div className="sub">AVAILABLE</div><div className="kpi" style={{fontSize:18}}>{selectedCustomerRow.availableCredit==null?'Review':fmtMoney(selectedCustomerRow.availableCredit,selectedCustomerRow.creditCurrency)}</div></div>
        <div><div className="sub">MAX OVERDUE</div><div className="kpi" style={{fontSize:18}}>{selectedCustomerRow.maxDaysOverdue}d</div></div>
      </div></div>}

      <div className="card"><h3 style={sectionTitle}>Customer Credit Register</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Customer</th><th>Decision</th><th>Limit / Exposure</th><th>Available</th><th>Open AR</th><th>Overdue</th><th>Currency Exposure</th><th>Action</th></tr></thead><tbody>
        {customers.map(c=><tr key={c.partyId}><td><b>{c.code}</b><div>{c.name}</div><div className="sub">{c.countryCode||'-'}</div></td><td><span className="status">{c.decision}</span><div className="sub">Risk {c.profile?.riskRating||'Not rated'} · {c.profile?.customerPaymentMode||'CREDIT'}{c.profile?.prepaidPct?` ${c.profile.prepaidPct}%`:''}</div></td><td>{c.creditLimit==null?'No limit':fmtMoney(c.creditLimit,c.creditCurrency)}<div className="sub">Exposure {fmtMoney(c.exposure,c.creditCurrency)}</div></td><td>{c.availableCredit==null?'-':fmtMoney(c.availableCredit,c.creditCurrency)}</td><td>{c.openInvoiceCount}<div className="sub">{c.disputedCount} disputed</div></td><td>{c.maxDaysOverdue}d</td><td>{c.exposures.length?c.exposures.map(x=><div key={x.currency}>{x.currency}: {fmtMoney(x.outstanding,x.currency)} <span className="sub">({fmtMoney(x.overdue,x.currency)} overdue)</span></div>):'-'}</td><td><button className="btn" onClick={()=>chooseCustomer(c)}>Open</button></td></tr>)}
        {customers.length===0&&<tr><td colSpan={8}>No customer organizations found.</td></tr>}
      </tbody></table></div></div>
    </>}

    {tab==='collections'&&<>
      <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Collection Action</h3><div style={formGrid}>
        <label><span style={labelStyle}>Invoice</span><select style={fieldStyle} value={selectedCollection} onChange={e=>setSelectedCollection(e.target.value)}><option value="">Select invoice</option>{collections.map(c=><option key={c.invoiceNo} value={c.invoiceNo}>{c.invoiceNo} · {c.partyName||'-'} · {fmtMoney(c.balanceAmount,c.currency)}</option>)}</select></label>
        <label><span style={labelStyle}>Action</span><select style={fieldStyle} value={collectionForm.action} onChange={e=>setCollectionForm({...collectionForm,action:e.target.value})}>{['CONTACTED','PROMISE_TO_PAY','ESCALATED','DISPUTE_FOLLOWUP','NOTE'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Promise Date</span><input type="date" style={fieldStyle} value={collectionForm.promiseDate} onChange={e=>setCollectionForm({...collectionForm,promiseDate:e.target.value})} disabled={collectionForm.action!=='PROMISE_TO_PAY'}/></label>
        <label><span style={labelStyle}>Promised Amount</span><input type="number" step="0.01" style={fieldStyle} value={collectionForm.promisedAmount} onChange={e=>setCollectionForm({...collectionForm,promisedAmount:e.target.value})} disabled={collectionForm.action!=='PROMISE_TO_PAY'}/></label>
        <label><span style={labelStyle}>Next Action Date</span><input type="date" style={fieldStyle} value={collectionForm.nextActionDate} onChange={e=>setCollectionForm({...collectionForm,nextActionDate:e.target.value})}/></label>
        <label style={{gridColumn:'1 / -1'}}><span style={labelStyle}>Note</span><input style={fieldStyle} value={collectionForm.note} onChange={e=>setCollectionForm({...collectionForm,note:e.target.value})} placeholder="Call result, escalation reason, dispute follow-up..."/></label>
      </div><div style={{display:'flex',gap:8,justifyContent:'flex-end',alignItems:'center',marginTop:12}}>{selectedCollectionRow&&<span className="status">{selectedCollectionRow.priority} · {selectedCollectionRow.daysOverdue} days overdue</span>}<button className="btn" disabled={busy||!selectedCollection} onClick={addCollectionAction}>Record Action</button></div></div>

      <div className="card"><h3 style={sectionTitle}>AR Collection Queue</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Priority</th><th>Invoice</th><th>Customer</th><th>Booking</th><th>Balance</th><th>Due / Overdue</th><th>Status</th><th>Last Action</th><th>Promise</th><th>Action</th></tr></thead><tbody>
        {collections.map(c=><tr key={c.invoiceNo}><td><span className="status">{c.priority}</span>{c.promiseBreached&&<div className="sub">PROMISE BREACHED</div>}</td><td><b>{c.invoiceNo}</b></td><td>{c.partyName||'-'}</td><td>{c.bookingNo||'-'}</td><td>{fmtMoney(c.balanceAmount,c.currency)}</td><td>{fmtDate(c.dueDate)}<div className="sub">{c.daysOverdue} days</div></td><td><span className="status">{c.status}</span></td><td>{c.lastAction?.action||'UNTOUCHED'}<div className="sub">{c.lastAction?.note||'-'}</div></td><td>{c.lastAction?.promiseDate?fmtDate(c.lastAction.promiseDate):'-'}{c.lastAction?.promisedAmount&&<div className="sub">{fmtMoney(c.lastAction.promisedAmount,c.currency)}</div>}</td><td><button className="btn" onClick={()=>{setSelectedCollection(c.invoiceNo);setCollectionForm({...collectionDefault});}}>Work</button></td></tr>)}
        {collections.length===0&&<tr><td colSpan={10}>No open AR invoices in the collection queue.</td></tr>}
      </tbody></table></div></div>
    </>}

    {tab==='bank'&&<>
      <div className="grid" style={{marginBottom:12}}>{dashboard?.cashByCurrency?.map(x=><div className="card" key={x.currency}><div className="sub">UNRECONCILED · {x.currency}</div><div>Credits: <b>{fmtMoney(x.unmatchedCredits,x.currency)}</b></div><div>Debits: <b>{fmtMoney(x.unmatchedDebits,x.currency)}</b></div></div>)}</div>

      <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Import Bank Statement Item</h3><div style={formGrid}>
        <label><span style={labelStyle}>Bank Reference *</span><input style={fieldStyle} value={bankForm.bankReference} onChange={e=>setBankForm({...bankForm,bankReference:e.target.value})}/></label>
        <label><span style={labelStyle}>Direction</span><select style={fieldStyle} value={bankForm.direction} onChange={e=>setBankForm({...bankForm,direction:e.target.value})}><option>CREDIT</option><option>DEBIT</option></select></label>
        <label><span style={labelStyle}>Amount *</span><input type="number" step="0.01" style={fieldStyle} value={bankForm.amount} onChange={e=>setBankForm({...bankForm,amount:e.target.value})}/></label>
        <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={bankForm.currency} onChange={e=>setBankForm({...bankForm,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Booked Date</span><input type="date" style={fieldStyle} value={bankForm.bookedAt} onChange={e=>setBankForm({...bankForm,bookedAt:e.target.value})}/></label>
        <label><span style={labelStyle}>Counterparty</span><input style={fieldStyle} value={bankForm.counterparty} onChange={e=>setBankForm({...bankForm,counterparty:e.target.value})}/></label>
        <label><span style={labelStyle}>Bank Account</span><input style={fieldStyle} value={bankForm.account} onChange={e=>setBankForm({...bankForm,account:e.target.value})} placeholder="Account name / masked IBAN"/></label>
        <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={bankForm.description} onChange={e=>setBankForm({...bankForm,description:e.target.value})}/></label>
      </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={importBank}>Import Bank Item</button></div></div>

      <div className="card"><h3 style={sectionTitle}>Bank Reconciliation Register</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booked</th><th>Reference / Counterparty</th><th>Direction</th><th>Amount</th><th>Matched / Remaining</th><th>Status</th><th>Invoice Match</th><th>Matches</th></tr></thead><tbody>
        {bank.map(tx=>{
          const expected=tx.direction==='CREDIT'?'AR':'AP';
          const eligible=openInvoices.filter(i=>i.invoiceType===expected&&i.currency===tx.currency);
          return <tr key={tx.transactionId}><td>{fmtDate(tx.bookedAt)}<div className="sub">{tx.account||'-'}</div></td><td><b>{tx.bankReference}</b><div>{tx.counterparty||'-'}</div><div className="sub">{tx.description||'-'}</div></td><td><span className="status">{tx.direction}</span></td><td>{fmtMoney(tx.amount,tx.currency)}</td><td>{fmtMoney(tx.matchedAmount,tx.currency)}<div className="sub">Remaining {fmtMoney(tx.remainingAmount,tx.currency)}</div></td><td><span className="status">{tx.status}</span></td><td>{tx.status!=='MATCHED'?<div style={{minWidth:260}}>
            <select style={{...fieldStyle,marginBottom:5}} value={matchInvoice[tx.transactionId]||''} onChange={e=>setMatchInvoice(x=>({...x,[tx.transactionId]:e.target.value}))}><option value="">Select {expected} invoice</option>{eligible.map(i=><option key={i.invoiceNo} value={i.invoiceNo}>{i.invoiceNo} · {i.partyName||'-'} · {fmtMoney(i.balanceAmount,i.currency)}</option>)}</select>
            <div style={{display:'flex',gap:5}}><input type="number" step="0.01" style={{...fieldStyle,minWidth:90}} placeholder={`max ${tx.remainingAmount}`} value={matchAmount[tx.transactionId]||''} onChange={e=>setMatchAmount(x=>({...x,[tx.transactionId]:e.target.value}))}/><button className="btn" disabled={busy} onClick={()=>match(tx)}>Match</button><button className="btn" disabled={busy} onClick={()=>autoMatch(tx)}>Auto</button></div>
          </div>:'Fully reconciled'}</td><td>{tx.matches.length?tx.matches.map(m=><div key={m.id} style={{marginBottom:6}}><b>{m.invoiceNo}</b> · {fmtMoney(m.amount,m.currency)} <button className="btn" disabled={busy} onClick={()=>unmatch(tx,m)}>Reverse</button></div>):'-'}</td></tr>;
        })}
        {bank.length===0&&<tr><td colSpan={8}>No bank statement items imported.</td></tr>}
      </tbody></table></div></div>
    </>}
  </WorkspaceShell>;
}
