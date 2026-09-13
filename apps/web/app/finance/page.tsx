'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtMoney,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;currency?:string;status:string};
type Line={id:string;bookingId:string;type:'REVENUE'|'COST';chargeCode:string;amount:any;finalAmount?:any;currency:string;status:string;source?:string};

export default function FinancePage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [bookingId,setBookingId]=useState('');
  const [lines,setLines]=useState<Line[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({type:'REVENUE',chargeCode:'OCEAN_FREIGHT',amount:'',finalAmount:'',currency:'USD',status:'PLANNED',source:'MANUAL'});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void loadBookings(t);},[]);
  async function loadBookings(t=token){try{const b=await api('/bookings',t);const arr=Array.isArray(b)?b:[];setBookings(arr);if(!bookingId&&arr[0]?.id){setBookingId(arr[0].id);void loadLines(arr[0].id,t);}}catch(e:any){setMessage(e.message||'Unable to load bookings');}}
  async function loadLines(id=bookingId,t=token){if(!id){setLines([]);return;}try{const data=await api(`/finance/booking/${id}`,t);setLines(Array.isArray(data)?data:[]);}catch(e:any){setMessage(e.message||'Unable to load finance lines');}}
  const selected=bookings.find(b=>b.id===bookingId);
  const totals=useMemo(()=>{const revenue=lines.filter(x=>x.type==='REVENUE').reduce((s,x)=>s+Number(x.finalAmount??x.amount??0),0);const cost=lines.filter(x=>x.type==='COST').reduce((s,x)=>s+Number(x.finalAmount??x.amount??0),0);return {revenue,cost,gp:revenue-cost,margin:revenue?((revenue-cost)/revenue)*100:0};},[lines]);

  async function createLine(){
    if(!bookingId||!form.chargeCode.trim()||!form.amount){setMessage('Booking, charge code and amount are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/finance',token,{method:'POST',body:JSON.stringify({bookingId,type:form.type,chargeCode:form.chargeCode.trim().toUpperCase(),amount:Number(form.amount),finalAmount:form.finalAmount?Number(form.finalAmount):null,currency:form.currency,status:form.status,source:form.source})});
      setMessage('Finance line created.');setForm({...form,amount:'',finalAmount:''});await loadLines();
    }catch(e:any){setMessage(e.message||'Finance line could not be created.');}finally{setBusy(false);}
  }
  async function setStatus(id:string,status:string){setMessage('');try{await api(`/finance/${id}/status`,token,{method:'POST',body:JSON.stringify({status})});await loadLines();}catch(e:any){setMessage(e.message||'Status change failed.');}}

  return <WorkspaceShell title="Finance / Job Costing" subtitle="Revenue, cost, gross profit and financial status by shipment" active="/finance" actions={<button className="btn" onClick={()=>void loadLines()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><label><span style={labelStyle}>Job / Booking</span><select style={fieldStyle} value={bookingId} onChange={e=>{setBookingId(e.target.value);void loadLines(e.target.value);}}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination} · {b.status}</option>)}</select></label></div>
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">REVENUE</div><div className="kpi">{fmtMoney(totals.revenue,selected?.currency||'USD')}</div></div>
      <div className="card"><div className="sub">COST</div><div className="kpi">{fmtMoney(totals.cost,selected?.currency||'USD')}</div></div>
      <div className="card"><div className="sub">GROSS PROFIT</div><div className="kpi">{fmtMoney(totals.gp,selected?.currency||'USD')}</div></div>
      <div className="card"><div className="sub">GP MARGIN</div><div className="kpi">{totals.margin.toFixed(1)}%</div></div>
    </div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Add Finance Line</h3><div style={formGrid}>
      <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>REVENUE</option><option>COST</option></select></label>
      <label><span style={labelStyle}>Charge Code *</span><input style={fieldStyle} value={form.chargeCode} onChange={e=>setForm({...form,chargeCode:e.target.value})}/></label>
      <label><span style={labelStyle}>Planned Amount *</span><input type="number" style={fieldStyle} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
      <label><span style={labelStyle}>Final Amount</span><input type="number" style={fieldStyle} value={form.finalAmount} onChange={e=>setForm({...form,finalAmount:e.target.value})}/></label>
      <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['PLANNED','WIP','ACCRUED','POSTED','APPROVAL_PENDING','APPROVED','PAYABLE','FINAL'].map(x=><option key={x}>{x}</option>)}</select></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy||!bookingId} onClick={createLine}>{busy?'Saving…':'Add Finance Line'}</button></div></div>
    <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Charge</th><th>Planned</th><th>Final</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>
      {lines.map(l=><tr key={l.id}><td><b>{l.type}</b></td><td>{l.chargeCode}</td><td>{fmtMoney(l.amount,l.currency)}</td><td>{fmtMoney(l.finalAmount??l.amount,l.currency)}</td><td><span className="status">{l.status}</span></td><td>{l.source||'-'}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}><button className="btn" onClick={()=>setStatus(l.id,'APPROVED')}>Approve</button><button className="btn" onClick={()=>setStatus(l.id,'FINAL')}>Final</button><button className="btn" onClick={()=>setStatus(l.id,'DISPUTED')}>Dispute</button></div></td></tr>)}
      {lines.length===0&&<tr><td colSpan={7}>{bookingId?'No finance lines for this booking.':'Select a booking.'}</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
