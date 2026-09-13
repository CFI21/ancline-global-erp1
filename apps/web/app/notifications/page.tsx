'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Note={id:string;category:string;title:string;message:string;objectType?:string|null;objectId?:string|null;status:string;readAt?:string|null;createdAt:string};

export default function NotificationsPage(){
  const [token,setToken]=useState('');const [rows,setRows]=useState<Note[]>([]);const [search,setSearch]=useState('');const [message,setMessage]=useState('');
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const data=await api('/operations/notifications',t);setRows(Array.isArray(data)?data:[]);}catch(e:any){setMessage(e.message||'Unable to load notifications');}}
  async function read(id:string){try{await api(`/operations/notifications/${id}/read`,token,{method:'POST'});await load();}catch(e:any){setMessage(e.message||'Could not mark notification as read');}}
  async function readAll(){try{await api('/operations/notifications/read-all',token,{method:'POST'});await load();}catch(e:any){setMessage(e.message||'Could not mark notifications as read');}}
  const unread=rows.filter(x=>x.status==='UNREAD').length;
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(n=>!q||[n.category,n.title,n.message,n.objectType,n.objectId,n.status].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);
  return <WorkspaceShell title="Notifications" subtitle="Operational alerts, workflow messages and system notices" active="/notifications" actions={<><button className="btn" onClick={readAll}>Mark all read</button><button className="btn" onClick={()=>void load()}>Refresh</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">TOTAL</div><div className="kpi">{rows.length}</div></div><div className="card"><div className="sub">UNREAD</div><div className="kpi">{unread}</div></div><div className="card"><div className="sub">READ</div><div className="kpi">{rows.length-unread}</div></div></div>
    <div className="card"><input style={{...fieldStyle,maxWidth:420,marginBottom:12}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notifications"/><div style={{display:'grid',gap:8}}>{visible.map(n=><div key={n.id} style={{border:'1px solid #e1e7ed',borderRadius:8,padding:12,background:n.status==='UNREAD'?'#f8fbfe':'#fff'}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}><div><div className="sub">{n.category} · {fmtDate(n.createdAt)}</div><div style={{fontWeight:800,margin:'3px 0'}}>{n.title}</div><div>{n.message}</div>{n.objectType&&<div className="sub" style={{marginTop:5}}>{n.objectType} · {n.objectId}</div>}</div>{n.status==='UNREAD'?<button className="btn" onClick={()=>read(n.id)}>Mark read</button>:<span className="status">Read</span>}</div></div>)}{!visible.length&&<div>No notifications found.</div>}</div></div>
  </WorkspaceShell>;
}
