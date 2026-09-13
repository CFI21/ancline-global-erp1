'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;customer?:{name:string}};
type Leg={id:string;bookingId:string;sequence:number;legType:string;mode:string;origin:string;destination:string;carrier?:string;vessel?:string;voyage?:string;terminal?:string;etd?:string;eta?:string;atd?:string;ata?:string;status:string;remarks?:string;booking?:Booking};

const empty={bookingId:'',sequence:'1',legType:'MAIN',mode:'SEA',origin:'',destination:'',carrier:'',vessel:'',voyage:'',terminal:'',etd:'',eta:'',atd:'',ata:'',status:'PLANNED',remarks:''};
const toIso=(v:string)=>v?new Date(`${v}T12:00:00Z`).toISOString():null;

export default function RoutingPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Leg[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [form,setForm]=useState(empty);
  const [search,setSearch]=useState('');
  const [bookingFilter,setBookingFilter]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{
      const [r,b]=await Promise.all([api('/routing',t),api('/bookings',t)]);
      setRows(Array.isArray(r)?r:[]);setBookings(Array.isArray(b)?b:[]);
    }catch(e:any){setMessage(e.message||'Unable to load routing legs.');}
  }
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(r=>(!bookingFilter||r.bookingId===bookingFilter)&&(!q||[r.booking?.bookingNo,r.booking?.customer?.name,r.origin,r.destination,r.carrier,r.vessel,r.voyage,r.status,r.legType].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,bookingFilter]);
  const active=rows.filter(r=>!['COMPLETED','CANCELLED'].includes(String(r.status).toUpperCase())).length;
  const transship=rows.filter(r=>String(r.legType).toUpperCase()==='TRANSSHIP').length;

  function chooseBooking(id:string){
    const b=bookings.find(x=>x.id===id);
    const nextSeq=Math.max(0,...rows.filter(r=>r.bookingId===id).map(r=>Number(r.sequence||0)))+1;
    setForm(x=>({...x,bookingId:id,sequence:String(nextSeq),origin:b?.origin||'',destination:b?.destination||''}));
  }

  async function createLeg(){
    if(!form.bookingId||!form.origin.trim()||!form.destination.trim()){setMessage('Booking, origin and destination are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/routing',token,{method:'POST',body:JSON.stringify({...form,sequence:Number(form.sequence),etd:toIso(form.etd),eta:toIso(form.eta),atd:toIso(form.atd),ata:toIso(form.ata)})});
      setMessage('Routing leg created.');setForm(empty);await load();
    }catch(e:any){setMessage(e.message||'Could not create routing leg.');}finally{setBusy(false);}
  }
  async function remove(id:string){if(!confirm('Delete this routing leg?'))return;setBusy(true);try{await api(`/routing/${id}`,token,{method:'DELETE'});await load();}catch(e:any){setMessage(e.message||'Could not delete routing leg.');}finally{setBusy(false);}}
  async function mark(id:string,status:string){setBusy(true);try{await api(`/routing/${id}`,token,{method:'PATCH',body:JSON.stringify({status})});await load();}catch(e:any){setMessage(e.message||'Could not update routing leg.');}finally{setBusy(false);}}

  return <WorkspaceShell title="Routing / Voyage Plan" subtitle="Multi-leg routing, feeder/main vessel planning and transshipment control" active="/routing" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">ROUTING LEGS</div><div className="kpi">{rows.length}</div></div><div className="card"><div className="sub">ACTIVE LEGS</div><div className="kpi">{active}</div></div><div className="card"><div className="sub">TRANSSHIP LEGS</div><div className="kpi">{transship}</div></div><div className="card"><div className="sub">BOOKINGS WITH ROUTING</div><div className="kpi">{new Set(rows.map(r=>r.bookingId)).size}</div></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Add Routing Leg</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking *</span><select style={fieldStyle} value={form.bookingId} onChange={e=>chooseBooking(e.target.value)}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} — {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Sequence *</span><input type="number" min="1" style={fieldStyle} value={form.sequence} onChange={e=>setForm({...form,sequence:e.target.value})}/></label>
      <label><span style={labelStyle}>Leg Type</span><select style={fieldStyle} value={form.legType} onChange={e=>setForm({...form,legType:e.target.value})}>{['PRE_CARRIAGE','FEEDER','MAIN','TRANSSHIP','ON_CARRIAGE'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Mode</span><select style={fieldStyle} value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}>{['SEA','ROAD','RAIL','AIR'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Origin *</span><input style={fieldStyle} value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})}/></label>
      <label><span style={labelStyle}>Destination *</span><input style={fieldStyle} value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})}/></label>
      <label><span style={labelStyle}>Carrier</span><input style={fieldStyle} value={form.carrier} onChange={e=>setForm({...form,carrier:e.target.value})}/></label>
      <label><span style={labelStyle}>Vessel</span><input style={fieldStyle} value={form.vessel} onChange={e=>setForm({...form,vessel:e.target.value})}/></label>
      <label><span style={labelStyle}>Voyage</span><input style={fieldStyle} value={form.voyage} onChange={e=>setForm({...form,voyage:e.target.value})}/></label>
      <label><span style={labelStyle}>Terminal</span><input style={fieldStyle} value={form.terminal} onChange={e=>setForm({...form,terminal:e.target.value})}/></label>
      <label><span style={labelStyle}>ETD</span><input type="date" style={fieldStyle} value={form.etd} onChange={e=>setForm({...form,etd:e.target.value})}/></label>
      <label><span style={labelStyle}>ETA</span><input type="date" style={fieldStyle} value={form.eta} onChange={e=>setForm({...form,eta:e.target.value})}/></label>
      <label><span style={labelStyle}>ATD</span><input type="date" style={fieldStyle} value={form.atd} onChange={e=>setForm({...form,atd:e.target.value})}/></label>
      <label><span style={labelStyle}>ATA</span><input type="date" style={fieldStyle} value={form.ata} onChange={e=>setForm({...form,ata:e.target.value})}/></label>
      <label><span style={labelStyle}>Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['PLANNED','BOOKED','DEPARTED','ARRIVED','COMPLETED','CANCELLED'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label style={{gridColumn:'1/-1'}}><span style={labelStyle}>Remarks</span><input style={fieldStyle} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createLeg}>{busy?'Saving…':'Add Routing Leg'}</button></div></div>

    <div className="card"><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><input style={{...fieldStyle,maxWidth:360}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search booking, customer, port, carrier, vessel or status"/><select style={{...fieldStyle,maxWidth:260}} value={bookingFilter} onChange={e=>setBookingFilter(e.target.value)}><option value="">All bookings</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo}</option>)}</select></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Seq</th><th>Booking</th><th>Type / Mode</th><th>Origin → Destination</th><th>Carrier</th><th>Vessel / Voyage</th><th>ETD / ETA</th><th>Actual</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {visible.map(r=><tr key={r.id}><td><b>{r.sequence}</b></td><td><a href={`/bookings/${r.bookingId}`}><b>{r.booking?.bookingNo||r.bookingId}</b></a><div className="sub">{r.booking?.customer?.name||''}</div></td><td>{r.legType}<div className="sub">{r.mode}</div></td><td>{r.origin} → {r.destination}</td><td>{r.carrier||'-'}</td><td>{[r.vessel,r.voyage].filter(Boolean).join(' / ')||'-'}</td><td>{fmtDate(r.etd)} / {fmtDate(r.eta)}</td><td>{fmtDate(r.atd)} / {fmtDate(r.ata)}</td><td><span className="status">{r.status}</span></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{r.status==='PLANNED'&&<button className="btn" onClick={()=>mark(r.id,'BOOKED')}>Book</button>}{r.status==='BOOKED'&&<button className="btn" onClick={()=>mark(r.id,'DEPARTED')}>Depart</button>}{r.status==='DEPARTED'&&<button className="btn" onClick={()=>mark(r.id,'ARRIVED')}>Arrive</button>}{r.status==='ARRIVED'&&<button className="btn" onClick={()=>mark(r.id,'COMPLETED')}>Complete</button>}<button className="btn" onClick={()=>remove(r.id)}>Delete</button></div></td></tr>)}
      {visible.length===0&&<tr><td colSpan={10}>No routing legs found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
