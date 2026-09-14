'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Note={id:string;category:string;title:string;message:string;objectType?:string|null;objectId?:string|null;status:string;readAt?:string|null;createdAt:string;updatedAt:string};
type Scan={scannedBookings:number;activeRisks:number;critical:number;warning:number;info:number;resolved:number};

function severity(n:Note){const c=String(n.category||'').toUpperCase();return c.startsWith('CRITICAL')?'CRITICAL':c.startsWith('WARNING')?'WARNING':c.startsWith('INFO')?'INFO':'NOTICE';}
function cleanMessage(message:string){return String(message||'').replace(/\s*\[booking:[^\]]+\]\s*$/,'');}
function bookingId(n:Note){const match=String(n.message||'').match(/\[booking:([^\]]+)\]/);return match?.[1]||'';}

export default function NotificationsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Note[]>([]);
  const [search,setSearch]=useState('');
  const [level,setLevel]=useState('ACTIVE');
  const [message,setMessage]=useState('');
  const [scan,setScan]=useState<Scan|null>(null);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      setMessage('');
      const data=await api('/operations/notifications',t);
      setRows(Array.isArray(data)?data:[]);
    }catch(e:any){setMessage(e.message||'Unable to load operational alerts');}
  }
  async function rescan(){
    setBusy(true);setMessage('');
    try{
      const result=await api('/operations/notifications/scan',token,{method:'POST'});
      setScan(result);
      setMessage(`Risk scan complete: ${result.activeRisks||0} active risk(s), ${result.resolved||0} resolved.`);
      await load();
    }catch(e:any){setMessage(e.message||'Operational risk scan failed');}finally{setBusy(false);}
  }
  async function read(id:string){try{await api(`/operations/notifications/${id}/read`,token,{method:'POST'});await load();}catch(e:any){setMessage(e.message||'Could not mark notification as read');}}
  async function readAll(){try{await api('/operations/notifications/read-all',token,{method:'POST'});await load();}catch(e:any){setMessage(e.message||'Could not mark notifications as read');}}

  const active=rows.filter(x=>x.status!=='RESOLVED');
  const unresolvedUnread=active.filter(x=>x.status==='UNREAD').length;
  const critical=active.filter(x=>severity(x)==='CRITICAL').length;
  const warning=active.filter(x=>severity(x)==='WARNING').length;
  const info=active.filter(x=>severity(x)==='INFO').length;
  const resolved=rows.filter(x=>x.status==='RESOLVED').length;

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(n=>{
      const sev=severity(n);
      const filterOk=level==='ALL'||(level==='ACTIVE'&&n.status!=='RESOLVED')||(level==='RESOLVED'&&n.status==='RESOLVED')||level===sev;
      const searchOk=!q||[n.category,n.title,n.message,n.objectType,n.objectId,n.status].some(v=>String(v||'').toLowerCase().includes(q));
      return filterOk&&searchOk;
    });
  },[rows,search,level]);

  return <WorkspaceShell title="Operational Risk Center" subtitle="Automatic cut-off, milestone, approval, document, container and finance alerts" active="/notifications" actions={<><button className="btn" disabled={busy} onClick={rescan}>{busy?'Scanning…':'Scan Operational Risk'}</button><button className="btn" onClick={readAll}>Mark all read</button><button className="btn" onClick={()=>void load()}>Refresh</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">ACTIVE RISKS</div><div className="kpi">{active.length}</div><div className="sub">{unresolvedUnread} unread</div></div>
      <div className="card"><div className="sub">CRITICAL</div><div className="kpi">{critical}</div><div className="sub">Overdue / blocking</div></div>
      <div className="card"><div className="sub">WARNING</div><div className="kpi">{warning}</div><div className="sub">Needs attention soon</div></div>
      <div className="card"><div className="sub">INFO / UPCOMING</div><div className="kpi">{info}</div><div className="sub">Within alert window</div></div>
      <div className="card"><div className="sub">AUTO RESOLVED</div><div className="kpi">{resolved}</div><div className="sub">Risk condition cleared</div></div>
    </div>

    {scan&&<div className="card" style={{marginBottom:12}}><b>Latest scan:</b> {scan.scannedBookings} booking(s) checked · {scan.critical} critical · {scan.warning} warning · {scan.info} info · {scan.resolved} newly resolved.</div>}

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input style={{...fieldStyle,maxWidth:360}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search booking, alert, category or status"/>
        {['ACTIVE','CRITICAL','WARNING','INFO','RESOLVED','ALL'].map(x=><button key={x} className="btn" onClick={()=>setLevel(x)} style={level===x?{fontWeight:900,borderWidth:2}:undefined}>{x}</button>)}
      </div>
    </div>

    <div className="card">
      <div style={{display:'grid',gap:8}}>
        {visible.map(n=>{
          const sev=severity(n);const bid=bookingId(n);const resolvedState=n.status==='RESOLVED';
          return <div key={n.id} style={{border:'1px solid #e1e7ed',borderRadius:8,padding:12,background:resolvedState?'#fafafa':n.status==='UNREAD'?'#f8fbfe':'#fff',opacity:resolvedState?0.68:1}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
              <div style={{minWidth:240,flex:1}}>
                <div className="sub">{n.category} · updated {fmtDate(n.updatedAt||n.createdAt)}</div>
                <div style={{fontWeight:800,margin:'3px 0'}}>{n.title}</div>
                <div>{cleanMessage(n.message)}</div>
                <div className="sub" style={{marginTop:6}}>{resolvedState?'Resolved automatically when the risk condition cleared.':sev==='CRITICAL'?'Immediate operational attention required.':sev==='WARNING'?'Action recommended before this becomes critical.':'Upcoming operational checkpoint.'}</div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                {bid&&<a className="btn" href={`/bookings/${bid}`}>Open booking</a>}
                {!resolvedState&&n.status==='UNREAD'&&<button className="btn" onClick={()=>read(n.id)}>Mark read</button>}
                <span className="status">{resolvedState?'RESOLVED':n.status}</span>
              </div>
            </div>
          </div>;
        })}
        {!visible.length&&<div>No alerts match the selected filter.</div>}
      </div>
    </div>
  </WorkspaceShell>;
}
