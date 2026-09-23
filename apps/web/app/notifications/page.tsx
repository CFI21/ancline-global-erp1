'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Item={
  id:string;source:string;kind:string;severity:string;category:string;title:string;message:string;
  bookingId?:string|null;status:string;acknowledged?:boolean;mandatory?:boolean;escalationLevel?:string|null;
  updatedAt:string;actionHref:string;
};
type Center={
  generatedAt?:string;
  summary?:{total?:number;unread?:number;acknowledged?:number;critical?:number;level3?:number};
  preferences?:{channels?:string[];severities?:string[];categories?:string[];muteOptional?:boolean;mandatoryCritical?:boolean};
  items?:Item[];
};

export default function NotificationsPage(){
  const [token,setToken]=useState('');
  const [data,setData]=useState<Center>({items:[],summary:{},preferences:{}});
  const [search,setSearch]=useState('');
  const [level,setLevel]=useState('ACTIVE');
  const [source,setSource]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    setBusy(true);setMessage('');
    try{setData(await api('/operations/communication-center',t)||{items:[],summary:{},preferences:{}});}
    catch(e:any){setMessage(e.message||'Unable to load operations communication center.');}
    finally{setBusy(false);}
  }
  async function rescan(){
    setBusy(true);setMessage('');
    try{
      const r=await api('/operations/notifications/scan',token,{method:'POST'});
      setMessage(`Operational scan complete: ${r.activeRisks||0} active risk(s), ${r.resolved||0} resolved.`);
      await load();
    }catch(e:any){setMessage(e.message||'Operational risk scan failed');setBusy(false);}
  }
  async function acknowledge(item:Item){
    try{await api('/operations/communication-center/'+encodeURIComponent(item.id)+'/acknowledge',token,{method:'POST'});await load();}
    catch(e:any){setMessage(e.message||'Could not acknowledge communication item');}
  }
  async function read(item:Item){
    if(!item.id.startsWith('note:'))return acknowledge(item);
    try{await api('/operations/notifications/'+encodeURIComponent(item.id.slice(5))+'/read',token,{method:'POST'});await load();}
    catch(e:any){setMessage(e.message||'Could not mark notification as read');}
  }
  async function savePreferences(patch:any){
    const current=data.preferences||{};
    try{
      const next=await api('/operations/communication-center/preferences',token,{method:'PATCH',body:JSON.stringify({...current,...patch})});
      setData(d=>({...d,preferences:next}));await load();
    }catch(e:any){setMessage(e.message||'Could not save notification preferences');}
  }

  const rows=data.items||[];
  const sources=[...new Set(rows.map(x=>x.source).filter(Boolean))].sort();
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(x=>{
      const activeOk=level==='ALL'||(level==='ACTIVE'&&x.status!=='RESOLVED')||(level==='ACKNOWLEDGED'&&x.acknowledged)||level===x.severity||level===x.escalationLevel;
      const sourceOk=source==='ALL'||source===x.source;
      const searchOk=!q||[x.title,x.message,x.category,x.kind,x.source,x.bookingId,x.status,x.escalationLevel].some(v=>String(v||'').toLowerCase().includes(q));
      return activeOk&&sourceOk&&searchOk;
    });
  },[rows,search,level,source]);

  const s=data.summary||{};
  const prefs=data.preferences||{};
  return <WorkspaceShell title="Operations Notification + Communication Center" subtitle="Unified operational alerts · action queue · SLA escalations · integrations · audit-backed acknowledgements" active="/notifications" actions={<><button className="btn" disabled={busy} onClick={rescan}>{busy?'Refreshing…':'Scan + Refresh'}</button><button className="btn" onClick={()=>void load()}>Refresh</button></>}>

    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">TOTAL</div><div className="kpi">{s.total||0}</div></div>
      <div className="card"><div className="sub">UNREAD</div><div className="kpi">{s.unread||0}</div></div>
      <div className="card"><div className="sub">ACKNOWLEDGED</div><div className="kpi">{s.acknowledged||0}</div></div>
      <div className="card"><div className="sub">CRITICAL</div><div className="kpi">{s.critical||0}</div></div>
      <div className="card"><div className="sub">LEVEL 3</div><div className="kpi">{s.level3||0}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <b>Notification preferences</b>
        <label className="sub"><input type="checkbox" checked={!prefs.muteOptional} onChange={e=>void savePreferences({muteOptional:!e.target.checked})}/> Optional alerts enabled</label>
        {['WARNING','INFO'].map(sev=><label className="sub" key={sev}><input type="checkbox" checked={(prefs.severities||[]).includes(sev)} onChange={e=>{
          const set=new Set(prefs.severities||[]);e.target.checked?set.add(sev):set.delete(sev);void savePreferences({severities:[...set]});
        }}/> {sev}</label>)}
        <span className="status">CRITICAL / LEVEL 3 always enabled</span>
      </div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input style={{...fieldStyle,minWidth:250,flex:'1 1 320px'}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, alert, owner, source or escalation"/>
        <select aria-label="Communication status/severity" style={{...fieldStyle,maxWidth:180}} value={level} onChange={e=>setLevel(e.target.value)}>
          <option>ACTIVE</option><option>ACKNOWLEDGED</option><option>CRITICAL</option><option>WARNING</option><option>INFO</option><option>LEVEL_3</option><option>ALL</option>
        </select>
        <select aria-label="Communication source" style={{...fieldStyle,maxWidth:210}} value={source} onChange={e=>setSource(e.target.value)}>
          <option value="ALL">All sources</option>{sources.map(x=><option key={x}>{x}</option>)}
        </select>
        <span className="status">{visible.length} visible</span>
      </div>
      <div className="sub" style={{marginTop:8}}>Read/acknowledge state is communication-only. Booking, payment, release, finance and document workflow state is never changed here.</div>
    </div>

    <div className="card">
      <div style={{display:'grid',gap:8}}>
        {visible.map(item=><div key={item.id} style={{border:'1px solid #e1e7ed',borderRadius:8,padding:12,opacity:item.status==='RESOLVED'?0.66:1}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
            <div style={{minWidth:260,flex:1}}>
              <div className="sub">{item.severity} · {item.source} · {item.category}{item.escalationLevel?' · '+item.escalationLevel:''} · {fmtDate(item.updatedAt)}</div>
              <div style={{fontWeight:800,margin:'3px 0'}}>{item.title}</div>
              <div>{item.message}</div>
              <div className="sub" style={{marginTop:6}}>{item.acknowledged?'Acknowledged':item.mandatory?'Mandatory operational alert':'Operational communication'}</div>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <a className="btn" href={item.actionHref}>Open action</a>
              {item.status==='UNREAD'&&item.id.startsWith('note:')&&<button className="btn" onClick={()=>void read(item)}>Mark read</button>}
              {!item.acknowledged&&item.status!=='RESOLVED'&&<button className="btn" onClick={()=>void acknowledge(item)}>Acknowledge</button>}
              <span className="status">{item.status}{item.acknowledged?' · ACK':''}</span>
            </div>
          </div>
        </div>)}
        {!visible.length&&<div>No communication items match the selected filter.</div>}
      </div>
    </div>
  </WorkspaceShell>;
}
