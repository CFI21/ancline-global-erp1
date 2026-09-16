'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

const periodNow=()=>new Date().toISOString().slice(0,7);
const blankLine=(n=1)=>({lineId:`L${n}`,chargeCode:'OCEAN_FREIGHT',description:'',expenseAccount:'5000-DIRECT-COST',quantity:1,unitRate:'',taxRate:0});

export default function ProcurementPage(){
  const [token,setToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [dashboard,setDashboard]=useState<any>({});
  const [vendors,setVendors]=useState<any[]>([]);
  const [bookings,setBookings]=useState<any[]>([]);
  const [pos,setPos]=useState<any[]>([]);
  const [matches,setMatches]=useState<any[]>([]);
  const [period,setPeriod]=useState(periodNow());
  const [spend,setSpend]=useState<any>({});
  const [form,setForm]=useState<any>({bookingId:'',vendorId:'',currency:'USD',expectedDate:'',tolerancePct:2,budgetPolicy:'WARN',reference:'',notes:'',lines:[blankLine()]});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,periodNow());},[]);
  async function load(t=token,p=period){if(!t)return;setBusy(true);setMessage('');try{const [d,v,b,po,m,s]=await Promise.all([api('/procurement/dashboard',t),api('/procurement/vendors',t),api('/procurement/bookings',t),api('/procurement/purchase-orders',t),api('/procurement/ap-matches',t),api(`/procurement/spend-analysis?period=${encodeURIComponent(p)}`,t)]);setDashboard(d||{});setVendors(Array.isArray(v)?v:[]);setBookings(Array.isArray(b)?b:[]);setPos(Array.isArray(po)?po:[]);setMatches(Array.isArray(m)?m:[]);setSpend(s||{});}catch(err:any){setMessage(err.message||'Unable to load procurement.');}finally{setBusy(false);}}
  async function post(path:string,body:any,success:string){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body)});setMessage(success);await load();}catch(err:any){setMessage(err.message||'Procurement action failed.');}finally{setBusy(false);}}

  function patchLine(i:number,key:string,value:any){setForm({...form,lines:form.lines.map((l:any,n:number)=>n===i?{...l,[key]:value}:l)});}
  function addLine(){setForm({...form,lines:[...form.lines,blankLine(form.lines.length+1)]});}
  function removeLine(i:number){if(form.lines.length===1)return;setForm({...form,lines:form.lines.filter((_:any,n:number)=>n!==i)});}
  function pickBooking(id:string){const b=bookings.find((x:any)=>x.id===id);setForm({...form,bookingId:id,currency:b?.currency||form.currency});}
  async function create(){if(!form.bookingId||!form.vendorId){setMessage('Booking and vendor are required.');return;}await post('/procurement/purchase-orders',{...form,lines:form.lines.map((l:any)=>({...l,quantity:Number(l.quantity),unitRate:Number(l.unitRate),taxRate:Number(l.taxRate)}))},'Purchase order created.');setForm({bookingId:'',vendorId:'',currency:'USD',expectedDate:'',tolerancePct:2,budgetPolicy:'WARN',reference:'',notes:'',lines:[blankLine()]});}
  async function budget(po:any){setBusy(true);setMessage('');try{const r=await api(`/procurement/purchase-orders/${encodeURIComponent(po.poNo)}/budget-check`,token);const detail=(r.lines||[]).map((x:any)=>`${x.account}: ${x.status}${x.remaining==null?'':` · remaining ${fmtMoney(x.remaining,x.currency)}`}`).join(' | ');setMessage(`Budget ${r.status}. ${detail}`);}catch(err:any){setMessage(err.message||'Budget check failed.');}finally{setBusy(false);}}
  async function receiveBalance(po:any){const items=(po.lines||[]).filter((l:any)=>Number(l.remainingQuantity)>0).map((l:any)=>({lineId:l.lineId,quantity:Number(l.remainingQuantity)}));if(!items.length){setMessage('Nothing remains to receive.');return;}const ref=window.prompt('Receipt / service confirmation reference','')||'';await post(`/procurement/purchase-orders/${encodeURIComponent(po.poNo)}/receive`,{items,receiptReference:ref,receivedAt:new Date().toISOString()},`${po.poNo} receipt recorded.`);}
  async function cancel(po:any){const reason=window.prompt(`Cancellation reason for ${po.poNo}`,'');if(!reason)return;await post(`/procurement/purchase-orders/${encodeURIComponent(po.poNo)}/cancel`,{reason},`${po.poNo} cancelled.`);}
  async function override(m:any){const reason=window.prompt(`Override AP match exception for ${m.invoiceNo}`,'');if(!reason)return;await post(`/procurement/ap-matches/${encodeURIComponent(m.invoiceNo)}/override`,{reason},`${m.invoiceNo} match exception overridden.`);}

  return <WorkspaceShell title="Procurement / Vendor Spend" subtitle="Purchase orders, job-cost commitments, receipts, budget control and AP three-way matching" active="/procurement" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">PURCHASE ORDERS</div><div className="kpi">{dashboard.poCount||0}</div></div>
      <div className="card"><div className="sub">AWAITING APPROVAL</div><div className="kpi">{dashboard.awaitingApproval||0}</div></div>
      <div className="card"><div className="sub">OPEN COMMITMENTS</div><div className="kpi">{dashboard.openCommitments||0}</div></div>
      <div className="card"><div className="sub">RECEIVED / CLOSE</div><div className="kpi">{dashboard.receivedAwaitingClose||0}</div></div>
      <div className="card"><div className="sub">AP MATCH EXCEPTIONS</div><div className="kpi">{dashboard.apMatchExceptions||0}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Create Purchase Order</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Booking / Shipment Job</span><select style={fieldStyle} value={form.bookingId} onChange={e=>pickBooking(e.target.value)}><option value="">Select</option>{bookings.map((b:any)=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
        <label><span style={labelStyle}>Vendor</span><select style={fieldStyle} value={form.vendorId} onChange={e=>setForm({...form,vendorId:e.target.value})}><option value="">Select</option>{vendors.map((v:any)=><option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}</select></label>
        <label><span style={labelStyle}>Currency</span><input style={fieldStyle} maxLength={3} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Expected Date</span><input type="date" style={fieldStyle} value={form.expectedDate} onChange={e=>setForm({...form,expectedDate:e.target.value})}/></label>
        <label><span style={labelStyle}>Match Tolerance %</span><input type="number" min={0} max={25} step="0.1" style={fieldStyle} value={form.tolerancePct} onChange={e=>setForm({...form,tolerancePct:Number(e.target.value)})}/></label>
        <label><span style={labelStyle}>Budget Policy</span><select style={fieldStyle} value={form.budgetPolicy} onChange={e=>setForm({...form,budgetPolicy:e.target.value})}><option>WARN</option><option>BLOCK</option></select></label>
        <label><span style={labelStyle}>Reference</span><input style={fieldStyle} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></label>
        <label><span style={labelStyle}>Notes</span><input style={fieldStyle} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </div>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Line</th><th>Charge</th><th>Description</th><th>Expense Account</th><th>Qty</th><th>Unit Rate</th><th>Tax %</th><th></th></tr></thead><tbody>{form.lines.map((l:any,i:number)=><tr key={i}><td><input style={{...fieldStyle,minWidth:65}} value={l.lineId} onChange={e=>patchLine(i,'lineId',e.target.value.toUpperCase())}/></td><td><input style={{...fieldStyle,minWidth:120}} value={l.chargeCode} onChange={e=>patchLine(i,'chargeCode',e.target.value.toUpperCase())}/></td><td><input style={{...fieldStyle,minWidth:160}} value={l.description} onChange={e=>patchLine(i,'description',e.target.value)}/></td><td><input style={{...fieldStyle,minWidth:160}} value={l.expenseAccount} onChange={e=>patchLine(i,'expenseAccount',e.target.value.toUpperCase())}/></td><td><input type="number" step="0.001" style={{...fieldStyle,minWidth:85}} value={l.quantity} onChange={e=>patchLine(i,'quantity',e.target.value)}/></td><td><input type="number" step="0.01" style={{...fieldStyle,minWidth:100}} value={l.unitRate} onChange={e=>patchLine(i,'unitRate',e.target.value)}/></td><td><input type="number" step="0.01" style={{...fieldStyle,minWidth:80}} value={l.taxRate} onChange={e=>patchLine(i,'taxRate',e.target.value)}/></td><td><button className="btn" onClick={()=>removeLine(i)}>Remove</button></td></tr>)}</tbody></table></div>
      <div style={{display:'flex',gap:8,marginTop:10}}><button className="btn" onClick={addLine}>Add Line</button><button className="btn" disabled={busy} onClick={()=>void create()}>Create PO</button></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Purchase Order Control</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>PO</th><th>Job</th><th>Vendor</th><th>Value</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead><tbody>{pos.map((po:any)=><tr key={po.poNo}><td><b>{po.poNo}</b><div className="sub">{fmtDate(po.orderDate)}</div></td><td>{po.bookingNo}</td><td>{po.vendorName}</td><td>{fmtMoney(po.totalAmount,po.currency)}</td><td>{(po.lines||[]).map((l:any)=>`${l.lineId} ${l.receivedQuantity}/${l.quantity}`).join(' · ')}</td><td><span className="status">{po.status}</span></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}><button className="btn" onClick={()=>void budget(po)}>Budget</button>{po.status==='DRAFT'&&<button className="btn" disabled={busy} onClick={()=>void post(`/procurement/purchase-orders/${encodeURIComponent(po.poNo)}/submit`,{},`${po.poNo} submitted.`)}>Submit</button>}{po.status==='SUBMITTED'&&<button className="btn" disabled={busy} onClick={()=>void post(`/procurement/purchase-orders/${encodeURIComponent(po.poNo)}/approve`,{},`${po.poNo} approved and committed.`)}>Approve</button>}{['APPROVED','PART_RECEIVED'].includes(po.status)&&<button className="btn" disabled={busy} onClick={()=>void receiveBalance(po)}>Receive Balance</button>}{po.status==='RECEIVED'&&<button className="btn" disabled={busy} onClick={()=>void post(`/procurement/purchase-orders/${encodeURIComponent(po.poNo)}/close`,{},`${po.poNo} closed.`)}>Close</button>}{['DRAFT','SUBMITTED','APPROVED'].includes(po.status)&&<button className="btn" disabled={busy} onClick={()=>void cancel(po)}>Cancel</button>}</div></td></tr>)}{pos.length===0&&<tr><td colSpan={7}>No purchase orders.</td></tr>}</tbody></table></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>AP Three-Way Match</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>AP Invoice</th><th>Vendor</th><th>Amount</th><th>Status</th><th>PO / Variance Detail</th><th></th></tr></thead><tbody>{matches.map((m:any)=><tr key={m.invoiceNo}><td><b>{m.invoiceNo}</b></td><td>{m.partyName||'-'}</td><td>{fmtMoney(m.totalAmount,m.currency)}</td><td><span className="status">{m.status}</span></td><td>{(m.lines||[]).map((l:any)=>l.poNo?`${l.poNo}/${l.lineId}: ${l.status}, variance ${fmtMoney(l.variance,m.currency)}`:`No PO: ${l.status}`).join(' · ')}</td><td>{m.status==='EXCEPTION'&&<button className="btn" disabled={busy} onClick={()=>void override(m)}>Override</button>}</td></tr>)}{matches.length===0&&<tr><td colSpan={6}>No AP invoices to match.</td></tr>}</tbody></table></div></div>

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'end',flexWrap:'wrap'}}><h3 style={sectionTitle}>Vendor Spend / Commitments</h3><label><span style={labelStyle}>Period</span><input type="month" style={fieldStyle} value={period} onChange={e=>{setPeriod(e.target.value);void load(token,e.target.value);}}/></label></div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>{(spend.totalByCurrency||[]).map((x:any)=><div className="card" key={x.currency}><div className="sub">COMMITTED {x.currency}</div><b>{fmtMoney(x.amount,x.currency)}</b></div>)}</div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Vendor</th><th>Currency</th><th>POs</th><th>Committed</th></tr></thead><tbody>{(spend.byVendor||[]).map((v:any)=><tr key={`${v.currency}:${v.vendorId}`}><td>{v.vendorName}</td><td>{v.currency}</td><td>{v.poCount}</td><td>{fmtMoney(v.committed,v.currency)}</td></tr>)}{!(spend.byVendor||[]).length&&<tr><td colSpan={4}>No committed spend for {period}.</td></tr>}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}
