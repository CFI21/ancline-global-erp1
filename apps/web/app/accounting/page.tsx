'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;customerId:string;origin:string;destination:string;status:string;customer?:{name:string}};
type Org={id:string;code:string;name:string;roles:string[];active?:boolean};
type FinanceLine={id:string;type:'REVENUE'|'COST';chargeCode:string;description?:string;amount:any;finalAmount?:any;currency:string;status:string;taxRate?:any;invoiceReady?:boolean;invoiceNo?:string|null;billingPartyId?:string|null;serviceProviderId?:string|null};
type Invoice={invoiceNo:string;invoiceType:'AR'|'AP';bookingId:string;bookingNo:string;origin?:string;destination?:string;partyId?:string;partyName?:string;currency:string;subtotal:number;taxAmount:number;totalAmount:number;paidAmount:number;balanceAmount:number;issueDate?:string|null;dueDate?:string|null;status:string;daysOverdue:number;lineCount:number;reference?:string|null;notes?:string|null};
type Dashboard={totalInvoices:number;draftCount:number;openARCount:number;openAPCount:number;overdueCount:number;disputedCount:number;paidCount:number;byCurrency:Array<{currency:string;arOutstanding:number;apOutstanding:number;overdueAR:number;overdueAP:number}>;aging:Array<{currency:string;invoiceType:string;current:number;days1to30:number;days31to60:number;days61to90:number;days90plus:number}>};
type ReconciliationRow={bookingId:string;bookingNo:string;customer?:string|null;origin?:string;destination?:string;bookingStatus:string;state:string;closeReady:boolean;invoiceCount:number;financeLineCount:number;financials:Array<{currency:string;revenue:number;cost:number;gp:number;marginPct:number}>;totals:{arTotal:number;arPaid:number;arBalance:number;apTotal:number;apPaid:number;apBalance:number};reasons:Array<{code:string;severity:string;message:string}>;actionHref:string;financeHref:string;accountingHref:string;closeoutHref:string};
type Reconciliation={generatedAt:string;summary:Record<string,number>;rows:ReconciliationRow[]};

function dueIn(days=30){const d=new Date(Date.now()+days*24*60*60*1000);return d.toISOString().slice(0,10);}

