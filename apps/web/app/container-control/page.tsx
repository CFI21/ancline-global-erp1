'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;customer?:{name:string}};
type Container={id:string;containerNo:string;type:string;ownership:string;status:string;location?:string;sealNo?:string;vgm?:number;grossWeight?:number};
type Movement={id:string;containerId:string;eventCode:string;eventLabel:string;status?:string;location?:string;occurredAt:string;source:string;reference?:string;remarks?:string;actorId?:string;container?:Container};

const events=[
  ['EMPTY_RELEASED','Empty Released'],['PICKED_UP','Empty Picked Up'],['GATED_IN','Gate In'],['VGM_SUBMITTED','VGM Submitted'],['LOADED','Loaded on Vessel'],['DEPARTED','Departed'],['TRANSSHIPMENT','Transshipment'],['DISCHARGED','Discharged'],['GATED_OUT','Gate Out'],['DELIVERED','Delivered'],['EMPTY_RETURNED','Empty Returned'],['CUSTOM','Custom Event']
] as const;
const statuses=['PLANNED','ALLOCATED','PICKED_UP','GATED_IN','LOADED','IN_TRANSIT','DISCHARGED','GATED_OUT','DELIVERED','EMPTY_RETURNED'];

export default function ContainerControlPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [bookingId,setBookingId]=useState('');
  const [containers,setContainers]=useState<Container[]>([]);
  const [movements,setMovements]=useState<Movement[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [form,setForm]=useState({containerId:'',eventCode:'PICKED_UP',eventLabel:'Empty Picked Up',status:'PICKED_UP',location:'',occurredAt:new Date().toISOString().slice(0,16),source:'MANUAL',reference:'',remarks:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void loadBookings(t);},[]);
  async function loadBookings(t=token){try{const rows=await api('/bookings',t);const list=Array.isArray(rows)?rows:[];setBookings(list);if(!bookingId&&list[0])void selectBooking(list[0].id,t);}catch(e:any){setMessage(e.message||'Unable to load bookings');}}
  async function selectBooking(id:string,t=token){setBookingId(id);setMessage('');try{const [b,m]=await Promise.all([api(`/bookings/${id}`,t),api(`/container-movements/booking/${id}`,t)]);const cs=Array.isArray(b?.containers)?b.containers:[];setContainers(cs);setMovements(Array.isArray(m)?m:[]);setForm(x=>({...x,containerId:cs.some((c:Container)=>c.id===x.containerId)?x.containerId:(cs[0]?.id||'')}));}catch(e:any){setMessage(e.message||'Unable to load container control');}}
  function chooseEvent(code:string){const found=events.find(x=>x[0]===code);setForm(x=>({...x,eventCode:code,eventLabel:found?.[1]||x.eventLabel,status:code==='CUSTOM'?x.status:(statuses.includes(code)?code:x.status)}));}
  async function addMovement(){if(!bookingId||!form.containerId){setMessage('Select a booking and container first.');return;}if(!form.eventLabel.trim()){setMessage('Event label is required.');return;}setBusy(true);setMessage('');try{await api('/container-movements',token,{method:'POST',body:JSON.stringify({bookingId,...form,occurredAt:new Date(form.occurredAt).toISOString()})});setMessage('Container movement recorded and container status updated.');setForm(x=>({...x,location:'',reference:'',remarks:'',occurredAt:new Date().toISOString().slice(0,16)}));await selectBooking(bookingId);}catch(e:any){setMessage(e.message||'Movement could not be recorded.');}finally{setBusy(false);}}

  const selected=bookings.find(b=>b.id===bookingId);
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return movements.filter(m=>!q||[m.container?.containerNo,m.eventCode,m.eventLabel,m.status,m.location,m.source,m.reference,m.remarks].some(v=>String(v||'').toLowerCase().includes(q)));},[movements,search]);
  const active=containers.filter(c=>!['DELIVERED','EMPTY_RETURNED'].includes(c.status)).length;

  return <WorkspaceShell title="Container Control" subtitle="Operational container movements, status, location and event history" active="/container-control" actions={<button className="btn" onClick={()=>bookingId?void selectBooking(bookingId):void loadBookings()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Booking / Container Scope</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking</span><select style={fieldStyle} value={bookingId} onChange={e=>void selectBooking(e.target.value)}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Container</span><select style={fieldStyle} value={form.containerId} onChange={e=>setForm({...form,containerId:e.target.value})}><option value="">Select container</option>{containers.map(c=><option key={c.id} value={c.id}>{c.containerNo} · {c.type} · {c.status}</option>)}</select></label>
    </div>{selected&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><span className="status">{selected.bookingNo}</span><span className="status">{selected.customer?.name||'Customer'}</span><span className="status">{selected.origin} → {selected.destination}</span><span className="status">{containers.length} containers</span><span className="status">{active} active</span></div>}</div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Record Container Movement</h3><div style={formGrid}>
      <label><span style={labelStyle}>Event</span><select style={fieldStyle} value={form.eventCode} onChange={e=>chooseEvent(e.target.value)}>{events.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
      <label><span style={labelStyle}>Event Label</span><input style={fieldStyle} value={form.eventLabel} onChange={e=>setForm({...form,eventLabel:e.target.value})}/></label>
      <label><span style={labelStyle}>Container Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Location</span><input style={fieldStyle} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Port / terminal / depot"/></label>
      <label><span style={labelStyle}>Occurred At</span><input type="datetime-local" style={fieldStyle} value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})}/></label>
      <label><span style={labelStyle}>Source</span><select style={fieldStyle} value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>{['MANUAL','CARRIER','AGENT','TERMINAL','DEPOT','EDI','API'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Reference</span><input style={fieldStyle} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="EDI / gate / carrier ref"/></label>
      <label><span style={labelStyle}>Remarks</span><input style={fieldStyle} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy||!form.containerId} onClick={addMovement}>{busy?'Saving…':'Record Movement'}</button></div></div>

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}><h3 style={{...sectionTitle,margin:0,flex:1}}>Movement History</h3><input style={{...fieldStyle,maxWidth:360}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search container, event, location or source"/></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Date / Time</th><th>Container</th><th>Event</th><th>Status</th><th>Location</th><th>Source</th><th>Reference</th><th>Actor</th><th>Remarks</th></tr></thead><tbody>
      {visible.map(m=><tr key={m.id}><td>{new Date(m.occurredAt).toLocaleString()}</td><td><b>{m.container?.containerNo||'-'}</b></td><td>{m.eventLabel}<div className="sub">{m.eventCode}</div></td><td><span className="status">{m.status||'-'}</span></td><td>{m.location||'-'}</td><td>{m.source||'-'}</td><td>{m.reference||'-'}</td><td>{m.actorId||'-'}</td><td>{m.remarks||'-'}</td></tr>)}
      {visible.length===0&&<tr><td colSpan={9}>No container movements recorded for this booking yet.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
