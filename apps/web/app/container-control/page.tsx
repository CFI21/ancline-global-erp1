'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;customer?:{name:string}};
type Exposure={demurrageDays:number;detentionDays:number;demurrageExposure:number;detentionExposure:number;totalExposure:number;currency:string;demurrageAtRisk:boolean;detentionAtRisk:boolean};
type Container={id:string;containerNo:string;type:string;ownership:string;status:string;location?:string;sealNo?:string;vgm?:number;grossWeight?:number;equipmentProvider?:string;allocationRef?:string;allocationStatus?:string;emptyReleaseOrderNo?:string;emptyReleaseValidUntil?:string;emptyDepot?:string;fullReturnTerminal?:string;pickupDate?:string;fullGateInAt?:string;dischargeAt?:string;deliveryAt?:string;detentionFreeDays?:number;demurrageFreeDays?:number;detentionFreeUntil?:string;demurrageFreeUntil?:string;emptyReturnDue?:string;emptyReturnedAt?:string;detentionRatePerDay?:number;demurrageRatePerDay?:number;freeTimeCurrency?:string;exposure?:Exposure};
type Movement={id:string;containerId:string;eventCode:string;eventLabel:string;status?:string;location?:string;occurredAt:string;source:string;reference?:string;remarks?:string;actorId?:string;container?:Container};