export default function AccountingPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [lines,setLines]=useState<FinanceLine[]>([]);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
  const [reconState,setReconState]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [typeFilter,setTypeFilter]=useState('ALL');
  const [form,setForm]=useState({bookingId:'',invoiceType:'AR',partyId:'',dueDate:dueIn(),reference:'',notes:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const [d,i,b,o,r]=await Promise.all([api('/accounting/dashboard',t),api('/accounting/invoices',t),api('/bookings',t),api('/organizations',t),api('/accounting/reconciliation',t)]);
      setDashboard(d||null);setInvoices(Array.isArray(i)?i:[]);setBookings(Array.isArray(b)?b:[]);setOrgs(Array.isArray(o)?o:[]);setReconciliation(r||null);
    }catch(e:any){setMessage(e?.message||'Unable to load accounting control');}
  }

  async function loadLines(bookingId:string,t=token){
    if(!bookingId){setLines([]);return;}
    try{const data=await api(`/finance/booking/${bookingId}`,t);setLines(Array.isArray(data)?data:[]);}catch(e:any){setLines([]);setMessage(e?.message||'Unable to load job charges');}
  }

  async function selectBooking(id:string){
    const booking=bookings.find(b=>b.id===id);
    setForm(x=>({...x,bookingId:id,partyId:x.invoiceType==='AR'?(booking?.customerId||''):''}));
    await loadLines(id);
  }

  function setType(type:string){
    const booking=bookings.find(b=>b.id===form.bookingId);
    setForm(x=>({...x,invoiceType:type,partyId:type==='AR'?(booking?.customerId||''):''}));
  }

  const eligible=useMemo(()=>lines.filter(l=>{
    if(l.invoiceNo||['CANCELLED','DISPUTED'].includes(l.status)) return false;
    if(form.invoiceType==='AR') return l.type==='REVENUE'&&Boolean(l.invoiceReady);
    return l.type==='COST'&&!['PLANNED','WIP'].includes(l.status);
  }),[lines,form.invoiceType]);

  const eligibleTotal=useMemo(()=>eligible.reduce((sum,l)=>{
    const amount=Number((l.finalAmount??l.amount)||0);const tax=amount*Number(l.taxRate||0)/100;return sum+amount+tax;
  },0),[eligible]);
  const eligibleCurrency=eligible[0]?.currency||'USD';
  const selected=bookings.find(b=>b.id===form.bookingId);
  const preferredParties=useMemo(()=>{
    const active=orgs.filter(o=>o.active!==false);
    if(form.invoiceType==='AR') return active.filter(o=>o.roles?.includes('CUSTOMER'));
    const apRoles=['VENDOR','CARRIER','SLOT_PROVIDER','DEPOT','TERMINAL','TRUCKER','BROKER','AGENT'];
    const matches=active.filter(o=>o.roles?.some(r=>apRoles.includes(r)));
    return matches.length?matches:active;
  },[orgs,form.invoiceType]);

  async function createInvoice(){
    if(!form.bookingId){setMessage('Select a booking first.');return;}
    if(!eligible.length){setMessage(form.invoiceType==='AR'?'No invoice-ready revenue lines are available.':'Accrue, post or approve cost lines before creating an AP invoice.');return;}
    if(!form.partyId){setMessage(form.invoiceType==='AR'?'Select the billing party.':'Select the supplier or service provider.');return;}
    setBusy(true);setMessage('');
    try{
      const invoice=await api('/accounting/invoices',token,{method:'POST',body:JSON.stringify({...form,lineIds:eligible.map(l=>l.id)})});
      setMessage(`Invoice ${invoice.invoiceNo} created in DRAFT.`);setForm(x=>({...x,reference:'',notes:'',dueDate:dueIn()}));
      await Promise.all([load(),loadLines(form.bookingId)]);
    }catch(e:any){setMessage(e?.message||'Invoice could not be created.');}finally{setBusy(false);}
  }

  async function post(path:string,body:any,success:string){
    setBusy(true);setMessage('');
    try{await api(path,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});setMessage(success);await Promise.all([load(),form.bookingId?loadLines(form.bookingId):Promise.resolve()]);}
    catch(e:any){setMessage(e?.message||'Accounting action failed.');}finally{setBusy(false);}
  }
  async function issue(i:Invoice){await post(`/accounting/invoices/${encodeURIComponent(i.invoiceNo)}/issue`,undefined,`${i.invoiceNo} issued.`);}
  async function payment(i:Invoice){
    const raw=window.prompt(`Payment amount in ${i.currency}`,String(i.balanceAmount));if(raw===null)return;
    const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0){setMessage('Enter a valid payment amount.');return;}
    const reference=window.prompt('Payment reference (optional)')||'';
    const method=window.prompt('Payment method','BANK_TRANSFER')||'BANK_TRANSFER';
    await post(`/accounting/invoices/${encodeURIComponent(i.invoiceNo)}/payments`,{amount,reference,method},`Payment recorded against ${i.invoiceNo}.`);
  }
  async function dispute(i:Invoice){const reason=window.prompt('Dispute reason');if(!reason)return;await post(`/accounting/invoices/${encodeURIComponent(i.invoiceNo)}/dispute`,{reason},`${i.invoiceNo} marked disputed.`);}
  async function resolve(i:Invoice){const note=window.prompt('Resolution note (optional)')||'';await post(`/accounting/invoices/${encodeURIComponent(i.invoiceNo)}/resolve`,{note},`${i.invoiceNo} dispute resolved.`);}
  async function voidInvoice(i:Invoice){if(!confirm(`Void ${i.invoiceNo}? Its finance lines will become available for re-invoicing.`))return;const reason=window.prompt('Void reason');if(!reason)return;await post(`/accounting/invoices/${encodeURIComponent(i.invoiceNo)}/void`,{reason},`${i.invoiceNo} voided.`);}

  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return invoices.filter(i=>(statusFilter==='ALL'||i.status===statusFilter)&&(typeFilter==='ALL'||i.invoiceType===typeFilter)&&(!q||[i.invoiceNo,i.bookingNo,i.partyName,i.reference,i.origin,i.destination].some(v=>String(v||'').toLowerCase().includes(q))));},[invoices,search,statusFilter,typeFilter]);
  const reconRows=useMemo(()=>{const q=search.trim().toLowerCase();return (reconciliation?.rows||[]).filter(r=>(reconState==='ALL'||r.state===reconState)&&(!q||[r.bookingNo,r.customer,r.origin,r.destination,r.state,...r.reasons.map(x=>x.code)].some(v=>String(v||'').toLowerCase().includes(q))));},[reconciliation,reconState,search]);
  function downloadReconciliation(){
    const rows=reconRows;if(!rows.length){setMessage('No reconciliation rows to export.');return;}
    const csv=['bookingNo,state,bookingStatus,customer,origin,destination,arTotal,arPaid,arBalance,apTotal,apPaid,apBalance,exceptions',...rows.map(r=>[r.bookingNo,r.state,r.bookingStatus,r.customer||'',r.origin||'',r.destination||'',r.totals.arTotal,r.totals.arPaid,r.totals.arBalance,r.totals.apTotal,r.totals.apPaid,r.totals.apBalance,r.reasons.map(x=>x.code+': '+x.message).join(' | ')].map(v=>{const s=String(v??'');return /[\",\n]/.test(s)?'\"'+s.replace(/\"/g,'\"\"')+'\"':s;}).join(','))].join('\n')+'\n';
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ancline-finance-reconciliation.csv';a.click();URL.revokeObjectURL(url);
  }

  return <WorkspaceShell title="AR / AP & Invoicing" subtitle="Receivables, payables, invoice lifecycle, payment allocation and aging control" active="/accounting" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:12,marginBottom:12}}>
      <div className="card"><div className="sub">TOTAL INVOICES</div><div className="kpi">{dashboard?.totalInvoices||0}</div><div className="sub">Draft {dashboard?.draftCount||0}</div></div>
      <div className="card"><div className="sub">OPEN AR</div><div className="kpi">{dashboard?.openARCount||0}</div></div>
      <div className="card"><div className="sub">OPEN AP</div><div className="kpi">{dashboard?.openAPCount||0}</div></div>
      <div className="card"><div className="sub">OVERDUE</div><div className="kpi">{dashboard?.overdueCount||0}</div></div>
      <div className="card"><div className="sub">DISPUTED</div><div className="kpi">{dashboard?.disputedCount||0}</div><div className="sub">Paid {dashboard?.paidCount||0}</div></div>
    </div>

    {(dashboard?.byCurrency.length||0)>0&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Outstanding by Currency</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Currency</th><th>AR Outstanding</th><th>AP Outstanding</th><th>Overdue AR</th><th>Overdue AP</th></tr></thead><tbody>{dashboard?.byCurrency.map(x=><tr key={x.currency}><td><b>{x.currency}</b></td><td>{fmtMoney(x.arOutstanding,x.currency)}</td><td>{fmtMoney(x.apOutstanding,x.currency)}</td><td>{fmtMoney(x.overdueAR,x.currency)}</td><td>{fmtMoney(x.overdueAP,x.currency)}</td></tr>)}</tbody></table></div></div>}

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Create AR / AP Invoice</h3><div style={formGrid}>
      <label><span style={labelStyle}>Job / Booking</span><select style={fieldStyle} value={form.bookingId} onChange={e=>void selectBooking(e.target.value)}><option value="">-- Select booking --</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.customer?.name||''} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Invoice Type</span><select style={fieldStyle} value={form.invoiceType} onChange={e=>setType(e.target.value)}><option value="AR">Accounts Receivable (AR)</option><option value="AP">Accounts Payable (AP)</option></select></label>
      <label><span style={labelStyle}>{form.invoiceType==='AR'?'Billing Party':'Supplier / Provider'}</span><select style={fieldStyle} value={form.partyId} onChange={e=>setForm({...form,partyId:e.target.value})}><option value="">-- Select party --</option>{preferredParties.map(o=><option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}</select></label>
      <label><span style={labelStyle}>Due Date</span><input type="date" style={fieldStyle} value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label>
      <label><span style={labelStyle}>Reference</span><input style={fieldStyle} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="PO / customer / vendor ref"/></label>
      <label><span style={labelStyle}>Notes</span><input style={fieldStyle} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:12}}><div><span className="status">Eligible charges: {eligible.length}</span> {eligible.length>0&&<span className="status">Estimated invoice: {fmtMoney(eligibleTotal,eligibleCurrency)}</span>} {selected&&<span className="sub" style={{marginLeft:8}}>{selected.bookingNo} · {selected.status}</span>}</div><button className="btn" disabled={busy||!eligible.length} onClick={createInvoice}>{busy?'Working…':`Create ${form.invoiceType} Draft`}</button></div>
    {form.bookingId&&<div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Eligible</th><th>Type</th><th>Charge</th><th>Amount</th><th>Tax</th><th>Status</th></tr></thead><tbody>{lines.map(l=>{const ok=eligible.some(x=>x.id===l.id);return <tr key={l.id}><td>{ok?'YES':'-'}</td><td>{l.type}</td><td>{l.chargeCode}<div className="sub">{l.description||''}</div></td><td>{fmtMoney(l.finalAmount??l.amount,l.currency)}</td><td>{Number(l.taxRate||0).toFixed(2)}%</td><td>{l.invoiceNo?<><span className="status">INVOICED</span><div className="sub">{l.invoiceNo}</div></>:<span className="status">{l.status}</span>}</td></tr>})}{lines.length===0&&<tr><td colSpan={6}>No finance charges on this booking.</td></tr>}</tbody></table></div>}
    </div>

    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><div><h3 style={{...sectionTitle,margin:0}}>Finance Reconciliation Control</h3><div className="sub">Derived control state only — no second finance ledger.</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><select style={{...fieldStyle,width:155}} value={reconState} onChange={e=>setReconState(e.target.value)}><option value="ALL">All states</option>{['OPEN','MATCHED','PARTIAL','DISPUTED','BLOCKED','CLOSED'].map(x=><option key={x}>{x}</option>)}</select><button className="btn" onClick={downloadReconciliation}>Download Reconciliation</button></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:8,marginTop:10,marginBottom:10}}>{['jobs','matched','open','partial','disputed','blocked','closed'].map(k=><div className="card" key={k}><div className="sub">{k.toUpperCase()}</div><div className="kpi">{reconciliation?.summary?.[k]||0}</div></div>)}</div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Job</th><th>Customer / Route</th><th>State</th><th>Revenue / Cost / GP</th><th>AR</th><th>AP</th><th>Exceptions</th><th>Actions</th></tr></thead><tbody>{reconRows.map(r=><tr key={r.bookingId}><td><b>{r.bookingNo}</b><div className="sub">{r.bookingStatus}</div></td><td>{r.customer||'-'}<div className="sub">{r.origin||'-'} → {r.destination||'-'}</div></td><td><span className="status">{r.state}</span>{r.closeReady&&<div className="sub">Close ready</div>}</td><td>{r.financials.map(x=><div key={x.currency}>{fmtMoney(x.revenue,x.currency)} / {fmtMoney(x.cost,x.currency)} / <b>{fmtMoney(x.gp,x.currency)}</b> <span className="sub">({x.marginPct.toFixed(1)}%)</span></div>)}</td><td>{fmtMoney(r.totals.arBalance,'')} outstanding<div className="sub">{fmtMoney(r.totals.arPaid,'')} paid</div></td><td>{fmtMoney(r.totals.apBalance,'')} outstanding<div className="sub">{fmtMoney(r.totals.apPaid,'')} paid</div></td><td>{r.reasons.length?r.reasons.map(x=><div key={x.code}><b>{x.code}</b><div className="sub">{x.message}</div></div>):<span className="status">CLEAR</span>}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}><a className="btn" href={r.actionHref}>Job</a><a className="btn" href={r.financeHref}>Finance</a><a className="btn" href={r.accountingHref}>Accounting</a><a className="btn" href={r.closeoutHref}>Closeout</a></div></td></tr>)}{!reconRows.length&&<tr><td colSpan={8}>No reconciliation rows match the current filters.</td></tr>}</tbody></table></div>
    </div>

    {(dashboard?.aging.length||0)>0&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Aging Analysis</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Currency</th><th>Current</th><th>1–30</th><th>31–60</th><th>61–90</th><th>90+</th></tr></thead><tbody>{dashboard?.aging.map((a,idx)=><tr key={`${a.currency}-${a.invoiceType}-${idx}`}><td><b>{a.invoiceType}</b></td><td>{a.currency}</td><td>{fmtMoney(a.current,a.currency)}</td><td>{fmtMoney(a.days1to30,a.currency)}</td><td>{fmtMoney(a.days31to60,a.currency)}</td><td>{fmtMoney(a.days61to90,a.currency)}</td><td>{fmtMoney(a.days90plus,a.currency)}</td></tr>)}</tbody></table></div></div>}

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}><div><h3 style={{margin:0}}>Invoice Register</h3><span className="sub">{visible.length} visible invoices</span></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input style={{...fieldStyle,width:230}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice, job, party..."/><select style={{...fieldStyle,width:145}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="ALL">All types</option><option value="AR">AR</option><option value="AP">AP</option></select><select style={{...fieldStyle,width:155}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{['DRAFT','ISSUED','PART_PAID','PAID','DISPUTED','VOID'].map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Invoice</th><th>Type / Job</th><th>Party</th><th>Issue / Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map(i=><tr key={i.invoiceNo}><td><b>{i.invoiceNo}</b><div className="sub">{i.reference||`${i.lineCount} charge(s)`}</div></td><td><b>{i.invoiceType}</b><div className="sub">{i.bookingNo}</div><div className="sub">{i.origin||'-'} → {i.destination||'-'}</div></td><td>{i.partyName||'-'}</td><td>{i.issueDate?fmtDate(i.issueDate):'Draft'}<div className="sub">Due {fmtDate(i.dueDate)}</div>{i.daysOverdue>0&&<div className="sub">{i.daysOverdue} days overdue</div>}</td><td>{fmtMoney(i.totalAmount,i.currency)}<div className="sub">Tax {fmtMoney(i.taxAmount,i.currency)}</div></td><td>{fmtMoney(i.paidAmount,i.currency)}</td><td><b>{fmtMoney(i.balanceAmount,i.currency)}</b></td><td><span className="status">{i.status}</span></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap',minWidth:210}}>{i.status==='DRAFT'&&<button className="btn" disabled={busy} onClick={()=>issue(i)}>Issue</button>}{['ISSUED','PART_PAID'].includes(i.status)&&<><button className="btn" disabled={busy} onClick={()=>payment(i)}>Payment</button><button className="btn" disabled={busy} onClick={()=>dispute(i)}>Dispute</button></>}{i.status==='DISPUTED'&&<button className="btn" disabled={busy} onClick={()=>resolve(i)}>Resolve</button>}{!['PAID','VOID'].includes(i.status)&&i.paidAmount===0&&<button className="btn" disabled={busy} onClick={()=>voidInvoice(i)}>Void</button>}</div></td></tr>)}{visible.length===0&&<tr><td colSpan={9}>No accounting invoices found.</td></tr>}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}
