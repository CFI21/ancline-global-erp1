'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string};
type Doc={id:string;documentNo:string;bookingId:string;type:string;version:number;status:string;releaseControl?:string;createdAt?:string;booking?:Booking};

export default function DocumentsPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [rows,setRows]=useState<Doc[]>([]);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({bookingId:'',documentNo:'',type:'SEA_WAYBILL',status:'Draft',releaseControl:'Clear'});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const [d,b]=await Promise.all([api('/documents',t),api('/bookings',t)]);setRows(Array.isArray(d)?d:[]);setBookings(Array.isArray(b)?b:[]);}catch(e:any){setMessage(e.message||'Unable to load documents');}}
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return rows.filter(d=>!q||[d.documentNo,d.type,d.status,d.releaseControl,d.booking?.bookingNo,d.booking?.origin,d.booking?.destination].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);

  async function createDoc(){
    if(!form.bookingId){setMessage('Select a booking first.');return;}
    setBusy(true);setMessage('');
    try{
      const no=form.documentNo.trim()||`BL-${Date.now().toString().slice(-8)}`;
      await api('/documents',token,{method:'POST',body:JSON.stringify({bookingId:form.bookingId,documentNo:no,type:form.type,status:form.status,releaseControl:form.releaseControl})});
      setMessage(`Document ${no} created.`);setForm({...form,documentNo:''});await load();
    }catch(e:any){setMessage(e.message||'Document could not be created.');}finally{setBusy(false);}
  }
  async function release(id:string){setMessage('');try{await api(`/documents/${id}/release`,token,{method:'POST'});setMessage('Document released successfully.');await load();}catch(e:any){setMessage(e.message||'Document release failed.');}}

  return <WorkspaceShell title="Documents / B/L" subtitle="Shipping documents, versions and release control" active="/documents" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Create Shipping Document</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking *</span><select style={fieldStyle} value={form.bookingId} onChange={e=>setForm({...form,bookingId:e.target.value})}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Document No.</span><input style={fieldStyle} value={form.documentNo} onChange={e=>setForm({...form,documentNo:e.target.value})} placeholder="Auto if blank"/></label>
      <label><span style={labelStyle}>Document Type</span><select style={fieldStyle} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{['SEA_WAYBILL','HOUSE_BL','MASTER_BL','BOOKING_CONFIRMATION','SHIPPING_INSTRUCTION','VGM','ARRIVAL_NOTICE','DELIVERY_ORDER','INVOICE','PACKING_LIST'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Initial Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Draft</option><option>Ready</option><option>Pending Review</option></select></label>
      <label><span style={labelStyle}>Release Control</span><select style={fieldStyle} value={form.releaseControl} onChange={e=>setForm({...form,releaseControl:e.target.value})}><option>Clear</option><option>Hold - Finance</option><option>Hold - Documentation</option><option>Hold - Approval</option></select></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createDoc}>{busy?'Saving…':'Create Document'}</button></div></div>
    <div className="card"><input style={{...fieldStyle,maxWidth:380,marginBottom:12}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search document, booking, route or status"/><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Document</th><th>Booking</th><th>Type</th><th>Version</th><th>Route</th><th>Status</th><th>Release Control</th><th>Created</th><th>Action</th></tr></thead><tbody>
      {visible.map(d=><tr key={d.id}><td><b>{d.documentNo}</b></td><td>{d.booking?.bookingNo||d.bookingId}</td><td>{d.type}</td><td>v{d.version||1}</td><td>{d.booking?`${d.booking.origin} → ${d.booking.destination}`:'-'}</td><td><span className="status">{d.status}</span></td><td>{d.releaseControl||'-'}</td><td>{fmtDate(d.createdAt)}</td><td>{d.status==='Released'?<span className="status">Released</span>:<button className="btn" onClick={()=>release(d.id)} disabled={Boolean(d.releaseControl&&d.releaseControl!=='Clear')}>Release</button>}</td></tr>)}
      {visible.length===0&&<tr><td colSpan={9}>No documents found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
