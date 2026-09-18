'use client';

import {useEffect,useState} from 'react';
import {api,currentUser,requireToken,signOut} from '../lib/api';

type Health={status?:string};
type Booking={id:string;bookingNo?:string;status?:string;origin?:string;destination?:string;customer?:{name?:string}|null};

export default function Home(){
  const [health,setHealth]=useState<Health>({status:'checking'});
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    const token=requireToken();if(!token)return;
    const user=currentUser();
    if(user?.role==='CUSTOMER'){location.replace('/customer-portal');return;}
    if(user?.role==='AGENT'){location.replace('/agent-portal');return;}
    if(user?.role==='BRANCH_OPS'){location.replace('/branch-portal');return;}
    void load(token);
  },[]);

  async function load(token:string){
    try{
      const [h,b]=await Promise.all([api('/health'),api('/bookings',token)]);
      setHealth(h&&typeof h==='object'?h:{status:'offline'});setBookings(Array.isArray(b)?b:[]);
    }catch(e:any){setBookings([]);setError(e?.message||'Unable to load dashboard data');}
    finally{setLoading(false);}
  }

  return <div className="shell">
    <aside className="side"><div className="brand">ANCLINE WORLDWIDE</div><a href="/">Control Tower</a><a href="/bookings">Bookings</a><a href="/organizations">Organizations</a><a href="/rates">Rates / Quotes</a><a href="/documents">Documents</a><a href="/finance">Finance</a><a href="/approvals">Approvals</a><a href="/tasks">My Work</a></aside>
    <main className="main">
      <div className="top"><div><h1 style={{margin:0}}>Global Control Tower</h1><div className="sub">ANCLINE operational command center</div></div><div style={{display:'flex',gap:8,alignItems:'center'}}><div className="status">API: {health.status||'unknown'}</div><button className="btn" onClick={signOut}>Sign out</button></div></div>
      {error&&<div className="card" style={{marginBottom:16}}>Dashboard notice: {error}</div>}
      <div className="grid"><div className="card"><div className="sub">OPEN BOOKINGS</div><div className="kpi">{loading?'…':bookings.length}</div></div><div className="card"><div className="sub">IN TRANSIT</div><div className="kpi">{loading?'…':bookings.filter(x=>x.status==='IN_TRANSIT').length}</div></div><div className="card"><div className="sub">AWAITING CONFIRMATION</div><div className="kpi">{loading?'…':bookings.filter(x=>String(x.status).includes('CONFIRM')).length}</div></div><div className="card"><div className="sub">CLOSED</div><div className="kpi">{loading?'…':bookings.filter(x=>String(x.status).includes('CLOSED')).length}</div></div></div>
      <div className="card" style={{marginTop:16}}><h3>Recent Bookings</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Status</th><th>Origin</th><th>Destination</th><th>Customer</th><th></th></tr></thead><tbody>{bookings.slice(0,20).map(b=><tr key={b.id}><td><b>{b.bookingNo||'-'}</b></td><td><span className="status">{b.status||'-'}</span></td><td>{b.origin||'-'}</td><td>{b.destination||'-'}</td><td>{b.customer?.name||'-'}</td><td><a href={`/bookings/${b.id}`}>Open</a></td></tr>)}{!loading&&bookings.length===0&&<tr><td colSpan={6}>No bookings to display.</td></tr>}</tbody></table></div></div>
    </main>
  </div>;
}
