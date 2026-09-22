'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import JobFlowNav from '../../components/JobFlowNav';
import {api,fmtDate,requireToken} from '../../lib/api';

type Schedule={id:string;scheduleNo:string;carrier:string;serviceName?:string;vessel:string;imoNo?:string;voyage:string;direction?:string;portOfLoading:string;portOfDischarge:string;terminal?:string;etd:string;eta:string;atd?:string;ata?:string;cyClosing?:string;siCutoff?:string;vgmCutoff?:string;docCutoff?:string;capacityTeu?:number;status:string;source:string;remarks?:string;createdBy?:string};
type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;customer?:{name:string}};

const statuses=['PLANNED','OPEN','CONFIRMED','SAILING','DELAYED','ARRIVED','CANCELLED'];
const blank={scheduleNo:'',carrier:'',serviceName:'',vessel:'',imoNo:'',voyage:'',direction:'',portOfLoading:'',portOfDischarge:'',terminal:'',etd:'',eta:'',atd:'',ata:'',cyClosing:'',siCutoff:'',vgmCutoff:'',docCutoff:'',capacityTeu:'',status:'PLANNED',source:'MANUAL',remarks:''};
const dt=(v?:string)=>v?new Date(v).toISOString().slice(0,16):'';

export default function SchedulesPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Schedule[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [form,setForm]=useState<any>(blank);
  const [editingId,setEditingId]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [bookingId,setBookingId]=useState('');
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const [s,b]=await Promise.all([api('/schedules',t),api('/bookings',t)]);
      const scheduleRows=Array.isArray(s)?s:[];
      const bookingRows=Array.isArray(b)?b:[];
      setRows(scheduleRows);setBookings(bookingRows);
      const contextId=new URLSearchParams(location.search).get('bookingId')||'';
      if(contextId&&bookingRows.some((x:Booking)=>x.id===contextId))setBookingId(contextId);
    }catch(e:any){setMessage(e.message||'Unable to load vessel schedules');}
  }

  function edit(r:Schedule){
    setEditingId(r.id);setSelectedId(r.id);setForm({scheduleNo:r.scheduleNo,carrier:r.carrier,serviceName:r.serviceName||'',vessel:r.vessel,imoNo:r.imoNo||'',voyage:r.voyage,direction:r.direction||'',portOfLoading:r.portOfLoading,portOfDischarge:r.portOfDischarge,terminal:r.terminal||'',etd:dt(r.etd),eta:dt(r.eta),atd:dt(r.atd),ata:dt(r.ata),cyClosing:dt(r.cyClosing),siCutoff:dt(r.siCutoff),vgmCutoff:dt(r.vgmCutoff),docCutoff:dt(r.docCutoff),capacityTeu:r.capacityTeu??'',status:r.status,source:r.source||'MANUAL',remarks:r.remarks||''});
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function reset(){setEditingId('');setForm(blank);setMessage('');}

  async function save(){
    if(!form.carrier||!form.vessel||!form.voyage||!form.portOfLoading||!form.portOfDischarge||!form.etd||!form.eta){setMessage('Carrier, vessel, voyage, POL, POD, ETD and ETA are required.');return;}
    setBusy(true);setMessage('');
    try{
      const payload={...form,capacityTeu:form.capacityTeu===''?null:Number(form.capacityTeu)};
      if(editingId) await api(`/schedules/${editingId}`,token,{method:'PATCH',body:JSON.stringify(payload)});
      else await api('/schedules',token,{method:'POST',body:JSON.stringify(payload)});
      setMessage(editingId?'Schedule updated.':'Schedule created.');reset();await load();
    }catch(e:any){setMessage(e.message||'Schedule could not be saved.');}finally{setBusy(false);}
  }

  async function remove(id:string){
    if(!confirm('Delete this vessel schedule?')) return;
    setBusy(true);setMessage('');
    try{await api(`/schedules/${id}`,token,{method:'DELETE'});if(selectedId===id)setSelectedId('');if(editingId===id)reset();setMessage('Schedule deleted.');await load();}
    catch(e:any){setMessage(e.message||'Schedule could not be deleted.');}finally{setBusy(false);}
  }

  async function apply(){
    if(!selectedId||!bookingId){setMessage('Select a schedule and booking first.');return;}
    setBusy(true);setMessage('');
    try{await api(`/schedules/${selectedId}/apply-to-booking`,token,{method:'POST',body:JSON.stringify({bookingId})});setMessage('Schedule applied to booking and main routing leg synchronized.');await load();}
    catch(e:any){setMessage(e.message||'Schedule could not be applied.');}finally{setBusy(false);}
  }

  const filtered=useMemo(()=>{const q=search.toLowerCase().trim();return rows.filter(r=>(statusFilter==='ALL'||r.status===statusFilter)&&(!q||[r.scheduleNo,r.carrier,r.serviceName,r.vessel,r.imoNo,r.voyage,r.portOfLoading,r.portOfDischarge,r.terminal,r.status].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,statusFilter]);
  const now=Date.now();
  const upcoming=rows.filter(r=>new Date(r.etd).getTime()>now&&!['CANCELLED','ARRIVED'].includes(r.status)).length;
  const delayed=rows.filter(r=>r.status==='DELAYED').length;
  const sailing=rows.filter(r=>r.status==='SAILING').length;
  const selected=rows.find(r=>r.id===selectedId);

  return <WorkspaceShell title="Vessel / Voyage Schedules" subtitle="Carrier schedules, voyage control, cut-offs and booking assignment" active="/schedules" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {bookingId&&<JobFlowNav
      bookingId={bookingId}
      bookingNo={bookings.find(b=>b.id===bookingId)?.bookingNo}
      active="SCHEDULE"
    />}
    {bookingId&&<JobContextRail
      bookingId={bookingId}
      bookingNo={bookings.find(b=>b.id===bookingId)?.bookingNo}
      active="SCHEDULE"
      route={(()=>{const b=bookings.find(x=>x.id===bookingId);return b?`${b.origin} → ${b.destination}`:''})()}
      status={bookings.find(b=>b.id===bookingId)?.status||''}
    />}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:12}}>
      {[['Schedules',rows.length],['Upcoming',upcoming],['Sailing',sailing],['Delayed',delayed]].map(([k,v])=><div className="card" key={String(k)}><div className="sub">{k}</div><div style={{fontSize:26,fontWeight:800}}>{v}</div></div>)}
    </div>

    <div className="erp-workspace-grid">
    <div className="card erp-span-8 erp-panel-compact" style={{marginBottom:12}}><h3 style={sectionTitle}>{editingId?'Edit Vessel Schedule':'Create Vessel Schedule'}</h3><div style={formGrid}>
      <label><span style={labelStyle}>Schedule No.</span><input style={fieldStyle} value={form.scheduleNo} onChange={e=>setForm({...form,scheduleNo:e.target.value})} placeholder="Auto-generated if blank"/></label>
      <label><span style={labelStyle}>Carrier *</span><input style={fieldStyle} value={form.carrier} onChange={e=>setForm({...form,carrier:e.target.value})}/></label>
      <label><span style={labelStyle}>Service</span><input style={fieldStyle} value={form.serviceName} onChange={e=>setForm({...form,serviceName:e.target.value})} placeholder="Asia-Europe / Gulf Express"/></label>
      <label><span style={labelStyle}>Vessel *</span><input style={fieldStyle} value={form.vessel} onChange={e=>setForm({...form,vessel:e.target.value})}/></label>
      <label><span style={labelStyle}>IMO No.</span><input style={fieldStyle} value={form.imoNo} onChange={e=>setForm({...form,imoNo:e.target.value})}/></label>
      <label><span style={labelStyle}>Voyage *</span><input style={fieldStyle} value={form.voyage} onChange={e=>setForm({...form,voyage:e.target.value})}/></label>
      <label><span style={labelStyle}>Direction</span><input style={fieldStyle} value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})} placeholder="EB / WB / NB / SB"/></label>
      <label><span style={labelStyle}>POL *</span><input style={fieldStyle} value={form.portOfLoading} onChange={e=>setForm({...form,portOfLoading:e.target.value})}/></label>
      <label><span style={labelStyle}>POD *</span><input style={fieldStyle} value={form.portOfDischarge} onChange={e=>setForm({...form,portOfDischarge:e.target.value})}/></label>
      <label><span style={labelStyle}>Terminal</span><input style={fieldStyle} value={form.terminal} onChange={e=>setForm({...form,terminal:e.target.value})}/></label>
      <label><span style={labelStyle}>ETD *</span><input type="datetime-local" style={fieldStyle} value={form.etd} onChange={e=>setForm({...form,etd:e.target.value})}/></label>
      <label><span style={labelStyle}>ETA *</span><input type="datetime-local" style={fieldStyle} value={form.eta} onChange={e=>setForm({...form,eta:e.target.value})}/></label>
      <label><span style={labelStyle}>ATD</span><input type="datetime-local" style={fieldStyle} value={form.atd} onChange={e=>setForm({...form,atd:e.target.value})}/></label>
      <label><span style={labelStyle}>ATA</span><input type="datetime-local" style={fieldStyle} value={form.ata} onChange={e=>setForm({...form,ata:e.target.value})}/></label>
      <label><span style={labelStyle}>CY Closing</span><input type="datetime-local" style={fieldStyle} value={form.cyClosing} onChange={e=>setForm({...form,cyClosing:e.target.value})}/></label>
      <label><span style={labelStyle}>SI Cut-off</span><input type="datetime-local" style={fieldStyle} value={form.siCutoff} onChange={e=>setForm({...form,siCutoff:e.target.value})}/></label>
      <label><span style={labelStyle}>VGM Cut-off</span><input type="datetime-local" style={fieldStyle} value={form.vgmCutoff} onChange={e=>setForm({...form,vgmCutoff:e.target.value})}/></label>
      <label><span style={labelStyle}>Document Cut-off</span><input type="datetime-local" style={fieldStyle} value={form.docCutoff} onChange={e=>setForm({...form,docCutoff:e.target.value})}/></label>
      <label><span style={labelStyle}>Capacity TEU</span><input type="number" style={fieldStyle} value={form.capacityTeu} onChange={e=>setForm({...form,capacityTeu:e.target.value})}/></label>
      <label><span style={labelStyle}>Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Source</span><select style={fieldStyle} value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>{['MANUAL','CARRIER','EDI','API','AGENT'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label style={{gridColumn:'1/-1'}}><span style={labelStyle}>Remarks</span><input style={fieldStyle} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})}/></label>
    </div><div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>{editingId&&<button className="btn" onClick={reset}>Cancel Edit</button>}<button className="btn" disabled={busy} onClick={save}>{busy?'Saving…':editingId?'Update Schedule':'Create Schedule'}</button></div></div>

    <div className="card erp-span-4 erp-panel-compact" style={{marginBottom:12}}><h3 style={sectionTitle}>Assign Schedule to Booking</h3><div style={formGrid}>
      <label><span style={labelStyle}>Selected Schedule</span><select style={fieldStyle} value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Select schedule</option>{rows.map(r=><option key={r.id} value={r.id}>{r.scheduleNo} · {r.vessel} / {r.voyage} · {r.portOfLoading} → {r.portOfDischarge}</option>)}</select></label>
      <label><span style={labelStyle}>Booking</span><select style={fieldStyle} value={bookingId} onChange={e=>setBookingId(e.target.value)}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.customer?.name||''} · {b.origin} → {b.destination}</option>)}</select></label>
    </div>{selected&&<div className="sub" style={{marginTop:10}}>Applying <b>{selected.scheduleNo}</b> updates carrier, vessel/voyage, POL/POD, terminal, ETD/ETA, cut-offs and the booking's MAIN routing leg.</div>}<div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy||!selectedId||!bookingId} onClick={apply}>Apply to Booking</button></div></div>
    </div>

    <div className="card"><div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}><h3 style={{...sectionTitle,margin:0,flex:1}}>Schedule Register</h3><input style={{...fieldStyle,maxWidth:320}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search carrier, vessel, voyage, POL/POD"/><select style={{...fieldStyle,maxWidth:180}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>ALL</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Schedule</th><th>Carrier / Service</th><th>Vessel / Voyage</th><th>Route</th><th>ETD</th><th>ETA</th><th>Cut-offs</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>
      {filtered.map(r=><tr key={r.id} style={selectedId===r.id?{background:'#f3f7fb'}:undefined}><td><b>{r.scheduleNo}</b><div className="sub">{r.terminal||'-'}</div></td><td>{r.carrier}<div className="sub">{r.serviceName||'-'}</div></td><td><b>{r.vessel}</b><div className="sub">{r.voyage}{r.imoNo?` · IMO ${r.imoNo}`:''}</div></td><td>{r.portOfLoading} → {r.portOfDischarge}<div className="sub">{r.direction||''}</div></td><td>{new Date(r.etd).toLocaleString()}</td><td>{new Date(r.eta).toLocaleString()}</td><td><div className="sub">CY {fmtDate(r.cyClosing)}</div><div className="sub">SI {fmtDate(r.siCutoff)}</div><div className="sub">VGM {fmtDate(r.vgmCutoff)}</div></td><td><span className="status">{r.status}</span></td><td>{r.source}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn" onClick={()=>setSelectedId(r.id)}>Select</button><button className="btn" onClick={()=>edit(r)}>Edit</button><button className="btn" disabled={busy} onClick={()=>void remove(r.id)}>Delete</button></div></td></tr>)}
      {filtered.length===0&&<tr><td colSpan={10}>No vessel schedules found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
