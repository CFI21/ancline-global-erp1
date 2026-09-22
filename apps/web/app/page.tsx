'use client';

import {useEffect,useMemo,useState} from 'react';
import {api,currentUser,requireToken} from '../lib/api';
import WorkspaceShell from '../components/WorkspaceShell';

type Health={status?:string};
type Booking={
  id:string;
  bookingNo?:string;
  businessModel?:string;
  bookingChannel?:string;
  shipmentNo?:string;
  shipmentStatus?:string;
  status?:string;
  origin?:string;
  destination?:string;
  carrier?:string;
  etd?:string;
  eta?:string;
  customer?:{name?:string}|null;
};

const lifecycle=[
  'DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED',
  'BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE',
  'CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED'
] as const;
const terminal=new Set(['COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);
const transitShipmentStates=new Set(['DEPARTED','IN_TRANSIT','TRANSSHIPMENT','ARRIVED','DISCHARGED','GATED_OUT']);
const rank=(status?:string)=>lifecycle.indexOf(String(status||'DRAFT').toUpperCase() as any);

export default function Home(){
  const [health,setHealth]=useState<Health>({status:'checking'});
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    const token=requireToken();if(!token)return;
    const user=currentUser();
    if(['CUSTOMER','SHIPPER','CONSIGNEE'].includes(String(user?.role||''))){location.replace('/customer-portal');return;}
    if(['AGENT','BRANCH_OPS'].includes(String(user?.role||''))){location.replace('/nvocc-portal');return;}
    void load(token);
  },[]);

  async function load(token:string){
    try{
      const [h,b]=await Promise.all([api('/health'),api('/bookings',token)]);
      setHealth(h&&typeof h==='object'?h:{status:'offline'});
      setBookings(Array.isArray(b)?b:[]);
    }catch(e:any){
      setBookings([]);
      setError(e?.message||'Unable to load dashboard data');
    }finally{setLoading(false);}
  }

  const summary=useMemo(()=>{
    const active=bookings.filter(b=>!terminal.has(String(b.status||'').toUpperCase()));
    const confirmedIndex=rank('CONFIRMED');
    return {
      active:active.length,
      inTransit:active.filter(b=>String(b.status||'').toUpperCase()==='OPERATIONAL'||transitShipmentStates.has(String(b.shipmentStatus||'').toUpperCase())).length,
      awaitingConfirmation:active.filter(b=>{
        const r=rank(b.status);
        return r>=0&&r<confirmedIndex;
      }).length,
      closed:bookings.filter(b=>terminal.has(String(b.status||'').toUpperCase())).length,
      nvocc:active.filter(b=>String(b.businessModel||'NVOCC').toUpperCase()==='NVOCC').length,
      forwarding:active.filter(b=>String(b.businessModel||'').toUpperCase()==='FORWARDING').length
    };
  },[bookings]);

  return <WorkspaceShell
    title="Global Control Tower"
    subtitle="ANCLINE operational command center · NVOCC + Global Forwarding"
    active="/"
    actions={<>
      <a className="btn" href="/bookings?new=1" style={{textDecoration:'none'}}>+ New NVOCC Booking</a>
      <a className="btn" href="/customer-portal#new-booking" style={{textDecoration:'none'}}>+ New Forwarding Booking</a>
      <a className="btn" href="/shipment-control?new=1" style={{textDecoration:'none'}}>+ New Shipment</a>
      <div className="status">API: {health.status||'unknown'}</div>
    </>}
  >
    {error&&<div className="card" style={{marginBottom:16}}>Dashboard notice: {error}</div>}

    <div className="grid">
      <div className="card"><div className="sub">ACTIVE JOBS</div><div className="kpi">{loading?'…':summary.active}</div></div>
      <div className="card"><div className="sub">IN TRANSIT / OPERATIONAL</div><div className="kpi">{loading?'…':summary.inTransit}</div></div>
      <div className="card"><div className="sub">AWAITING CONFIRMATION</div><div className="kpi">{loading?'…':summary.awaitingConfirmation}</div></div>
      <div className="card"><div className="sub">CLOSED / CANCELLED</div><div className="kpi">{loading?'…':summary.closed}</div></div>
      <div className="card"><div className="sub">ACTIVE NVOCC</div><div className="kpi">{loading?'…':summary.nvocc}</div></div>
      <div className="card"><div className="sub">ACTIVE FORWARDING</div><div className="kpi">{loading?'…':summary.forwarding}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><h3 style={{margin:'0 0 3px'}}>Recent Jobs</h3><div className="sub">One register across NVOCC and Forwarding execution.</div></div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <a className="btn" href="/nvocc-portal" style={{textDecoration:'none'}}>NVOCC Portal</a>
          <a className="btn" href="/customer-portal" style={{textDecoration:'none'}}>Global Forwarding Portal</a>
          <a className="btn" href="/booking-control" style={{textDecoration:'none'}}>Booking Control</a>
        </div>
      </div>
      <div style={{overflowX:'auto',marginTop:10}}><table className="table"><thead><tr><th>Job</th><th>Model</th><th>Shipment</th><th>Status</th><th>Route</th><th>Carrier</th><th>ETD / ETA</th><th>Customer</th><th></th></tr></thead><tbody>
        {bookings.slice(0,20).map(b=><tr key={b.id}>
          <td><b>{b.bookingNo||'-'}</b><div className="sub">{b.bookingChannel||'INTERNAL'}</div></td>
          <td><span className="status">{String(b.businessModel||'NVOCC').toUpperCase()}</span></td>
          <td>{b.shipmentNo||'-'}<div className="sub">{b.shipmentStatus||'BOOKED'}</div></td>
          <td><span className="status">{b.status||'-'}</span></td>
          <td>{b.origin||'-'} → {b.destination||'-'}</td>
          <td>{b.carrier||'-'}</td>
          <td>{b.etd?new Date(b.etd).toLocaleDateString():'-'}<div className="sub">{b.eta?new Date(b.eta).toLocaleDateString():'-'}</div></td>
          <td>{b.customer?.name||'-'}</td>
          <td><a href={`/bookings/${b.id}`}>Open</a></td>
        </tr>)}
        {!loading&&bookings.length===0&&<tr><td colSpan={9}>No bookings to display.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
