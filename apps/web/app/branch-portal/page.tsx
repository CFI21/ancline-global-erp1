'use client';
import {useEffect,useMemo,useState} from 'react';
import {api,currentUser,fmtDate,requireToken,signOut} from '../../lib/api';
import PortalRateBooking from '../../components/PortalRateBooking';

type Booking={id:string;bookingNo:string;businessModel?:string;bookingChannel?:string;status:string;origin:string;destination:string;carrier?:string;vesselVoyage?:string;etd?:string;eta?:string;customer?:{id:string;name:string};documents?:any[];containers?:any[];progress?:{completed:number;total:number;nextMilestone?:any|null};latestMovement?:any|null};

export default function BranchPortal(){
  const [rows,setRows]=useState<Booking[]>([]),[err,setErr]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(true);
  const user=currentUser();
  useEffect(()=>{const token=requireToken();if(!token)return;const u=currentUser();if(u?.role&&u.role!=='BRANCH_OPS'){location.replace('/');return;}api('/portal/bookings',token).then(x=>setRows(Array.isArray(x)?x:[])).catch(e=>setErr(e.message)).finally(()=>setLoading(false));},[]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(b=>!q||[b.bookingNo,b.customer?.name,b.origin,b.destination,b.carrier,b.vesselVoyage,b.status,b.bookingChannel].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);
  const active=rows.filter(b=>!['FINANCIALLY_CLOSED','CANCELLED'].includes(String(b.status).toUpperCase())).length;
  const pendingRelease=rows.reduce((n,b)=>n+(b.documents||[]).filter((d:any)=>String(d.status||'').toUpperCase()!=='RELEASED').length,0);

  return <main style={{padding:18,maxWidth:1280,margin:'0 auto'}}>
    <div className="top"><div><div className="sub">BRANCH OFFICE FORWARDING PORTAL</div><h1 style={{margin:'2px 0'}}>Forwarding Desk</h1><div className="sub">Global rates · direct booking · payment/security release control · {user?.email||''}</div></div><div style={{display:'flex',gap:8}}><button className="btn" onClick={()=>location.reload()}>Refresh</button><button className="btn" onClick={signOut}>Sign out</button></div></div>
    {err&&<div className="card" style={{marginBottom:12}}>Portal notice: {err}</div>}
    <PortalRateBooking token={requireToken()||''} role="BRANCH_OPS" onBooked={()=>location.reload()}/>
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">FORWARDING JOBS</div><div className="kpi">{loading?'…':rows.length}</div></div>
      <div className="card"><div className="sub">ACTIVE</div><div className="kpi">{loading?'…':active}</div></div>
      <div className="card"><div className="sub">PENDING RELEASE ITEMS</div><div className="kpi">{loading?'…':pendingRelease}</div></div>
      <div className="card"><div className="sub">MODEL</div><div className="kpi" style={{fontSize:20}}>FORWARDING</div></div>
    </div>
    <div className="card" style={{marginBottom:12}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search forwarding booking, customer, route, carrier or status" style={{width:'100%',maxWidth:560,padding:9,border:'1px solid #cfd9e2',borderRadius:6}}/></div>
    <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Channel</th><th>Customer</th><th>Route</th><th>Carrier / Vessel</th><th>ETD</th><th>ETA</th><th>Status</th></tr></thead><tbody>
      {visible.map(b=><tr key={b.id}><td><b>{b.bookingNo}</b><div className="sub">{b.businessModel||'FORWARDING'}</div></td><td>{b.bookingChannel||'BRANCH_PORTAL'}</td><td>{b.customer?.name||'-'}</td><td>{b.origin} → {b.destination}</td><td>{b.carrier||'-'}<div className="sub">{b.vesselVoyage||''}</div></td><td>{fmtDate(b.etd)}</td><td>{fmtDate(b.eta)}</td><td><span className="status">{b.status}</span></td></tr>)}
      {!loading&&visible.length===0&&<tr><td colSpan={8}>No forwarding jobs found for this branch.</td></tr>}
    </tbody></table></div></div>
  </main>;
}
