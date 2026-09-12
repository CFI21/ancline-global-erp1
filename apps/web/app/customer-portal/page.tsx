'use client';
import {useEffect,useState} from 'react';
export default function CustomerPortal(){
  const [rows,setRows]=useState<any[]>([]),[err,setErr]=useState('');
  useEffect(()=>{
    const token=localStorage.getItem('ancline_token');
    fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000')+'/portal/bookings',{headers:{authorization:`Bearer ${token}`}})
      .then(async r=>{if(!r.ok)throw new Error(await r.text());return r.json()}).then(setRows).catch(e=>setErr(e.message));
  },[]);
  return <main style={{padding:24}}>
    <h1>Customer Portal</h1><p className="sub">Role-scoped shipment view</p>
    {err&&<div className="card">{err}</div>}
    {rows.map(b=><div className="card" key={b.id} style={{marginBottom:10}}>
      <b>{b.bookingNo}</b><div className="sub">{b.origin} → {b.destination} · {b.status}</div>
      <div>Documents: {b.documents?.length||0} · Containers: {b.containers?.length||0}</div>
    </div>)}
  </main>
}
