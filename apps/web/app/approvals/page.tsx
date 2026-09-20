'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string};
type Approval={id:string;bookingId?:string;type:string;requesterId:string;approverId:string;status:string;reason?:string;createdAt?:string};

export default function ApprovalsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Approval[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({bookingId:'',type:'RATE_APPROVAL',requesterId:'',approverId:'GLOBAL_ADMIN',reason:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);try{const u=JSON.parse(localStorage.getItem('ancline_user')||'{}');setForm(f=>({...f,requesterId:u.email||u.sub||'requester'}));}catch{}void load(t);},[]);
  async function load(t=token){try{const [a,b]=await Promise.all([api('/approvals',t),api('/bookings',t)]);const approvalRows=Array.isArray(a)?a:[];const bookingRows=Array.isArray(b)?b:[];setRows(approvalRows);setBookings(bookingRows);const contextId=new URLSearchParams(location.search).get('bookingId')||'';if(contextId&&bookingRows.some((x:Booking)=>x.id===contextId)){setForm(x=>({...x,bookingId:contextId}));const bk=bookingRows.find((x:Booking)=>x.id===contextId);if(bk)setSearch(bk.bookingNo);}}catch(e:any){setMessage(e.message||'Unable to load approvals');}}
  const bookingLabel=(id?:string)=>{const b=bookings.find(x=>x.id===id);return b?`${b.bookingNo} · ${b.origin} → ${b.destination}`:(id||'-');};
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(a=>!q||[a.type,a.requesterId,a.approverId,a.status,a.reason,bookingLabel(a.bookingId)].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search,bookings]);
  const pending=rows.filter(x=>String(x.status).toUpperCase()==='PENDING').length;

  async function createApproval(){
    if(!form.type.trim()||!form.requesterId.trim()||!form.approverId.trim()){setMessage('Type, requester and approver are required.');return;}
    if(form.requesterId.trim()===form.approverId.trim()){setMessage('Maker and checker must be different.');return;}
    setBusy(true);setMessage('');
    try{await api('/approvals',token,{method:'POST',body:JSON.stringify({bookingId:form.bookingId||null,type:form.type.trim().toUpperCase(),requesterId:form.requesterId.trim(),approverId:form.approverId.trim(),status:'PENDING',reason:form.reason.trim()||null})});setMessage('Approval request created.');setForm({...form,bookingId:'',reason:''});await load();}catch(e:any){setMessage(e.message||'Approval request could not be created.');}finally{setBusy(false);}
  }
  async function decide(id:string,action:'approve'|'reject'){setMessage('');try{await api(`/approvals/${id}/${action}`,token,{method:'POST'});setMessage(action==='approve'?'Approval accepted.':'Approval rejected.');await load();}catch(e:any){setMessage(e.message||'Approval action failed.');}}

  return <WorkspaceShell title="Approvals" subtitle="Maker-checker controls and operational approval queue" active="/approvals" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {form.bookingId&&<JobContextRail bookingId={form.bookingId} bookingNo={bookings.find(b=>b.id===form.bookingId)?.bookingNo} active="APPROVALS"/>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">TOTAL APPROVALS</div><div className="kpi">{rows.length}</div></div><div className="card"><div className="sub">PENDING</div><div className="kpi">{pending}</div></div><div className="card"><div className="sub">APPROVED</div><div className="kpi">{rows.filter(x=>x.status==='Approved').length}</div></div><div className="card"><div className="sub">REJECTED</div><div className="kpi">{rows.filter(x=>x.status==='Rejected').length}</div></div></div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>New Approval Request</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking / Job</span><select style={fieldStyle} value={form.bookingId} onChange={e=>setForm({...form,bookingId:e.target.value})}><option value="">General / not linked</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Approval Type *</span><select style={fieldStyle} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{['RATE_APPROVAL','CREDIT_OVERRIDE','DOCUMENT_RELEASE','FINANCE_APPROVAL','BOOKING_CONFIRMATION','EXCEPTION_APPROVAL','FINAL_CLOSEOUT'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Requester / Maker *</span><input style={fieldStyle} value={form.requesterId} onChange={e=>setForm({...form,requesterId:e.target.value})}/></label>
      <label><span style={labelStyle}>Approver / Checker *</span><input style={fieldStyle} value={form.approverId} onChange={e=>setForm({...form,approverId:e.target.value})}/></label>
      <label style={{gridColumn:'1/-1'}}><span style={labelStyle}>Reason / Business Justification</span><input style={fieldStyle} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Reason for approval request"/></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createApproval}>{busy?'Submitting…':'Submit Approval'}</button></div></div>
    <div className="card"><input style={{...fieldStyle,maxWidth:380,marginBottom:12}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search approval, booking, maker, checker or status"/><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Booking</th><th>Requester</th><th>Approver</th><th>Reason</th><th>Created</th><th>Status</th><th>Decision</th></tr></thead><tbody>
      {visible.map(a=><tr key={a.id}><td><b>{a.type}</b></td><td>{bookingLabel(a.bookingId)}</td><td>{a.requesterId}</td><td>{a.approverId}</td><td>{a.reason||'-'}</td><td>{fmtDate(a.createdAt)}</td><td><span className="status">{a.status}</span></td><td>{String(a.status).toUpperCase()==='PENDING'?<div style={{display:'flex',gap:5}}><button className="btn" onClick={()=>decide(a.id,'approve')}>Approve</button><button className="btn" onClick={()=>decide(a.id,'reject')}>Reject</button></div>:'-'}</td></tr>)}
      {visible.length===0&&<tr><td colSpan={8}>No approvals found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
