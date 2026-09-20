'use client';

import { useEffect, useMemo, useState } from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import {api,fmtDate,requireToken} from '../../lib/api';

type Customer={name:string;code?:string};
type Booking={id:string;bookingNo:string;shipmentNo?:string|null;shipmentStatus?:string|null;consolId?:string|null;status:string;customerReference?:string|null;houseBL?:string|null;masterBL?:string|null;origin:string;destination:string;portOfLoading?:string|null;portOfDischarge?:string|null;carrier?:string|null;vesselVoyage?:string|null;etd?:string|null;eta?:string|null;atd?:string|null;ata?:string|null;equipment?:string|null;quantity?:number|null;packageCount?:number|null;packageType?:string|null;grossWeight?:number|null;volumeCbm?:number|null;customer?:Customer;consol?:{id:string;consolNo:string;status:string;masterBL?:string|null;vessel?:string|null;voyage?:string|null;carrier?:string|null}|null};
type Consol={id:string;consolNo:string;mode:string;carrier?:string|null;serviceName?:string|null;masterBL?:string|null;vessel?:string|null;voyage?:string|null;origin:string;destination:string;portOfLoading:string;portOfDischarge:string;terminal?:string|null;etd:string;eta:string;atd?:string|null;ata?:string|null;status:string;remarks?:string|null;shipments:Array<{id:string;bookingNo:string;shipmentNo?:string|null;shipmentStatus?:string|null;bookingType?:string|null;quantity?:number|null;houseBL?:string|null;customerReference?:string|null;customer?:Customer;containers?:Array<{id:string;containerNo:string;status:string;type:string}>}>};
type Dashboard={houseShipments:number;unconsolidated:number;activeConsols:number;inTransit:number;arrived:number;departureBlocked:number};

const emptyDash:Dashboard={houseShipments:0,unconsolidated:0,activeConsols:0,inTransit:0,arrived:0,departureBlocked:0};
const blankConsol={consolNo:'',mode:'SEA',carrier:'',serviceName:'',masterBL:'',vessel:'',voyage:'',origin:'',destination:'',portOfLoading:'',portOfDischarge:'',terminal:'',etd:'',eta:'',remarks:''};
const toIso=(v:string)=>v?new Date(v).toISOString():null;

