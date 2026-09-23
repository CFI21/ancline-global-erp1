'use client';
import {useEffect,useMemo,useState} from 'react';
import {api,currentUser,fmtDate,requireToken} from '../../lib/api';
import WorkspaceShell from '../../components/WorkspaceShell';
import PortalRateBooking from '../../components/PortalRateBooking';
import ForwardingBookingChanges from '../../components/ForwardingBookingChanges';
import ExternalPortalCommunications from '../../components/ExternalPortalCommunications';

type Movement={id:string;eventCode:string;eventLabel:string;status?:string;location?:string;occurredAt:string;source?:string;containerNo?:string};
type Milestone={id:string;code:string;label:string;location?:string;plannedAt?:string;actualAt?:string;status:string;source?:string};
type Doc={id:string;documentNo?:string;type:string;status:string;version?:number};
type Container={id:string;containerNo:string;type:string;status:string;location?:string;sealNo?:string;movements:Movement[]};
type Booking={id:string;bookingNo:string;status:string;origin:string;destination:string;portOfLoading?:string;portOfDischarge?:string;terminal?:string;etd?:string;eta?:string;atd?:string;ata?:string;carrier?:string;vesselVoyage?:string;houseBL?:string;masterBL?:string;customer?:{id:string;name:string};documents:Doc[];containers:Container[];milestones:Milestone[];latestMovement?:Movement|null;progress?:{completed:number;total:number;nextMilestone?:Milestone|null}};

function transitState(b:Booking){const code=String(b.latestMovement?.eventCode||'').toUpperCase();return ['LOADED','DEPARTED','TRANSSHIPMENT'].includes(code);}

