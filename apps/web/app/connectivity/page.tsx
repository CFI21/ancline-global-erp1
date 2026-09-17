'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle,formGrid,sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

export default function ConnectivityPage(){
  const [token,setToken]=useState('');const [d,setD]=useState<any>({summary:{},profiles:[],mappings:[],webhooks:[],outbound:[],acknowledgements:[],slaBreaches:[],sourcePerformance:[]});const [msg,setMsg]=useState('');const [busy,setBusy]=useState('');
  const [profile,setProfile]=useState<any>({partnerCode:'',name:'',partnerType:'CARRIER',transport:'API',sourceSystem:'',slaMinutes:60,ackRequired:true,inboundEnabled:true,outboundEnabled:true});
  const [mapping,setMapping]=useState<any>({name:'',partnerCode:'',direction:'INBOUND',externalMessageType:'IFTSTA',anclineEventType:'TRACKING_MILESTONE',version:'1'});
  const [outbound,setOutbound]=useState<any>({partnerCode:'',messageType:'BOOKING_UPDATE',externalId:'',payload:'{}'});
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{setD(await api('/connectivity/dashboard',t));}catch(e:any){setMsg(e.message||'Unable to load connectivity control');}}
  async function post(path:string,body:any,key:string){setBusy(key);setMsg('');try{await api(path,token,{method:'POST',body:JSON.stringify(body)});setMsg('Saved successfully.');await load();}catch(e:any){setMsg(e.message||'Action failed');}finally{setBusy('');}}
  async function retry(id:string){await post(`/connectivity/outbound/${id}/retry`,{},id);}
  const s=d.summary||{};
  return <WorkspaceShell title="External Connectivity & EDI Automation" subtitle="Partner profiles · message mappings · outbound queues · acknowledgements · webhook and SLA control" active="/connectivity" actions={<button className="btn" onClick={()=>load()}>Refresh</button>}>
    {msg&&<div className="card" style={{marginBottom:12}}>{msg}</div>}
    <div className="grid" style={{marginBottom:12}}>{[['PARTNERS',s.profiles],['MAPPINGS',s.mappings],['WEBHOOKS',s.webhooks],['OUTBOUND QUEUED',s.outboundQueued],['OUTBOUND FAILED',s.outboundFailed],['ACKNOWLEDGED',s.acknowledged],['SLA BREACHES',s.slaBreaches]].map(([l,v])=><div className="card" key={String(l)}><div className="sub">{l}</div><div className="kpi">{v||0}</div></div>)}</div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))',gap:12,marginBottom:12}}>
      <div className="card"><h3 style={sectionTitle}>Partner / Endpoint Profile</h3><div style={formGrid}>
        <label><span style={labelStyle}>Partner Code</span><input style={fieldStyle} value={profile.partnerCode} onChange={e=>setProfile({...profile,partnerCode:e.target.value})}/></label>
        <label><span style={labelStyle}>Name</span><input style={fieldStyle} value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
        <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={profile.partnerType} onChange={e=>setProfile({...profile,partnerType:e.target.value})}><option>CARRIER</option><option>TERMINAL</option><option>AGENT</option><option>CUSTOMER</option><option>DEPOT</option><option>CUSTOMS</option></select></label>
        <label><span style={labelStyle}>Transport</span><select style={fieldStyle} value={profile.transport} onChange={e=>setProfile({...profile,transport:e.target.value})}><option>API</option><option>EDI</option><option>WEBHOOK</option><option>SFTP</option></select></label>
        <label><span style={labelStyle}>Source System</span><input style={fieldStyle} value={profile.sourceSystem} onChange={e=>setProfile({...profile,sourceSystem:e.target.value})}/></label>
        <label><span style={labelStyle}>SLA Minutes</span><input type="number" style={fieldStyle} value={profile.slaMinutes} onChange={e=>setProfile({...profile,slaMinutes:Number(e.target.value)})}/></label>
      </div><div style={{textAlign:'right',marginTop:10}}><button className="btn" disabled={busy==='profile'} onClick={()=>post('/connectivity/profiles',profile,'profile')}>Save Partner</button></div></div>

      <div className="card"><h3 style={sectionTitle}>Message Mapping</h3><div style={formGrid}>
        <label><span style={labelStyle}>Mapping Name</span><input style={fieldStyle} value={mapping.name} onChange={e=>setMapping({...mapping,name:e.target.value})}/></label>
        <label><span style={labelStyle}>Partner Code</span><input style={fieldStyle} value={mapping.partnerCode} onChange={e=>setMapping({...mapping,partnerCode:e.target.value})}/></label>
        <label><span style={labelStyle}>Direction</span><select style={fieldStyle} value={mapping.direction} onChange={e=>setMapping({...mapping,direction:e.target.value})}><option>INBOUND</option><option>OUTBOUND</option></select></label>
        <label><span style={labelStyle}>External Type</span><input style={fieldStyle} value={mapping.externalMessageType} onChange={e=>setMapping({...mapping,externalMessageType:e.target.value})}/></label>
        <label><span style={labelStyle}>ANCLINE Event</span><input style={fieldStyle} value={mapping.anclineEventType} onChange={e=>setMapping({...mapping,anclineEventType:e.target.value})}/></label>
        <label><span style={labelStyle}>Version</span><input style={fieldStyle} value={mapping.version} onChange={e=>setMapping({...mapping,version:e.target.value})}/></label>
      </div><div style={{textAlign:'right',marginTop:10}}><button className="btn" disabled={busy==='mapping'} onClick={()=>post('/connectivity/mappings',mapping,'mapping')}>Save Mapping</button></div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Outbound Message Queue</h3><div style={formGrid}>
      <label><span style={labelStyle}>Partner Code</span><input style={fieldStyle} value={outbound.partnerCode} onChange={e=>setOutbound({...outbound,partnerCode:e.target.value})}/></label>
      <label><span style={labelStyle}>Message Type</span><input style={fieldStyle} value={outbound.messageType} onChange={e=>setOutbound({...outbound,messageType:e.target.value})}/></label>
      <label><span style={labelStyle}>External ID</span><input style={fieldStyle} value={outbound.externalId} onChange={e=>setOutbound({...outbound,externalId:e.target.value})}/></label>
    </div><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Payload JSON</span><textarea style={{...fieldStyle,minHeight:100,fontFamily:'monospace'}} value={outbound.payload} onChange={e=>setOutbound({...outbound,payload:e.target.value})}/></label><div className="sub" style={{marginTop:6}}>Queue control only: ANCLINE records delivery state; it does not claim external transmission unless a provider acknowledgement/status is recorded.</div><div style={{textAlign:'right',marginTop:10}}><button className="btn" disabled={busy==='outbound'} onClick={()=>{let p:any={};try{p=JSON.parse(outbound.payload||'{}');}catch{return setMsg('Payload must be valid JSON');}void post('/connectivity/outbound',{...outbound,payload:p},'outbound');}}>Queue Message</button></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Integration SLA Monitor</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Source</th><th>Average Processing</th><th>Messages</th><th>SLA</th></tr></thead><tbody>{(d.sourcePerformance||[]).map((r:any)=><tr key={r.sourceSystem}><td><b>{r.sourceSystem}</b></td><td>{r.averageMinutes} min</td><td>{r.messages}</td><td>{r.slaMinutes} min</td></tr>)}{!(d.sourcePerformance||[]).length&&<tr><td colSpan={4}>No completed integration traffic yet.</td></tr>}</tbody></table></div><div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Source</th><th>Event</th><th>Status</th><th>Attempts</th><th>SLA</th><th>External ID</th></tr></thead><tbody>{(d.slaBreaches||[]).map((r:any)=><tr key={r.id}><td>{r.sourceSystem}</td><td>{r.eventType}</td><td>{r.status}</td><td>{r.attemptCount}</td><td>{r.slaMinutes} min</td><td>{r.externalId||'-'}</td></tr>)}{!(d.slaBreaches||[]).length&&<tr><td colSpan={6}>No active SLA breaches.</td></tr>}</tbody></table></div></div>

    <div className="card"><h3 style={sectionTitle}>Outbound Register</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Message ID</th><th>Partner</th><th>Type</th><th>Status</th><th>Attempts</th><th>Delivery Ref</th><th>Action</th></tr></thead><tbody>{(d.outbound||[]).map((r:any)=><tr key={r.messageId}><td>{r.messageId}</td><td><b>{r.partnerCode}</b></td><td>{r.messageType}</td><td>{r.status}</td><td>{r.attemptCount||0}/{r.maxAttempts||5}</td><td>{r.deliveryReference||'-'}</td><td>{['FAILED','DEAD_LETTER'].includes(r.status)&&<button className="btn" disabled={!!busy} onClick={()=>retry(r.messageId)}>Retry</button>}</td></tr>)}{!(d.outbound||[]).length&&<tr><td colSpan={7}>No outbound messages queued.</td></tr>}</tbody></table></div></div>
  </WorkspaceShell>;
}