export default function ShipmentControlPage(){
  const [token,setToken]=useState('');
  const [dashboard,setDashboard]=useState<Dashboard>(emptyDash);
  const [shipments,setShipments]=useState<Booking[]>([]);
  const [consols,setConsols]=useState<Consol[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [shipmentBookingId,setShipmentBookingId]=useState('');
  const [contextBookingId,setContextBookingId]=useState('');
  const [shipmentNo,setShipmentNo]=useState('');
  const [consolForm,setConsolForm]=useState(blankConsol);
  const [assignTo,setAssignTo]=useState<Record<string,string>>({});
  const [showShipmentForm,setShowShipmentForm]=useState(false);
  const [showConsolForm,setShowConsolForm]=useState(false);
  const [search,setSearch]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const t=requireToken();if(!t)return;
    setToken(t);
    const params=new URLSearchParams(location.search);
    if(params.get('new')==='1')setShowShipmentForm(true);
    void load(t);
  },[]);

  async function load(t=token){
    try{
      const [d,s,c,b]=await Promise.all([
        api('/shipment-control/dashboard',t),
        api('/shipment-control/shipments',t),
        api('/shipment-control/consols',t),
        api('/bookings',t)
      ]);
      const shipmentRows=Array.isArray(s)?s:[];
      const bookingRows=Array.isArray(b)?b:[];
      setDashboard(d||emptyDash);
      setShipments(shipmentRows);
      setConsols(Array.isArray(c)?c:[]);
      setBookings(bookingRows);
      const contextId=new URLSearchParams(location.search).get('bookingId')||'';
      if(contextId){
        setContextBookingId(contextId);
        const selected=bookingRows.find((x:Booking)=>x.id===contextId);
        if(shipmentRows.some((x:Booking)=>x.id===contextId)){
          setSearch(selected?.bookingNo||'');
        }else if(selected){
          setShipmentBookingId(contextId);
          setShowShipmentForm(true);
        }
      }
    }catch(e:any){setMessage(e?.message||'Unable to load shipment control');}
  }

  async function promote(){
    if(!shipmentBookingId){setMessage('Select a booking first.');return;}
    setBusy(true);setMessage('');
    try{
      await api(`/shipment-control/shipments/from-booking/${shipmentBookingId}`,token,{method:'POST',body:JSON.stringify({shipmentNo:shipmentNo||undefined})});
      setShipmentBookingId('');setShipmentNo('');setShowShipmentForm(false);setMessage('Booking promoted to operational shipment.');await load();
    }catch(e:any){setMessage(e?.message||'Could not create shipment');}finally{setBusy(false);}
  }

  function setConsolField(k:keyof typeof blankConsol,v:string){setConsolForm(x=>({...x,[k]:v}));}
  async function createConsol(){
    if(!consolForm.origin.trim()||!consolForm.destination.trim()||!consolForm.etd||!consolForm.eta){setMessage('Origin, destination, ETD and ETA are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/shipment-control/consols',token,{method:'POST',body:JSON.stringify({...consolForm,portOfLoading:consolForm.portOfLoading||consolForm.origin,portOfDischarge:consolForm.portOfDischarge||consolForm.destination,etd:toIso(consolForm.etd),eta:toIso(consolForm.eta)})});
      setConsolForm(blankConsol);setShowConsolForm(false);setMessage('Consol created.');await load();
    }catch(e:any){setMessage(e?.message||'Could not create consol');}finally{setBusy(false);}
  }

  async function assign(bookingId:string){
    const consolId=assignTo[bookingId];
    if(!consolId){setMessage('Select a consol for this shipment.');return;}
    setBusy(true);setMessage('');
    try{await api(`/shipment-control/consols/${consolId}/assign/${bookingId}`,token,{method:'POST'});setMessage('Shipment assigned to consol and master movement synchronized.');await load();}
    catch(e:any){setMessage(e?.message||'Could not assign shipment');}finally{setBusy(false);}
  }

  async function unassign(consolId:string,bookingId:string){
    if(!confirm('Remove this shipment from the consol?'))return;
    setBusy(true);setMessage('');
    try{await api(`/shipment-control/consols/${consolId}/unassign/${bookingId}`,token,{method:'POST'});setMessage('Shipment removed from consol.');await load();}
    catch(e:any){setMessage(e?.message||'Could not remove shipment');}finally{setBusy(false);}
  }

  async function action(consolId:string,a:'confirm'|'depart'|'arrive'|'close'){
    if((a==='depart'||a==='close')&&!confirm(`${a==='depart'?'Depart':'Close'} this consol?`))return;
    setBusy(true);setMessage('');
    try{await api(`/shipment-control/consols/${consolId}/${a}`,token,{method:'POST'});setMessage(`Consol ${a} completed.`);await load();}
    catch(e:any){setMessage(e?.message||`Could not ${a} consol`);}finally{setBusy(false);}
  }

  const shipmentIds=useMemo(()=>new Set(shipments.map(s=>s.id)),[shipments]);
  const promotable=useMemo(()=>bookings.filter(b=>!shipmentIds.has(b.id)&&b.status!=='CANCELLED'),[bookings,shipmentIds]);
  const activeConsols=useMemo(()=>consols.filter(c=>['PLANNED','CONFIRMED'].includes(c.status)),[consols]);
  const readiness=(c:Consol)=>{
    const containers=c.shipments.flatMap(s=>s.containers||[]);
    const loadedOrBeyond=(s:string)=>['LOADED','DEPARTED','IN_TRANSIT','TRANSSHIPMENT','ARRIVED','DISCHARGED','GATED_OUT','DELIVERED','EMPTY_RETURNED'].includes(String(s||'').toUpperCase());
    const missingFcl=c.shipments.filter(s=>String(s.bookingType||'').toUpperCase()==='FCL'&&Number(s.quantity||0)>0&&(s.containers?.length||0)<Number(s.quantity||0));
    const notLoaded=containers.filter(x=>!loadedOrBeyond(x.status));
    return {ready:missingFcl.length===0&&notLoaded.length===0,total:containers.length,loaded:containers.length-notLoaded.length,missingFcl,notLoaded};
  };
  const visibleShipments=useMemo(()=>{const q=search.trim().toLowerCase();return shipments.filter(s=>!q||[s.shipmentNo,s.bookingNo,s.houseBL,s.masterBL,s.customer?.name,s.origin,s.destination,s.carrier,s.vesselVoyage,s.consol?.consolNo].some(v=>String(v||'').toLowerCase().includes(q)));},[shipments,search]);

  return <WorkspaceShell title="Shipment / Consol Control" subtitle="Promote bookings into operational shipments and manage master consol movements" active="/shipment-control" actions={<><button className="btn" onClick={()=>setShowShipmentForm(v=>!v)}>+ Shipment</button><button className="btn" onClick={()=>setShowConsolForm(v=>!v)}>+ Consol</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {contextBookingId&&<JobContextRail
      bookingId={contextBookingId}
      bookingNo={bookings.find(b=>b.id===contextBookingId)?.bookingNo}
      active="SHIPMENT"
      customer={bookings.find(b=>b.id===contextBookingId)?.customer?.name||''}
      route={(()=>{const b=bookings.find(x=>x.id===contextBookingId);return b?`${b.origin} → ${b.destination}`:''})()}
      carrier={bookings.find(b=>b.id===contextBookingId)?.carrier||''}
      vessel={bookings.find(b=>b.id===contextBookingId)?.vesselVoyage||''}
      equipment={(()=>{const b=bookings.find(x=>x.id===contextBookingId);return b?.equipment?`${b.quantity||1} × ${b.equipment}`:''})()}
      status={bookings.find(b=>b.id===contextBookingId)?.shipmentStatus||bookings.find(b=>b.id===contextBookingId)?.status||''}
      etd={fmtDate(bookings.find(b=>b.id===contextBookingId)?.etd)}
      eta={fmtDate(bookings.find(b=>b.id===contextBookingId)?.eta)}
    />}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:12}}>
      <Kpi l="House Shipments" v={dashboard.houseShipments}/><Kpi l="Unconsolidated" v={dashboard.unconsolidated}/><Kpi l="Active Consols" v={dashboard.activeConsols}/><Kpi l="Departure Blocked" v={dashboard.departureBlocked}/><Kpi l="In Transit" v={dashboard.inTransit}/><Kpi l="Arrived" v={dashboard.arrived}/>
    </div>

    {(showShipmentForm||showConsolForm)&&<div className="erp-workspace-grid">
    {showShipmentForm&&<div id="new-shipment" className="card erp-span-6 erp-panel-compact" style={{marginBottom:12}}><h3 style={sectionTitle}>Promote Booking to Shipment</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking</span><select value={shipmentBookingId} onChange={e=>setShipmentBookingId(e.target.value)} style={fieldStyle}><option value="">-- Select booking --</option>{promotable.map(b=><option key={b.id} value={b.id}>{b.bookingNo} — {b.customer?.name||''} — {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Shipment No. (optional)</span><input value={shipmentNo} onChange={e=>setShipmentNo(e.target.value)} placeholder="Auto from booking if blank" style={fieldStyle}/></label>
    </div><div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy} onClick={promote}>{busy?'Working...':'Create Shipment'}</button></div></div>}

    {showConsolForm&&<div className="card erp-span-6 erp-panel-compact" style={{marginBottom:12}}><h3 style={sectionTitle}>Create Master Consol</h3><div style={formGrid}>
      <Input l="Consol No. (optional)" v={consolForm.consolNo} onChange={v=>setConsolField('consolNo',v)}/><Input l="Mode" v={consolForm.mode} onChange={v=>setConsolField('mode',v)}/><Input l="Carrier" v={consolForm.carrier} onChange={v=>setConsolField('carrier',v)}/><Input l="Service" v={consolForm.serviceName} onChange={v=>setConsolField('serviceName',v)}/><Input l="Master B/L" v={consolForm.masterBL} onChange={v=>setConsolField('masterBL',v)}/><Input l="Vessel" v={consolForm.vessel} onChange={v=>setConsolField('vessel',v)}/><Input l="Voyage" v={consolForm.voyage} onChange={v=>setConsolField('voyage',v)}/><Input l="Origin" v={consolForm.origin} onChange={v=>setConsolField('origin',v)}/><Input l="Destination" v={consolForm.destination} onChange={v=>setConsolField('destination',v)}/><Input l="POL" v={consolForm.portOfLoading} onChange={v=>setConsolField('portOfLoading',v)}/><Input l="POD" v={consolForm.portOfDischarge} onChange={v=>setConsolField('portOfDischarge',v)}/><Input l="Terminal" v={consolForm.terminal} onChange={v=>setConsolField('terminal',v)}/><Input l="ETD" v={consolForm.etd} type="datetime-local" onChange={v=>setConsolField('etd',v)}/><Input l="ETA" v={consolForm.eta} type="datetime-local" onChange={v=>setConsolField('eta',v)}/>
    </div><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Remarks</span><textarea value={consolForm.remarks} onChange={e=>setConsolField('remarks',e.target.value)} style={{...fieldStyle,minHeight:64}}/></label><div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy} onClick={createConsol}>{busy?'Working...':'Create Consol'}</button></div></div>}
    </div>}

    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}><div><h3 style={{margin:0}}>House Shipment Register</h3><span className="sub">{visibleShipments.length} operational shipments</span></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shipment, HBL, customer..." style={{...fieldStyle,width:270}}/></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Shipment</th><th>Booking / Customer</th><th>Route</th><th>House / Master B/L</th><th>Main Movement</th><th>Cargo</th><th>Status</th><th>Consol Assignment</th></tr></thead><tbody>{visibleShipments.length===0?<tr><td colSpan={8}>No operational shipments yet.</td></tr>:visibleShipments.map(s=><tr key={s.id}><td><b>{s.shipmentNo}</b><div className="sub">{s.customerReference||''}</div></td><td><a href={`/bookings/${s.id}`} style={{fontWeight:800,color:'#123b61'}}>{s.bookingNo}</a><div className="sub">{s.customer?.name||''}</div></td><td>{s.origin} → {s.destination}<div className="sub">{s.portOfLoading||'-'} → {s.portOfDischarge||'-'}</div></td><td>{s.houseBL||'-'}<div className="sub">MBL {s.masterBL||'-'}</div></td><td>{s.carrier||'-'}<div className="sub">{s.vesselVoyage||'-'}</div><div className="sub">ETD {fmtDate(s.etd)} • ETA {fmtDate(s.eta)}</div></td><td>{s.equipment||'-'} × {s.quantity||'-'}<div className="sub">{s.packageCount||'-'} {s.packageType||''} • {s.grossWeight||'-'} kg • {s.volumeCbm||'-'} cbm</div></td><td><span className="status">{s.shipmentStatus||'OPEN'}</span><div className="sub">Booking {s.status}</div></td><td>{s.consol?<div><b>{s.consol.consolNo}</b><div className="sub">{s.consol.status} • {s.consol.masterBL||'No MBL'}</div>{['PLANNED','CONFIRMED'].includes(s.consol.status)&&<button className="btn" disabled={busy} style={{marginTop:5}} onClick={()=>unassign(s.consol!.id,s.id)}>Unassign</button>}</div>:<div style={{display:'flex',gap:6,minWidth:250}}><select value={assignTo[s.id]||''} onChange={e=>setAssignTo(x=>({...x,[s.id]:e.target.value}))} style={fieldStyle}><option value="">-- Select consol --</option>{activeConsols.map(c=><option key={c.id} value={c.id}>{c.consolNo} — {c.portOfLoading} → {c.portOfDischarge} — {fmtDate(c.etd)}</option>)}</select><button className="btn" disabled={busy} onClick={()=>assign(s.id)}>Assign</button></div>}</td></tr>)}</tbody></table></div>
    </div>

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div><h3 style={{margin:0}}>Master Consol Board</h3><span className="sub">{consols.length} consol movements</span></div></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Consol / MBL</th><th>Carrier / Vessel</th><th>Route</th><th>Schedule</th><th>Shipments</th><th>Load Readiness</th><th>Status</th><th>Action</th></tr></thead><tbody>{consols.length===0?<tr><td colSpan={8}>No consols created.</td></tr>:consols.map(c=>{const r=readiness(c);return <tr key={c.id}><td><b>{c.consolNo}</b><div className="sub">{c.masterBL||'No MBL assigned'}</div></td><td>{c.carrier||'-'}<div className="sub">{c.vessel||'-'} {c.voyage?`/ ${c.voyage}`:''}</div></td><td>{c.portOfLoading} → {c.portOfDischarge}<div className="sub">{c.origin} → {c.destination}</div></td><td>ETD {fmtDate(c.etd)}<div className="sub">ETA {fmtDate(c.eta)}</div>{c.atd&&<div className="sub">ATD {fmtDate(c.atd)}</div>}{c.ata&&<div className="sub">ATA {fmtDate(c.ata)}</div>}</td><td><b>{c.shipments.length}</b><div className="sub">{c.shipments.slice(0,3).map(s=>s.shipmentNo||s.bookingNo).join(', ')}{c.shipments.length>3?'…':''}</div></td><td><span className="status">{r.ready?'READY':'BLOCKED'}</span><div className="sub">{r.loaded}/{r.total} containers loaded+</div>{r.missingFcl.length>0&&<div className="sub">FCL equipment incomplete: {r.missingFcl.map(s=>s.shipmentNo||s.bookingNo).join(', ')}</div>}{r.notLoaded.length>0&&<div className="sub">Not loaded: {r.notLoaded.slice(0,3).map(x=>x.containerNo).join(', ')}{r.notLoaded.length>3?'…':''}</div>}</td><td><span className="status">{c.status}</span></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap',minWidth:190}}>{c.status==='PLANNED'&&<button className="btn" disabled={busy} onClick={()=>action(c.id,'confirm')}>Confirm</button>}{c.status==='CONFIRMED'&&<button className="btn" disabled={busy||!r.ready} title={!r.ready?'Resolve load-readiness blockers before departure':''} onClick={()=>action(c.id,'depart')}>Depart</button>}{c.status==='DEPARTED'&&<button className="btn" disabled={busy} onClick={()=>action(c.id,'arrive')}>Arrive</button>}{c.status==='ARRIVED'&&<button className="btn" disabled={busy} onClick={()=>action(c.id,'close')}>Close</button>}</div></td></tr>})}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}

function Kpi({l,v}:{l:string;v:number}){return <div className="card"><div className="sub">{l}</div><div className="kpi">{v}</div></div>;}
function Input({l,v,onChange,type='text'}:{l:string;v:string;onChange:(v:string)=>void;type?:string}){return <label><span style={labelStyle}>{l}</span><input type={type} value={v} onChange={e=>onChange(e.target.value)} style={fieldStyle}/></label>;}
