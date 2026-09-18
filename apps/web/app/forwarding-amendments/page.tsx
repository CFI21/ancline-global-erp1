'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Row={amendmentId:string;bookingId:string;bookingNo:string;requestType:string;reason:string;changes?:Record<string,any>;status:string;providerCode?:string|null;capabilityMode?:string;createdAt?:string;updatedAt?:string;error?:string};

export default function ForwardingAmendmentsPage(){
  const [token,setToken]=useState(''),[rows,setRows]=useState<Row[]>([]),[search,setSearch]=useState(''),[status,setStatus]=useState('ALL'),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const r=await api('/forwarding-amendments',t);setRows(Array.isArray(r)?r:[]);}catch(e:any){setMessage(e.message||'Unable to load forwarding amendments.');}}
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(r=>(status==='ALL'||r.status===status)&&(!q||[r.amendmentId,r.bookingNo,r.requestType,r.reason,r.providerCode,r.status,Object.entries(r.changes||{}).map(([k,v])=>k+'='+v).join(' ')].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,status]);
  async function decide(r:Row,decision:'CONFIRM'|'REJECT'){
    const note=window.prompt(decision==='CONFIRM'?'Carrier confirmation/reference or note':'Reason for rejection','')||'';
    if(decision==='REJECT'&&!note.trim())return;
    setBusy(r.amendmentId);setMessage('');
    try{await api('/forwarding-amendments/'+r.amendmentId+'/decision',token,{method:'POST',body:JSON.stringify({decision,note,carrierReference:decision==='CONFIRM'?note:undefined})});setMessage(r.amendmentId+' '+decision.toLowerCase()+'ed.');await load();}
    catch(e:any){setMessage(e.message||'Amendment decision failed.');}finally{setBusy('');}
  }
  return <WorkspaceShell title="Forwarding Booking Amendments" subtitle="Carrier-confirmed changes only · API / EDI / manual exception control" active="/forwarding-amendments" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}>{[['Total',rows.length],['Submitted',rows.filter(r=>r.status==='SUBMITTED').length],['Exceptions',rows.filter(r=>r.status==='EXCEPTION'||r.status==='PENDING_CONFIGURATION').length],['Confirmed',rows.filter(r=>r.status==='CONFIRMED').length]].map(([k,v])=><div className="card" key={String(k)}><div className="sub">{k}</div><div className="kpi">{v}</div></div>)}</div>
    <div className="card" style={{marginBottom:12,display:'flex',gap:8,flexWrap:'wrap'}}><input style={{...fieldStyle,maxWidth:420}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search booking, request, carrier or field"/><select style={{...fieldStyle,maxWidth:220}} value={status} onChange={e=>setStatus(e.target.value)}><option>ALL</option>{Array.from(new Set(rows.map(r=>r.status))).map(s=><option key={s}>{s}</option>)}</select></div>
    <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Request</th><th>Booking</th><th>Type</th><th>Changes / Reason</th><th>Carrier Capability</th><th>Status</th><th>Updated</th><th>Control</th></tr></thead><tbody>
      {visible.map(r=><tr key={r.amendmentId}><td><b>{r.amendmentId}</b></td><td><a href={'/bookings/'+r.bookingId}><b>{r.bookingNo}</b></a></td><td>{r.requestType}</td><td>{r.reason}<div className="sub">{Object.entries(r.changes||{}).map(([k,v])=>k+'='+String(v)).join(' · ')}</div>{r.error&&<div className="sub">{r.error}</div>}</td><td>{r.providerCode||'-'}<div className="sub">{r.capabilityMode||'-'}</div></td><td><span className="status">{r.status}</span></td><td>{fmtDate(r.updatedAt||r.createdAt)}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{!['CONFIRMED','REJECTED'].includes(r.status)&&<><button className="btn" disabled={busy===r.amendmentId} onClick={()=>decide(r,'CONFIRM')}>Confirm Carrier</button><button className="btn" disabled={busy===r.amendmentId} onClick={()=>decide(r,'REJECT')}>Reject</button></>}</div></td></tr>)}
      {!visible.length&&<tr><td colSpan={8}>No forwarding amendment requests found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