export default function CustomerPortal(){
  const [rows,setRows]=useState<Booking[]>([]),[err,setErr]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<string>('');
  const [loading,setLoading]=useState(true);const user=currentUser();const portalRole=String(user?.role||'CUSTOMER').toUpperCase() as 'CUSTOMER'|'SHIPPER'|'CONSIGNEE'|'AGENT'|'GLOBAL_ADMIN';const agentForwarding=portalRole==='AGENT'&&Array.isArray(user?.permissions)&&user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE');
  useEffect(()=>{const token=requireToken();if(!token)return;const u=currentUser();if(u?.role&&!['CUSTOMER','SHIPPER','CONSIGNEE','GLOBAL_ADMIN'].includes(String(u.role))&&!(String(u.role)==='AGENT'&&Array.isArray(u?.permissions)&&u.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE'))){location.replace('/');return;}api('/portal/bookings',token).then(x=>setRows(Array.isArray(x)?x:[])).catch(e=>setErr(e.message)).finally(()=>setLoading(false));},[]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(b=>!q||[b.bookingNo,b.origin,b.destination,b.status,b.carrier,b.vesselVoyage,b.houseBL,b.masterBL,b.customer?.name,b.latestMovement?.eventLabel,b.latestMovement?.location,...(b.containers||[]).map(c=>c.containerNo)].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);
  const active=rows.filter(b=>!['FINANCIALLY_CLOSED','CANCELLED'].includes(String(b.status).toUpperCase())).length;
  const inTransit=rows.filter(transitState).length;
  const releasedDocs=rows.reduce((n,b)=>n+(b.documents||[]).length,0);
  const selectedBooking=rows.find(b=>b.id===selected);

  return <WorkspaceShell
    title={portalRole==='GLOBAL_ADMIN'?'Forwarding Portal Administration':portalRole==='AGENT'?'Agent Direct Co-load / Cross Trade':'My Forwarding Shipments'}
    subtitle={`GLOBAL ANCLINE FORWARDING · ${portalRole} · automated carrier booking · live operational visibility · ${user?.email||''}`}
    active="/customer-portal"
    actions={<>
      <a className="btn" href="#new-booking" style={{textDecoration:'none'}}>+ New Forwarding Booking</a>
      {portalRole==='GLOBAL_ADMIN'&&<a className="btn" href="/shipment-control?new=1" style={{textDecoration:'none'}}>+ New Shipment</a>}
      {portalRole==='GLOBAL_ADMIN'&&<a className="btn" href="/nvocc-portal" style={{textDecoration:'none'}}>NVOCC Portal</a>}
      {agentForwarding&&<a className="btn" href="/nvocc-portal" style={{textDecoration:'none'}}>Back to Liner Agency</a>}
      <button className="btn" onClick={()=>location.reload()}>Refresh</button>
    </>}
  >
    {err&&<div className="card" style={{marginBottom:12}}>Portal notice: {err}</div>}
    <div id="new-booking"><PortalRateBooking token={requireToken()||''} role={portalRole} onBooked={()=>location.reload()}/></div>
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">TOTAL SHIPMENTS</div><div className="kpi">{loading?'…':rows.length}</div></div><div className="card"><div className="sub">ACTIVE</div><div className="kpi">{loading?'…':active}</div></div><div className="card"><div className="sub">IN TRANSIT</div><div className="kpi">{loading?'…':inTransit}</div></div><div className="card"><div className="sub">RELEASED DOCUMENTS</div><div className="kpi">{loading?'…':releasedDocs}</div></div></div>
    <div className="card" style={{marginBottom:12}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search booking, B/L, vessel, route, status or container" style={{width:'100%',maxWidth:520,padding:9,border:'1px solid #cfd9e2',borderRadius:6}}/></div>
    <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Route</th><th>Vessel / Voyage</th><th>ETD</th><th>ETA</th><th>Latest Event</th><th>Status</th><th></th></tr></thead><tbody>{visible.map(b=><tr key={b.id}><td><b>{b.bookingNo}</b><div className="sub">{b.houseBL||b.masterBL||''}</div></td><td>{b.origin} → {b.destination}</td><td>{b.vesselVoyage||'-'}<div className="sub">{b.carrier||''}</div></td><td>{fmtDate(b.atd||b.etd)}</td><td>{fmtDate(b.ata||b.eta)}</td><td>{b.latestMovement?.eventLabel||'-'}<div className="sub">{b.latestMovement?.location||''}</div></td><td><span className="status">{b.status}</span></td><td><button className="btn" onClick={()=>setSelected(selected===b.id?'':b.id)}>{selected===b.id?'Close':'Track'}</button></td></tr>)}{!loading&&visible.length===0&&<tr><td colSpan={8}>No shipments found.</td></tr>}</tbody></table></div></div>

    <ExternalPortalCommunications />

    {selectedBooking&&<div className="card" style={{marginTop:12}}><div className="top"><div><div className="sub">SHIPMENT TRACKING</div><h2 style={{margin:'2px 0'}}>{selectedBooking.bookingNo}</h2><div className="sub">{selectedBooking.origin} → {selectedBooking.destination}</div></div><span className="status">{selectedBooking.status}</span></div>
      <div className="grid" style={{marginBottom:14}}><div><div className="sub">CARRIER</div><b>{selectedBooking.carrier||'-'}</b></div><div><div className="sub">VESSEL / VOYAGE</div><b>{selectedBooking.vesselVoyage||'-'}</b></div><div><div className="sub">ETD / ATD</div><b>{fmtDate(selectedBooking.atd||selectedBooking.etd)}</b></div><div><div className="sub">ETA / ATA</div><b>{fmtDate(selectedBooking.ata||selectedBooking.eta)}</b></div><div><div className="sub">PROGRESS</div><b>{selectedBooking.progress?.completed||0}/{selectedBooking.progress?.total||0} milestones</b></div></div>
      <h3>Shipment Timeline</h3><div style={{display:'grid',gap:8}}>{selectedBooking.milestones?.map(m=><div key={m.id} style={{border:'1px solid #e1e7ed',borderRadius:8,padding:10}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><b>{m.label}</b><div className="sub">{m.location||'-'} · {m.actualAt?`Actual ${fmtDate(m.actualAt)}`:m.plannedAt?`Planned ${fmtDate(m.plannedAt)}`:'Date pending'}</div></div><span className="status">{m.status}</span></div></div>)}{!selectedBooking.milestones?.length&&<div>No shipment milestones available yet.</div>}</div>
      <h3 style={{marginTop:16}}>Containers</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Container</th><th>Type</th><th>Seal</th><th>Status</th><th>Current Location</th><th>Latest Movement</th></tr></thead><tbody>{selectedBooking.containers?.map(c=><tr key={c.id}><td><b>{c.containerNo}</b></td><td>{c.type}</td><td>{c.sealNo||'-'}</td><td><span className="status">{c.status}</span></td><td>{c.location||'-'}</td><td>{c.movements?.[0]?.eventLabel||'-'}<div className="sub">{fmtDate(c.movements?.[0]?.occurredAt)}</div></td></tr>)}{!selectedBooking.containers?.length&&<tr><td colSpan={6}>No containers assigned yet.</td></tr>}</tbody></table></div>
      <h3 style={{marginTop:16}}>Released Documents</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Document</th><th>Type</th><th>Version</th><th>Status</th></tr></thead><tbody>{selectedBooking.documents?.map(d=><tr key={d.id}><td><b>{d.documentNo||'-'}</b></td><td>{d.type}</td><td>{d.version||1}</td><td><span className="status">{d.status}</span></td></tr>)}{!selectedBooking.documents?.length&&<tr><td colSpan={4}>No released customer documents available yet.</td></tr>}</tbody></table></div>
      <ForwardingBookingChanges bookingId={selectedBooking.id} token={requireToken()||''} onChanged={()=>location.reload()}/>
    </div>}
  </WorkspaceShell>;
}
