'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;customer?:{name:string};carrier?:string;vesselVoyage?:string};
type Milestone={id:string;bookingId:string;code:string;label:string;location?:string;plannedAt?:string;actualAt?:string;status:string;source?:string;remarks?:string;booking?:Booking};
const templates=[
  ['BOOKED','Booking Confirmed'],['EMPTY_RELEASE','Empty Container Released'],['PICKUP','Container Picked Up'],['GATE_IN','Gate In Terminal'],['VGM','VGM Submitted'],['LOADED','Loaded on Vessel'],['DEPARTED','Vessel Departed'],['TRANSSHIP','Transshipment'],['ARRIVED','Vessel Arrived'],['DISCHARGED','Container Discharged'],['CUSTOMS','Customs Cleared'],['GATE_OUT','Gate Out Terminal'],['DELIVERED','Delivered'],['EMPTY_RETURN','Empty Returned']
] as const;

export default function TrackingPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Milestone[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [search,setSearch]=useState('');
  const [bookingFilter,setBookingFilter]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({bookingId:'',code:'BOOKED',label:'Booking Confirmed',location:'',plannedAt:'',actualAt:'',status:'PLANNED',source:'MANUAL',remarks:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const [m,b]=await Promise.all([api('/tracking',t),api('/bookings',t)]);const milestones=Array.isArray(m)?m:[];const bookingRows=Array.isArray(b)?b:[];setRows(milestones);setBookings(bookingRows);const contextId=new URLSearchParams(location.search).get('bookingId')||'';if(contextId&&bookingRows.some((x:Booking)=>x.id===contextId)){setBookingFilter(contextId);setForm(x=>({...x,bookingId:contextId}));}}catch(e:any){setMessage(e.message||'Unable to load shipment tracking.');}}
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return rows.filter(r=>(!bookingFilter||r.bookingId===bookingFilter)&&(!q||[r.booking?.bookingNo,r.booking?.customer?.name,r.booking?.origin,r.booking?.destination,r.code,r.label,r.location,r.status].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,bookingFilter]);
  const overdue=rows.filter(r=>r.status!=='COMPLETED'&&r.plannedAt&&new Date(r.plannedAt).getTime()<Date.now()).length;
  const completed=rows.filter(r=>r.status==='COMPLETED').length;
  const pending=rows.length-completed;

  function chooseTemplate(code:string){const t=templates.find(x=>x[0]===code);setForm(x=>({...x,code,label:t?.[1]||x.label}));}
  async function createMilestone(){if(!form.bookingId||!form.code.trim()||!form.label.trim()){setMessage('Booking, milestone code and label are required.');return;}setBusy(true);setMessage('');try{await api('/tracking',token,{method:'POST',body:JSON.stringify({...form,plannedAt:form.plannedAt?new Date(`${form.plannedAt}T12:00:00Z`).toISOString():null,actualAt:form.actualAt?new Date(`${form.actualAt}T12:00:00Z`).toISOString():null})});setForm(x=>({...x,location:'',plannedAt:'',actualAt:'',remarks:''}));setMessage('Shipment milestone created.');await load();}catch(e:any){setMessage(e.message||'Could not create milestone.');}finally{setBusy(false);}}
  async function complete(id:string){setBusy(true);try{await api(`/tracking/${id}/complete`,token,{method:'POST',body:JSON.stringify({actualAt:new Date().toISOString()})});setMessage('Milestone completed.');await load();}catch(e:any){setMessage(e.message||'Could not complete milestone.');}finally{setBusy(false);}}
  async function remove(id:string){if(!confirm('Delete this shipment milestone?'))return;setBusy(true);try{await api(`/tracking/${id}`,token,{method:'DELETE'});await load();}catch(e:any){setMessage(e.message||'Could not delete milestone.');}finally{setBusy(false);}}

  return <WorkspaceShell title="Shipment Tracking" subtitle="Operational milestones, movement events and shipment progress" active="/tracking" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {(bookingFilter||form.bookingId)&&<JobContextRail bookingId={bookingFilter||form.bookingId} bookingNo={bookings.find(b=>b.id===(bookingFilter||form.bookingId))?.bookingNo} active="TRACKING"/>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">Milestones</div><div className="kpi">{rows.length}</div></div><div className="card"><div className="sub">Pending</div><div className="kpi">{pending}</div></div><div className="card"><div className="sub">Overdue</div><div className="kpi">{overdue}</div></div><div className="card"><div className="sub">Completed</div><div className="kpi">{completed}</div></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Add Shipment Milestone</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking *</span><select style={fieldStyle} value={form.bookingId} onChange={e=>setForm({...form,bookingId:e.target.value})}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} — {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Milestone *</span><select style={fieldStyle} value={form.code} onChange={e=>chooseTemplate(e.target.value)}>{templates.map(([c,l])=><option key={c} value={c}>{c} — {l}</option>)}</select></label>
      <label><span style={labelStyle}>Label *</span><input style={fieldStyle} value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/></label>
      <label><span style={labelStyle}>Location</span><input style={fieldStyle} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Port / terminal / depot"/></label>
      <label><span style={labelStyle}>Planned Date</span><input type="date" style={fieldStyle} value={form.plannedAt} onChange={e=>setForm({...form,plannedAt:e.target.value})}/></label>
      <label><span style={labelStyle}>Actual Date</span><input type="date" style={fieldStyle} value={form.actualAt} onChange={e=>setForm({...form,actualAt:e.target.value})}/></label>
      <label><span style={labelStyle}>Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['PLANNED','IN_PROGRESS','DELAYED','COMPLETED','CANCELLED'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Source</span><select style={fieldStyle} value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>{['MANUAL','CARRIER','AGENT','EDI','API'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label style={{gridColumn:'1 / -1'}}><span style={labelStyle}>Remarks</span><input style={fieldStyle} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createMilestone}>{busy?'Saving…':'Add Milestone'}</button></div></div>

    <div className="card"><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><input style={{...fieldStyle,maxWidth:360}} placeholder="Search booking, customer, route, milestone or status" value={search} onChange={e=>setSearch(e.target.value)}/><select style={{...fieldStyle,maxWidth:280}} value={bookingFilter} onChange={e=>setBookingFilter(e.target.value)}><option value="">All bookings</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo}</option>)}</select></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Customer</th><th>Route</th><th>Milestone</th><th>Location</th><th>Planned</th><th>Actual</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>
      {visible.map(r=>{const isLate=r.status!=='COMPLETED'&&r.plannedAt&&new Date(r.plannedAt).getTime()<Date.now();return <tr key={r.id}><td><a href={`/bookings/${r.bookingId}`}><b>{r.booking?.bookingNo||r.bookingId}</b></a></td><td>{r.booking?.customer?.name||'-'}</td><td>{r.booking?`${r.booking.origin} → ${r.booking.destination}`:'-'}</td><td><b>{r.label}</b><div className="sub">{r.code}</div></td><td>{r.location||'-'}</td><td>{fmtDate(r.plannedAt)}</td><td>{fmtDate(r.actualAt)}</td><td><span className="status">{isLate&&r.status==='PLANNED'?'OVERDUE':r.status}</span></td><td>{r.source||'-'}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{r.status!=='COMPLETED'&&<button className="btn" disabled={busy} onClick={()=>complete(r.id)}>Complete</button>}<button className="btn" disabled={busy} onClick={()=>remove(r.id)}>Delete</button></div></td></tr>})}
      {visible.length===0&&<tr><td colSpan={10}>No shipment milestones found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