const events=[['EMPTY_RELEASED','Empty Released'],['PICKED_UP','Empty Picked Up'],['GATED_IN','Gate In'],['VGM_SUBMITTED','VGM Submitted'],['LOADED','Loaded on Vessel'],['DEPARTED','Departed'],['TRANSSHIPMENT','Transshipment'],['ARRIVED','Vessel Arrived'],['DISCHARGED','Discharged'],['GATED_OUT','Gate Out'],['DELIVERED','Delivered'],['EMPTY_RETURNED','Empty Returned'],['CUSTOM','Custom Event']] as const;
const statuses=['PLANNED','ALLOCATED','PICKED_UP','GATED_IN','LOADED','DEPARTED','IN_TRANSIT','TRANSSHIPMENT','ARRIVED','DISCHARGED','GATED_OUT','DELIVERED','EMPTY_RETURNED'];
const allocationStatuses=['UNALLOCATED','REQUESTED','ALLOCATED','RELEASED','UTILIZED','CLOSED'];
const dateLocal=(v?:string)=>v?new Date(v).toISOString().slice(0,16):'';

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
  const [control,setControl]=useState<any>({equipmentProvider:'',allocationRef:'',allocationStatus:'UNALLOCATED',emptyReleaseOrderNo:'',emptyReleaseValidUntil:'',emptyDepot:'',fullReturnTerminal:'',pickupDate:'',fullGateInAt:'',dischargeAt:'',deliveryAt:'',detentionFreeDays:'',demurrageFreeDays:'',detentionFreeUntil:'',demurrageFreeUntil:'',emptyReturnDue:'',emptyReturnedAt:'',detentionRatePerDay:'',demurrageRatePerDay:'',freeTimeCurrency:'USD'});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void loadBookings(t);},[]);
  async function loadBookings(t=token){try{const rows=await api('/bookings',t);const list=Array.isArray(rows)?rows:[];setBookings(list);if(!bookingId&&list[0])void selectBooking(list[0].id,t);}catch(e:any){setMessage(e.message||'Unable to load bookings');}}
  async function selectBooking(id:string,t=token){setBookingId(id);setMessage('');try{const [b,m,c]=await Promise.all([api(`/bookings/${id}`,t),api(`/container-movements/booking/${id}`,t),api(`/container-movements/booking/${id}/control`,t)]);const cs=Array.isArray(c)?c:(Array.isArray(b?.containers)?b.containers:[]);setContainers(cs);setMovements(Array.isArray(m)?m:[]);const next=cs.some((x:Container)=>x.id===form.containerId)?form.containerId:(cs[0]?.id||'');setForm(x=>({...x,containerId:next}));if(next)loadControl(cs.find((x:Container)=>x.id===next));}catch(e:any){setMessage(e.message||'Unable to load container control');}}
  function loadControl(c?:Container){if(!c)return;setControl({equipmentProvider:c.equipmentProvider||'',allocationRef:c.allocationRef||'',allocationStatus:c.allocationStatus||'UNALLOCATED',emptyReleaseOrderNo:c.emptyReleaseOrderNo||'',emptyReleaseValidUntil:dateLocal(c.emptyReleaseValidUntil),emptyDepot:c.emptyDepot||'',fullReturnTerminal:c.fullReturnTerminal||'',pickupDate:dateLocal(c.pickupDate),fullGateInAt:dateLocal(c.fullGateInAt),dischargeAt:dateLocal(c.dischargeAt),deliveryAt:dateLocal(c.deliveryAt),detentionFreeDays:c.detentionFreeDays??'',demurrageFreeDays:c.demurrageFreeDays??'',detentionFreeUntil:dateLocal(c.detentionFreeUntil),demurrageFreeUntil:dateLocal(c.demurrageFreeUntil),emptyReturnDue:dateLocal(c.emptyReturnDue),emptyReturnedAt:dateLocal(c.emptyReturnedAt),detentionRatePerDay:c.detentionRatePerDay??'',demurrageRatePerDay:c.demurrageRatePerDay??'',freeTimeCurrency:c.freeTimeCurrency||'USD'});}
  function chooseContainer(id:string){setForm(x=>({...x,containerId:id}));loadControl(containers.find(c=>c.id===id));}
  function chooseEvent(code:string){const found=events.find(x=>x[0]===code);setForm(x=>({...x,eventCode:code,eventLabel:found?.[1]||x.eventLabel,status:code==='CUSTOM'?x.status:(statuses.includes(code)?code:x.status)}));}
  async function addMovement(){if(!bookingId||!form.containerId){setMessage('Select a booking and container first.');return;}if(!form.eventLabel.trim()){setMessage('Event label is required.');return;}setBusy(true);setMessage('');try{await api('/container-movements',token,{method:'POST',body:JSON.stringify({bookingId,...form,occurredAt:new Date(form.occurredAt).toISOString()})});setMessage('Container movement recorded and operational dates synchronized.');setForm(x=>({...x,location:'',reference:'',remarks:'',occurredAt:new Date().toISOString().slice(0,16)}));await selectBooking(bookingId);}catch(e:any){setMessage(e.message||'Movement could not be recorded.');}finally{setBusy(false);}}
  async function saveControl(){if(!form.containerId)return;setBusy(true);setMessage('');try{await api(`/container-movements/${form.containerId}/control`,token,{method:'PATCH',body:JSON.stringify(control)});setMessage('Equipment, depot and free-time controls saved.');await selectBooking(bookingId);}catch(e:any){setMessage(e.message||'Equipment controls could not be saved.');}finally{setBusy(false);}}

  const selected=bookings.find(b=>b.id===bookingId);
  const selectedContainer=containers.find(c=>c.id===form.containerId);
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return movements.filter(m=>!q||[m.container?.containerNo,m.eventCode,m.eventLabel,m.status,m.location,m.source,m.reference,m.remarks].some(v=>String(v||'').toLowerCase().includes(q)));},[movements,search]);
  const active=containers.filter(c=>!['DELIVERED','EMPTY_RETURNED'].includes(c.status)).length;
  const totalExposure=containers.reduce((s,c)=>s+Number(c.exposure?.totalExposure||0),0);
  const atRisk=containers.filter(c=>c.exposure?.demurrageAtRisk||c.exposure?.detentionAtRisk).length;
  const controlField=(key:string,label:string,type='text')=><label><span style={labelStyle}>{label}</span><input type={type} style={fieldStyle} value={control[key]} onChange={e=>setControl({...control,[key]:e.target.value})}/></label>;

  return <WorkspaceShell title="Container Control" subtitle="Equipment allocation, depot movements, free time, detention / demurrage and event history" active="/container-control" actions={<button className="btn" onClick={()=>bookingId?void selectBooking(bookingId):void loadBookings()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Booking / Container Scope</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking</span><select style={fieldStyle} value={bookingId} onChange={e=>void selectBooking(e.target.value)}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Container</span><select style={fieldStyle} value={form.containerId} onChange={e=>chooseContainer(e.target.value)}><option value="">Select container</option>{containers.map(c=><option key={c.id} value={c.id}>{c.containerNo} · {c.type} · {c.status}</option>)}</select></label>
    </div>{selected&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><span className="status">{selected.bookingNo}</span><span className="status">{selected.customer?.name||'Customer'}</span><span className="status">{selected.origin} → {selected.destination}</span><span className="status">{containers.length} containers</span><span className="status">{active} active</span><span className="status">{atRisk} at risk</span><span className="status">Exposure {containers[0]?.exposure?.currency||'USD'} {totalExposure.toFixed(2)}</span></div>}</div>

    {selectedContainer&&<div className="card" style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><h3 style={{...sectionTitle,margin:0}}>Equipment / Depot / Free Time</h3><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="status">{selectedContainer.containerNo}</span><span className="status">{selectedContainer.exposure?.currency||'USD'} {(selectedContainer.exposure?.totalExposure||0).toFixed(2)} exposure</span>{(selectedContainer.exposure?.demurrageAtRisk||selectedContainer.exposure?.detentionAtRisk)&&<span className="status">AT RISK</span>}</div></div>
      <div style={{...formGrid,marginTop:12}}>
        {controlField('equipmentProvider','Equipment Provider')}{controlField('allocationRef','Allocation Ref')}
        <label><span style={labelStyle}>Allocation Status</span><select style={fieldStyle} value={control.allocationStatus} onChange={e=>setControl({...control,allocationStatus:e.target.value})}>{allocationStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
        {controlField('emptyReleaseOrderNo','Empty Release Order')}{controlField('emptyReleaseValidUntil','Release Valid Until','datetime-local')}{controlField('emptyDepot','Empty Depot')}{controlField('fullReturnTerminal','Full Return Terminal')}
        {controlField('pickupDate','Pickup Date','datetime-local')}{controlField('fullGateInAt','Full Gate In','datetime-local')}{controlField('dischargeAt','Discharge Date','datetime-local')}{controlField('deliveryAt','Delivery / Gate Out','datetime-local')}
        {controlField('demurrageFreeDays','Demurrage Free Days','number')}{controlField('demurrageFreeUntil','Demurrage Free Until','datetime-local')}{controlField('demurrageRatePerDay','Demurrage Rate / Day','number')}
        {controlField('detentionFreeDays','Detention Free Days','number')}{controlField('detentionFreeUntil','Detention Free Until','datetime-local')}{controlField('detentionRatePerDay','Detention Rate / Day','number')}
        {controlField('emptyReturnDue','Empty Return Due','datetime-local')}{controlField('emptyReturnedAt','Empty Returned At','datetime-local')}
        <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={control.freeTimeCurrency} onChange={e=>setControl({...control,freeTimeCurrency:e.target.value})}>{['USD','EUR','AED','GBP'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><span className="status">Demurrage: {selectedContainer.exposure?.demurrageDays||0} days · {selectedContainer.exposure?.currency||'USD'} {(selectedContainer.exposure?.demurrageExposure||0).toFixed(2)}</span><span className="status">Detention: {selectedContainer.exposure?.detentionDays||0} days · {selectedContainer.exposure?.currency||'USD'} {(selectedContainer.exposure?.detentionExposure||0).toFixed(2)}</span><div style={{marginLeft:'auto'}}><button className="btn" disabled={busy} onClick={saveControl}>{busy?'Saving…':'Save Equipment Controls'}</button></div></div>
    </div>}

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

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Container Exposure Register</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Container</th><th>Allocation</th><th>Provider</th><th>Depot</th><th>Demurrage Free Until</th><th>Detention Free Until</th><th>Empty Return Due</th><th>Exposure</th><th>Risk</th></tr></thead><tbody>
      {containers.map(c=><tr key={c.id} onClick={()=>chooseContainer(c.id)} style={{cursor:'pointer'}}><td><b>{c.containerNo}</b><div className="sub">{c.type} · {c.status}</div></td><td>{c.allocationStatus||'UNALLOCATED'}<div className="sub">{c.allocationRef||'-'}</div></td><td>{c.equipmentProvider||'-'}</td><td>{c.emptyDepot||'-'}</td><td>{c.demurrageFreeUntil?new Date(c.demurrageFreeUntil).toLocaleDateString():'-'}</td><td>{c.detentionFreeUntil?new Date(c.detentionFreeUntil).toLocaleDateString():'-'}</td><td>{c.emptyReturnDue?new Date(c.emptyReturnDue).toLocaleDateString():'-'}</td><td>{c.exposure?.currency||'USD'} {(c.exposure?.totalExposure||0).toFixed(2)}</td><td>{c.exposure?.demurrageAtRisk||c.exposure?.detentionAtRisk?<span className="status">AT RISK</span>:<span className="status">OK</span>}</td></tr>)}
      {containers.length===0&&<tr><td colSpan={9}>No containers registered on this booking.</td></tr>}
    </tbody></table></div></div>

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}><h3 style={{...sectionTitle,margin:0,flex:1}}>Movement History</h3><input style={{...fieldStyle,maxWidth:360}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search container, event, location or source"/></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Date / Time</th><th>Container</th><th>Event</th><th>Status</th><th>Location</th><th>Source</th><th>Reference</th><th>Actor</th><th>Remarks</th></tr></thead><tbody>
      {visible.map(m=><tr key={m.id}><td>{new Date(m.occurredAt).toLocaleString()}</td><td><b>{m.container?.containerNo||'-'}</b></td><td>{m.eventLabel}<div className="sub">{m.eventCode}</div></td><td><span className="status">{m.status||'-'}</span></td><td>{m.location||'-'}</td><td>{m.source||'-'}</td><td>{m.reference||'-'}</td><td>{m.actorId||'-'}</td><td>{m.remarks||'-'}</td></tr>)}
      {visible.length===0&&<tr><td colSpan={9}>No container movements recorded for this booking yet.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
