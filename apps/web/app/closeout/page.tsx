'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;customer?:{name?:string}};
type Item={id:string;itemCode:string;itemLabel:string;mandatory:boolean;completed:boolean;completedBy?:string|null;completedAt?:string|null};

export default function CloseoutPage(){
  const [token,setToken]=useState('');const [bookings,setBookings]=useState<Booking[]>([]);const [bookingId,setBookingId]=useState('');const [items,setItems]=useState<Item[]>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void loadBookings(t);},[]);
  async function loadBookings(t=token){try{const data=await api('/bookings',t);const rows=Array.isArray(data)?data:[];setBookings(rows);if(!bookingId&&rows[0]?.id){setBookingId(rows[0].id);void loadCloseout(rows[0].id,t);}}catch(e:any){setMessage(e.message||'Unable to load jobs');}}
  async function loadCloseout(id=bookingId,t=token){if(!id)return;try{const data=await api(`/operations/closeout/${id}`,t);setItems(Array.isArray(data)?data:[]);}catch(e:any){setMessage(e.message||'Unable to load closeout checklist');}}
  async function choose(id:string){setBookingId(id);setMessage('');await loadCloseout(id);}
  async function toggle(itemId:string){setBusy(true);try{await api(`/operations/closeout/${bookingId}/items/${itemId}/toggle`,token,{method:'POST'});await loadCloseout();}catch(e:any){setMessage(e.message||'Could not update closeout item');}finally{setBusy(false);}}
  async function finalize(){if(!confirm('Financially close this job? This will set the booking status to FINANCIALLY_CLOSED.'))return;setBusy(true);setMessage('');try{await api(`/operations/closeout/${bookingId}/finalize`,token,{method:'POST'});setMessage('Job financially closed successfully.');await Promise.all([loadCloseout(),loadBookings()]);}catch(e:any){setMessage(e.message||'Job could not be financially closed');}finally{setBusy(false);}}
  const selected=bookings.find(x=>x.id===bookingId);const done=items.filter(x=>x.completed).length;const mandatory=items.filter(x=>x.mandatory).length;const outstanding=items.filter(x=>x.mandatory&&!x.completed).length;const pct=items.length?Math.round(done/items.length*100):0;
  const eligible=useMemo(()=>selected&&['COMPLETED','FINANCIALLY_CLOSED'].includes(selected.status),[selected]);
  return <WorkspaceShell title="Job Closeout" subtitle="Operational completion and financial close checklist" active="/closeout" actions={<button className="btn" onClick={()=>void loadCloseout()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><label><span className="sub">BOOKING / JOB</span><select style={{...fieldStyle,maxWidth:520,display:'block',marginTop:5}} value={bookingId} onChange={e=>choose(e.target.value)}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination} · {b.status}</option>)}</select></label></div>
    {selected&&<><div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">JOB STATUS</div><div className="kpi" style={{fontSize:20}}>{selected.status}</div></div><div className="card"><div className="sub">CHECKLIST COMPLETE</div><div className="kpi">{pct}%</div></div><div className="card"><div className="sub">MANDATORY ITEMS</div><div className="kpi">{mandatory}</div></div><div className="card"><div className="sub">OUTSTANDING</div><div className="kpi">{outstanding}</div></div></div>
      <div className="card" style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><h3 style={{margin:'0 0 4px'}}>{selected.bookingNo}</h3><div className="sub">{selected.customer?.name||'Customer'} · {selected.origin} → {selected.destination}</div></div><button className="btn" disabled={busy||outstanding>0||selected.status==='FINANCIALLY_CLOSED'||!eligible} onClick={finalize}>{selected.status==='FINANCIALLY_CLOSED'?'Financially Closed':'Finalize Financial Close'}</button></div>{!eligible&&<div style={{marginTop:10}}>The job should reach <b>COMPLETED</b> before financial closeout.</div>}</div>
      <div className="card"><div style={{display:'grid',gap:8}}>{items.map(i=><div key={i.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:10,alignItems:'center',border:'1px solid #e2e8ee',borderRadius:8,padding:11}}><input type="checkbox" checked={i.completed} disabled={busy||selected.status==='FINANCIALLY_CLOSED'} onChange={()=>toggle(i.id)}/><div><b>{i.itemLabel}</b><div className="sub">{i.itemCode}{i.mandatory?' · Mandatory':''}{i.completedBy?` · Completed by ${i.completedBy}`:''}</div></div><span className="status">{i.completed?'Complete':'Open'}</span></div>)}{!items.length&&<div>No closeout checklist loaded.</div>}</div></div></>}
  </WorkspaceShell>;
}
