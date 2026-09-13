'use client';
import {useEffect,useMemo,useState} from 'react';
import {api,currentUser,fmtDate,requireToken,signOut} from '../../lib/api';

type Doc={id:string;documentNo?:string;type:string;status:string};
type Container={id:string;containerNo:string;type:string;status:string;location?:string};
type Booking={id:string;bookingNo:string;status:string;origin:string;destination:string;etd?:string;eta?:string;customer?:{id:string;name:string};documents:Doc[];containers:Container[]};

export default function CustomerPortal(){
  const [rows,setRows]=useState<Booking[]>([]),[err,setErr]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<string>('');
  const [loading,setLoading]=useState(true);
  const user=currentUser();
  useEffect(()=>{const token=requireToken();if(!token)return;const u=currentUser();if(u?.role&&u.role!=='CUSTOMER'){location.replace('/');return;}api('/portal/bookings',token).then(x=>setRows(Array.isArray(x)?x:[])).catch(e=>setErr(e.message)).finally(()=>setLoading(false));},[]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(b=>!q||[b.bookingNo,b.origin,b.destination,b.status,b.customer?.name,...(b.containers||[]).map(c=>c.containerNo)].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);
  const active=rows.filter(b=>!['FINANCIALLY_CLOSED','CANCELLED'].includes(String(b.status).toUpperCase())).length;
  const inTransit=rows.filter(b=>String(b.status).toUpperCase()==='IN_TRANSIT').length;
  const releasedDocs=rows.reduce((n,b)=>n+(b.documents||[]).filter(d=>String(d.status).toLowerCase()==='released').length,0);
  const selectedBooking=rows.find(b=>b.id===selected);

  return <main style={{padding:18,maxWidth:1280,margin:'0 auto'}}>
    <div className="top"><div><div className="sub">CUSTOMER PORTAL</div><h1 style={{margin:'2px 0'}}>My Shipments</h1><div className="sub">{user?.email||''}</div></div><div style={{display:'flex',gap:8}}><button className="btn" onClick={()=>location.reload()}>Refresh</button><button className="btn" onClick={signOut}>Sign out</button></div></div>
    {err&&<div className="card" style={{marginBottom:12}}>Portal notice: {err}</div>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">TOTAL SHIPMENTS</div><div className="kpi">{loading?'…':rows.length}</div></div><div className="card"><div className="sub">ACTIVE</div><div className="kpi">{loading?'…':active}</div></div><div className="card"><div className="sub">IN TRANSIT</div><div className="kpi">{loading?'…':inTransit}</div></div><div className="card"><div className="sub">RELEASED DOCUMENTS</div><div className="kpi">{loading?'…':releasedDocs}</div></div></div>
    <div className="card" style={{marginBottom:12}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search booking, route, status or container" style={{width:'100%',maxWidth:430,padding:9,border:'1px solid #cfd9e2',borderRadius:6}}/></div>
    <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Route</th><th>ETD</th><th>ETA</th><th>Containers</th><th>Documents</th><th>Status</th><th></th></tr></thead><tbody>{visible.map(b=><tr key={b.id}><td><b>{b.bookingNo}</b></td><td>{b.origin} → {b.destination}</td><td>{fmtDate(b.etd)}</td><td>{fmtDate(b.eta)}</td><td>{b.containers?.length||0}</td><td>{b.documents?.length||0}</td><td><span className="status">{b.status}</span></td><td><button className="btn" onClick={()=>setSelected(selected===b.id?'':b.id)}>{selected===b.id?'Close':'View'}</button></td></tr>)}{!loading&&visible.length===0&&<tr><td colSpan={8}>No shipments found.</td></tr>}</tbody></table></div></div>
    {selectedBooking&&<div className="card" style={{marginTop:12}}><div className="top"><div><div className="sub">SHIPMENT DETAILS</div><h2 style={{margin:'2px 0'}}>{selectedBooking.bookingNo}</h2><div className="sub">{selectedBooking.origin} → {selectedBooking.destination}</div></div><span className="status">{selectedBooking.status}</span></div>
      <div className="grid" style={{marginBottom:12}}><div><div className="sub">ETD</div><b>{fmtDate(selectedBooking.etd)}</b></div><div><div className="sub">ETA</div><b>{fmtDate(selectedBooking.eta)}</b></div><div><div className="sub">CUSTOMER</div><b>{selectedBooking.customer?.name||'-'}</b></div></div>
      <h3>Containers</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Container</th><th>Type</th><th>Status</th><th>Current Location</th></tr></thead><tbody>{selectedBooking.containers?.map(c=><tr key={c.id}><td><b>{c.containerNo}</b></td><td>{c.type}</td><td><span className="status">{c.status}</span></td><td>{c.location||'-'}</td></tr>)}{!selectedBooking.containers?.length&&<tr><td colSpan={4}>No containers assigned yet.</td></tr>}</tbody></table></div>
      <h3 style={{marginTop:16}}>Documents</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Document</th><th>Type</th><th>Status</th></tr></thead><tbody>{selectedBooking.documents?.map(d=><tr key={d.id}><td><b>{d.documentNo||'-'}</b></td><td>{d.type}</td><td><span className="status">{d.status}</span></td></tr>)}{!selectedBooking.documents?.length&&<tr><td colSpan={3}>No customer documents available yet.</td></tr>}</tbody></table></div>
    </div>}
  </main>;
}
