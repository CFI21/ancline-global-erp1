'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import {api,requireToken} from '../../lib/api';

export default function CarrierOperationsPage(){
  const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [dashboard,setDashboard]=useState<any>({}),[rows,setRows]=useState<any[]>([]),[carriers,setCarriers]=useState<any[]>([]),[bookings,setBookings]=useState<any[]>([]),[schedules,setSchedules]=useState<any[]>([]),[capacity,setCapacity]=useState<any[]>([]),[exceptions,setExceptions]=useState<any[]>([]);
  const [form,setForm]=useState<any>({bookingId:'',carrierId:'',scheduleId:'',equipmentType:'40HC',quantity:1,notes:''});

  async function load(t=token){if(!t)return;setBusy(true);setMessage('');try{const [d,r,c,b,s,cap,ex]=await Promise.all([api('/carrier-operations/dashboard',t),api('/carrier-operations/carrier-bookings',t),api('/carrier-operations/carriers',t),api('/carrier-operations/bookings',t),api('/carrier-operations/schedules',t),api('/carrier-operations/capacity',t),api('/carrier-operations/exceptions',t)]);setDashboard(d);setRows(r);setCarriers(c);setBookings(b);setSchedules(s);setCapacity(cap);setExceptions(ex);const contextId=new URLSearchParams(location.search).get('bookingId')||'';if(contextId){const selected=(Array.isArray(b)?b:[]).find((x:any)=>x.id===contextId);if(selected)setForm((x:any)=>({...x,bookingId:contextId,equipmentType:selected.equipment||x.equipmentType,quantity:selected.quantity||1}));}}catch(e:any){setMessage(e.message||'Unable to load carrier operations');}finally{setBusy(false);}}
  useEffect(()=>{const t=requireToken();if(t){setToken(t);load(t);}},[]);

  const selectedBooking=useMemo(()=>bookings.find((x:any)=>x.id===form.bookingId),[bookings,form.bookingId]);
  function setBooking(id:string){const b=bookings.find((x:any)=>x.id===id);setForm({...form,bookingId:id,equipmentType:b?.equipment||form.equipmentType,quantity:b?.quantity||1});}
  async function create(){setBusy(true);try{await api('/carrier-operations/carrier-bookings',token,{method:'POST',body:JSON.stringify(form)});setMessage('Carrier booking request created.');setForm({...form,bookingId:'',notes:''});await load();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
  async function act(path:string,body:any,msg:string){setBusy(true);try{await api(path,token,{method:'POST',body:JSON.stringify(body)});setMessage(msg);await load();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
  function confirm(x:any){const v=window.prompt('Carrier booking / confirmation number',x.carrierBookingNo||'');if(v)act('/carrier-operations/carrier-bookings/'+x.carrierOperationNo+'/confirm',{carrierBookingNo:v},'Carrier confirmation recorded.');}
  function allocate(x:any){const v=window.prompt('Space allocation reference',x.allocationRef||x.carrierBookingNo||'');if(v)act('/carrier-operations/carrier-bookings/'+x.carrierOperationNo+'/allocate',{allocationRef:v},'Space allocated.');}
  function release(x:any){const no=window.prompt('Empty release order number',x.releaseOrderNo||'');if(!no)return;const depot=window.prompt('Empty pickup depot',x.emptyDepot||'');if(!depot)return;const d=new Date(Date.now()+7*86400000).toISOString().slice(0,10),valid=window.prompt('Release valid until (YYYY-MM-DD)',d);if(valid)act('/carrier-operations/carrier-bookings/'+x.carrierOperationNo+'/equipment-release',{releaseOrderNo:no,emptyDepot:depot,releaseValidUntil:valid},'Equipment release recorded.');}
  function roll(x:any){const target=window.prompt('New schedule ID (copy from Capacity Board below)','');if(!target)return;const reason=window.prompt('Roll reason','Carrier / schedule change');if(reason)act('/carrier-operations/carrier-bookings/'+x.carrierOperationNo+'/roll',{scheduleId:target,reason},'Carrier booking rolled to new sailing.');}
  function cancel(x:any){const reason=window.prompt('Cancellation reason','');if(reason)act('/carrier-operations/carrier-bookings/'+x.carrierOperationNo+'/cancel',{reason},'Carrier booking control record cancelled.');}
  const card=(label:string,value:any)=><div className="card"><div className="sub">{label}</div><div style={{fontSize:24,fontWeight:800}}>{value??0}</div></div>;

  return <WorkspaceShell title="Carrier Booking / Space Control" subtitle="Ocean carrier confirmation, allocation, equipment release, sailing capacity and cutoff exposure" active="/carrier-operations" actions={<button className="btn" disabled={busy} onClick={()=>load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {form.bookingId&&<JobContextRail
      bookingId={form.bookingId}
      bookingNo={selectedBooking?.bookingNo}
      active="CARRIER"
      route={selectedBooking?`${selectedBooking.origin} → ${selectedBooking.destination}`:''}
      carrier={carriers.find((x:any)=>x.id===form.carrierId)?.name||''}
      equipment={form.equipmentType?`${form.quantity||1} × ${form.equipmentType}`:''}
      status={selectedBooking?.status||''}
    />}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:10,marginBottom:14}}>{card('Active carrier bookings',dashboard.activeCarrierBookings)}{card('Awaiting confirmation',dashboard.awaitingConfirmation)}{card('Awaiting allocation',dashboard.awaitingAllocation)}{card('Awaiting release',dashboard.awaitingEquipmentRelease)}{card('Cutoff alerts',dashboard.cutoffAlerts)}{card('Tight sailings',dashboard.tightSailings)}</div>

    <div className="card" style={{marginBottom:14}}><h3 style={sectionTitle}>Create Carrier Booking Request</h3><div style={formGrid}>
      <div><label style={labelStyle}>Customer Booking</label><select style={fieldStyle} value={form.bookingId} onChange={e=>setBooking(e.target.value)}><option value="">Select booking</option>{bookings.map((b:any)=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></div>
      <div><label style={labelStyle}>Carrier</label><select style={fieldStyle} value={form.carrierId} onChange={e=>setForm({...form,carrierId:e.target.value})}><option value="">Select carrier</option>{carriers.map((c:any)=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
      <div><label style={labelStyle}>Sailing</label><select style={fieldStyle} value={form.scheduleId} onChange={e=>setForm({...form,scheduleId:e.target.value})}><option value="">Select schedule</option>{schedules.map((s:any)=><option key={s.id} value={s.id}>{s.scheduleNo} · {s.carrier} · {s.vessel}/{s.voyage} · {new Date(s.etd).toLocaleDateString()}</option>)}</select></div>
      <div><label style={labelStyle}>Equipment</label><input style={fieldStyle} value={form.equipmentType} onChange={e=>setForm({...form,equipmentType:e.target.value})}/></div>
      <div><label style={labelStyle}>Quantity</label><input style={fieldStyle} type="number" min={1} value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/></div>
      <div><label style={labelStyle}>Notes</label><input style={fieldStyle} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
    </div>{selectedBooking&&<div className="sub" style={{marginTop:8}}>Booking state: {selectedBooking.status} · slot {selectedBooking.slotStatus||'—'} · equipment {selectedBooking.equipmentStatus||'—'}</div>}<button className="btn" style={{marginTop:10}} disabled={busy||!form.bookingId||!form.carrierId||!form.scheduleId} onClick={create}>Request Carrier Booking</button></div>

    <div className="card" style={{marginBottom:14}}><h3 style={sectionTitle}>Carrier Booking Execution</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Control Ref</th><th>Booking</th><th>Carrier</th><th>Sailing</th><th>ETD</th><th>TEU</th><th>Confirmation</th><th>Allocation</th><th>Equipment</th><th>Actions</th></tr></thead><tbody>{rows.map((x:any)=><tr key={x.carrierOperationNo}><td>{x.carrierOperationNo}</td><td>{x.bookingNo}</td><td>{x.carrierName}</td><td>{x.vessel}/{x.voyage}<div className="sub">{x.scheduleNo}</div></td><td>{x.etd?new Date(x.etd).toLocaleString():'—'}</td><td>{x.spaceTeu}</td><td>{x.confirmationStatus}<div className="sub">{x.carrierBookingNo||''}</div></td><td>{x.allocationStatus}<div className="sub">{x.allocationRef||''}</div></td><td>{x.equipmentReleaseStatus}<div className="sub">{x.releaseOrderNo||''}</div></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{['REQUESTED','ROLLED'].includes(x.status)&&<button className="btn" onClick={()=>confirm(x)}>Confirm</button>}{x.status==='CONFIRMED'&&x.allocationStatus!=='ALLOCATED'&&<button className="btn" onClick={()=>allocate(x)}>Allocate</button>}{x.allocationStatus==='ALLOCATED'&&x.equipmentReleaseStatus!=='RELEASED'&&<button className="btn" onClick={()=>release(x)}>Release</button>}{x.status!=='CANCELLED'&&<button className="btn" onClick={()=>roll(x)}>Roll</button>}{x.status!=='CANCELLED'&&<button className="btn" onClick={()=>cancel(x)}>Cancel</button>}</div></td></tr>)}</tbody></table></div></div>

    <div className="card" style={{marginBottom:14}}><h3 style={sectionTitle}>Sailing Capacity Board</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Schedule ID</th><th>Sailing</th><th>Carrier</th><th>Lane</th><th>ETD</th><th>Allocated</th><th>Capacity</th><th>Remaining</th><th>Utilization</th><th>Status</th></tr></thead><tbody>{capacity.map((x:any)=><tr key={x.scheduleId}><td style={{fontSize:11}}>{x.scheduleId}</td><td>{x.vessel}/{x.voyage}<div className="sub">{x.scheduleNo}</div></td><td>{x.carrier}</td><td>{x.portOfLoading} → {x.portOfDischarge}</td><td>{new Date(x.etd).toLocaleString()}</td><td>{x.allocatedTeu} TEU</td><td>{x.capacityTeu==null?'—':x.capacityTeu+' TEU'}</td><td>{x.remainingTeu==null?'—':x.remainingTeu+' TEU'}</td><td>{x.utilizationPct==null?'—':x.utilizationPct+'%'}</td><td>{x.status}</td></tr>)}</tbody></table></div></div>

    <div className="card"><h3 style={sectionTitle}>Cutoff / Carrier Exceptions</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Severity</th><th>Booking</th><th>Carrier / Sailing</th><th>Next cutoff</th><th>Hours</th><th>Missing controls</th><th>Carrier match</th></tr></thead><tbody>{exceptions.map((x:any)=><tr key={x.carrierOperationNo}><td>{x.severity}</td><td>{x.bookingNo}</td><td>{x.carrierName}<div className="sub">{x.vessel}/{x.voyage}</div></td><td>{x.nextCutoff?new Date(x.nextCutoff).toLocaleString():'—'}</td><td>{x.hoursToCutoff??'—'}</td><td>{(x.missing||[]).join(', ')||'—'}</td><td>{x.carrierScheduleMismatch?'CHECK':'OK'}</td></tr>)}</tbody></table></div></div>
  </WorkspaceShell>;
}
