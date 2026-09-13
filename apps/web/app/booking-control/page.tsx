'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Rate={id:string;quoteNo:string;customerId:string;trade:string;equipment:string;currency:string;sellRate:any;status:string;validTo:string};
type Booking={id:string;bookingNo:string;customerId:string;status:string;origin:string;destination:string;etd?:string;eta?:string;carrier?:string;equipment?:string;salesOwner?:string;operator?:string;rateQuoteId?:string;rateQuote?:Rate;customer?:{name:string};cancellationReason?:string;cancelledAt?:string;cancelledBy?:string};

export default function BookingControlPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Booking[]>([]);
  const [rates,setRates]=useState<Rate[]>([]);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{const [b,r]=await Promise.all([api('/bookings',t),api('/rates',t)]);setRows(Array.isArray(b)?b:[]);setRates(Array.isArray(r)?r:[]);}catch(e:any){setMessage(e.message||'Unable to load booking control data');}
  }
  const statuses=useMemo(()=>Array.from(new Set(rows.map(r=>r.status))).sort(),[rows]);
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return rows.filter(b=>(status==='ALL'||b.status===status)&&(!q||[b.bookingNo,b.customer?.name,b.origin,b.destination,b.carrier,b.equipment,b.salesOwner,b.operator,b.rateQuote?.quoteNo].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,status]);
  const quotesFor=(b:Booking)=>rates.filter(r=>r.customerId===b.customerId);

  async function patch(b:Booking,data:any){
    if(b.status==='CANCELLED'){setMessage('Cancelled bookings are read-only.');return;}
    setBusy(b.id);setMessage('');
    try{await api(`/bookings/${b.id}`,token,{method:'PATCH',body:JSON.stringify(data)});setMessage(`${b.bookingNo} updated.`);await load();}catch(e:any){setMessage(e.message||'Booking update failed.');}finally{setBusy('');}
  }
  async function duplicate(b:Booking){
    if(!confirm(`Duplicate booking ${b.bookingNo}?`))return;
    setBusy(b.id);setMessage('');
    try{const created=await api(`/bookings/${b.id}/duplicate`,token,{method:'POST'});setMessage(`Duplicate ${created.bookingNo} created.`);await load();if(created?.id&&confirm('Open the duplicated booking now?'))location.href=`/bookings/${created.id}`;}catch(e:any){setMessage(e.message||'Could not duplicate booking.');}finally{setBusy('');}
  }
  async function cancel(b:Booking){
    const reason=prompt(`Cancellation reason for ${b.bookingNo}:`,'');if(reason===null)return;if(!reason.trim()){setMessage('Cancellation reason is required.');return;}
    if(!confirm(`Cancel ${b.bookingNo}? This will make the booking read-only.`))return;
    setBusy(b.id);setMessage('');
    try{await api(`/bookings/${b.id}/cancel`,token,{method:'POST',body:JSON.stringify({reason:reason.trim()})});setMessage(`${b.bookingNo} cancelled.`);await load();}catch(e:any){setMessage(e.message||'Could not cancel booking.');}finally{setBusy('');}
  }
  function printBooking(b:Booking){
    const w=window.open('','_blank','width=900,height=700');if(!w)return setMessage('Allow pop-ups to print the booking summary.');
    w.document.write(`<!doctype html><html><head><title>${b.bookingNo}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#183a5c}h1{margin-bottom:6px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.box{border:1px solid #ccd6df;padding:12px;border-radius:6px}small{color:#6a7b8b;display:block;margin-bottom:4px}</style></head><body><h1>${b.bookingNo}</h1><div>${b.customer?.name||''} · ${b.status}</div><div class="grid"><div class="box"><small>Route</small>${b.origin} → ${b.destination}</div><div class="box"><small>ETD / ETA</small>${fmtDate(b.etd)} / ${fmtDate(b.eta)}</div><div class="box"><small>Carrier / Equipment</small>${b.carrier||'-'} / ${b.equipment||'-'}</div><div class="box"><small>Rate Quote</small>${b.rateQuote?.quoteNo||'-'}</div><div class="box"><small>Sales Owner</small>${b.salesOwner||'-'}</div><div class="box"><small>Operator</small>${b.operator||'-'}</div></div></body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),250);
  }

  return <WorkspaceShell title="Booking Control" subtitle="Commercial handover, ownership and booking lifecycle control" active="/booking-control" actions={<><button className="btn" onClick={()=>void load()}>Refresh</button><button className="btn" onClick={()=>window.print()}>Print Register</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><input style={{...fieldStyle,maxWidth:330}} placeholder="Search booking, customer, owner, quote, route…" value={search} onChange={e=>setSearch(e.target.value)}/><select style={{...fieldStyle,maxWidth:210}} value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select><span className="status">{visible.length} bookings</span></div></div>
    <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Customer</th><th>Route</th><th>ETD</th><th>Rate / Quote</th><th>Sales Owner</th><th>Operator</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {visible.map(b=>{const disabled=b.status==='CANCELLED'||busy===b.id;return <tr key={b.id}><td><a href={`/bookings/${b.id}`} style={{fontWeight:800,color:'#123b61'}}>{b.bookingNo}</a></td><td>{b.customer?.name||'-'}</td><td>{b.origin} → {b.destination}</td><td>{fmtDate(b.etd)}</td><td><select disabled={disabled} style={{...fieldStyle,minWidth:180}} value={b.rateQuoteId||''} onChange={e=>void patch(b,{rateQuoteId:e.target.value||null})}><option value="">No linked quote</option>{quotesFor(b).map(q=><option key={q.id} value={q.id}>{q.quoteNo} · {q.status}</option>)}</select></td><td><input disabled={disabled} defaultValue={b.salesOwner||''} placeholder="Name / email" onBlur={e=>{if(e.target.value!==(b.salesOwner||''))void patch(b,{salesOwner:e.target.value||null});}} style={{...fieldStyle,minWidth:150}}/></td><td><input disabled={disabled} defaultValue={b.operator||''} placeholder="Name / email" onBlur={e=>{if(e.target.value!==(b.operator||''))void patch(b,{operator:e.target.value||null});}} style={{...fieldStyle,minWidth:150}}/></td><td><span className="status">{b.status}</span>{b.status==='CANCELLED'&&b.cancellationReason&&<div className="sub" style={{marginTop:4,maxWidth:180}}>{b.cancellationReason}</div>}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap',minWidth:250}}><a className="btn" href={`/bookings/${b.id}`} style={{textDecoration:'none'}}>Open</a><button className="btn" onClick={()=>printBooking(b)}>Print</button><button className="btn" disabled={busy===b.id} onClick={()=>void duplicate(b)}>Duplicate</button>{b.status!=='CANCELLED'&&b.status!=='FINANCIALLY_CLOSED'&&<button className="btn" disabled={busy===b.id} onClick={()=>void cancel(b)}>Cancel</button>}</div></td></tr>})}
      {visible.length===0&&<tr><td colSpan={9}>No bookings found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
