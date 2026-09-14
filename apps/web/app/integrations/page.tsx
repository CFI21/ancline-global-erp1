'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle,formGrid,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type IntegrationRow={id:string;sourceSystem:string;eventType:string;externalId?:string;objectType:string;objectId:string;status:string;payload:any;attemptCount:number;completedAt?:string;createdAt:string;updatedAt:string};
type Summary={total:number;received:number;processing:number;completed:number;failed:number;retries:number;sources:number};

const templates:any={
  CONTAINER_MOVEMENT:{bookingNo:'',containerNo:'',eventCode:'DEPARTED',eventLabel:'Departed',occurredAt:new Date().toISOString(),location:'',status:'IN_TRANSIT',reference:'',remarks:''},
  TRACKING_MILESTONE:{bookingNo:'',code:'ARRIVED',label:'Arrived',actualAt:new Date().toISOString(),location:'',remarks:''},
  SCHEDULE_UPDATE:{bookingNo:'',carrier:'',vesselVoyage:'',terminal:'',etd:'',eta:''}
};

export default function IntegrationsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<IntegrationRow[]>([]);
  const [summary,setSummary]=useState<Summary>({total:0,received:0,processing:0,completed:0,failed:0,retries:0,sources:0});
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [sourceSystem,setSourceSystem]=useState('CARRIER_EDI');
  const [eventType,setEventType]=useState('CONTAINER_MOVEMENT');
  const [externalId,setExternalId]=useState('');
  const [payload,setPayload]=useState(JSON.stringify(templates.CONTAINER_MOVEMENT,null,2));

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{const [r,s]=await Promise.all([api('/integrations',t),api('/integrations/summary',t)]);setRows(Array.isArray(r)?r:[]);setSummary(s||summary);}catch(e:any){setMessage(e.message||'Unable to load integrations');}
  }
  function changeType(v:string){setEventType(v);setPayload(JSON.stringify(templates[v]||{},null,2));}
  async function ingest(){
    setBusy('ingest');setMessage('');
    try{
      let parsed:any={};try{parsed=JSON.parse(payload);}catch{throw new Error('Payload must be valid JSON');}
      const row=await api('/integrations/ingest',token,{method:'POST',body:JSON.stringify({sourceSystem,eventType,externalId:externalId||null,payload:parsed})});
      setMessage(row?.duplicate?'Duplicate external event ignored because it was already completed.':`Integration event ${row?.status||'processed'}.`);
      if(!row?.duplicate)setExternalId('');
      await load();
    }catch(e:any){setMessage(e.message||'Integration event could not be submitted');}finally{setBusy('');}
  }
  async function action(row:IntegrationRow,kind:'retry'|'reprocess'){
    setBusy(row.id+kind);setMessage('');
    try{const r=await api(`/integrations/${row.id}/${kind}`,token,{method:'POST'});setMessage(`${row.sourceSystem} ${row.eventType}: ${r.status}.`);await load();}catch(e:any){setMessage(e.message||`Unable to ${kind} event`);}finally{setBusy('');}
  }
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(r=>(status==='ALL'||r.status===status)&&(!q||[r.sourceSystem,r.eventType,r.externalId,r.objectType,r.objectId,r.status,JSON.stringify(r.payload||{})].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,status]);
  const errorOf=(r:IntegrationRow)=>r.payload?._processing?.lastError||'';
  const resultOf=(r:IntegrationRow)=>r.payload?._processing?.result||null;

  return <WorkspaceShell title="Integration Control Center" subtitle="Carrier / Terminal EDI · processing, retry and reprocess control" active="/integrations" actions={<button className="btn" onClick={()=>load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">TOTAL EVENTS</div><div className="kpi">{summary.total}</div></div>
      <div className="card"><div className="sub">COMPLETED</div><div className="kpi">{summary.completed}</div></div>
      <div className="card"><div className="sub">FAILED</div><div className="kpi">{summary.failed}</div></div>
      <div className="card"><div className="sub">PROCESSING</div><div className="kpi">{summary.processing}</div></div>
      <div className="card"><div className="sub">RETRIES</div><div className="kpi">{summary.retries}</div></div>
      <div className="card"><div className="sub">SOURCES</div><div className="kpi">{summary.sources}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Inbound Event / EDI Test Console</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Source System</span><select value={sourceSystem} onChange={e=>setSourceSystem(e.target.value)} style={fieldStyle}><option>CARRIER_EDI</option><option>TERMINAL_EDI</option><option>DEPOT_EDI</option><option>AGENT_API</option><option>CARRIER_API</option></select></label>
        <label><span style={labelStyle}>Event Type</span><select value={eventType} onChange={e=>changeType(e.target.value)} style={fieldStyle}><option value="CONTAINER_MOVEMENT">Container Movement</option><option value="TRACKING_MILESTONE">Tracking Milestone</option><option value="SCHEDULE_UPDATE">Schedule Update</option><option value="CODECO">CODECO</option><option value="COARRI">COARRI</option><option value="IFTSTA">IFTSTA</option><option value="IFTSAI">IFTSAI</option></select></label>
        <label><span style={labelStyle}>External Message ID</span><input value={externalId} onChange={e=>setExternalId(e.target.value)} placeholder="Carrier / terminal message reference" style={fieldStyle}/></label>
      </div>
      <label style={{display:'block',marginTop:10}}><span style={labelStyle}>Payload (JSON)</span><textarea value={payload} onChange={e=>setPayload(e.target.value)} style={{...fieldStyle,minHeight:210,fontFamily:'monospace',resize:'vertical'}}/></label>
      <div className="sub" style={{marginTop:8}}>Supported mappings: bookingNo, carrierBookingNo, HBL/MBL, containerNo; container movements automatically update shipment milestones and key operational dates.</div>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}><button className="btn" disabled={busy==='ingest'} onClick={ingest}>{busy==='ingest'?'Processing...':'Ingest & Process'}</button></div>
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}><div><h3 style={{margin:0}}>Integration Event Register</h3><div className="sub">Latest 250 inbound integration events</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search source, event, reference..." style={{...fieldStyle,width:280}}/><select value={status} onChange={e=>setStatus(e.target.value)} style={{...fieldStyle,width:150}}><option>ALL</option><option>RECEIVED</option><option>PROCESSING</option><option>COMPLETED</option><option>FAILED</option></select></div></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Received</th><th>Source</th><th>Event</th><th>External ID</th><th>Status</th><th>Attempts</th><th>Matched Object</th><th>Result / Error</th><th>Action</th></tr></thead><tbody>{visible.map(r=>{const result=resultOf(r);const err=errorOf(r);return <tr key={r.id}><td>{fmtDate(r.createdAt)}</td><td><b>{r.sourceSystem}</b></td><td>{r.eventType}</td><td>{r.externalId||'-'}</td><td><span className="status">{r.status}</span></td><td>{r.attemptCount}</td><td>{r.objectType}: {r.objectId}</td><td style={{maxWidth:340,whiteSpace:'normal'}}>{err?<span>{err}</span>:result?<span>{result.objectType||'Processed'} {result.objectId||''}</span>:(r.completedAt?'Completed':'-')}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{r.status!=='COMPLETED'&&<button className="btn" disabled={!!busy} onClick={()=>action(r,'retry')}>Retry</button>}<button className="btn" disabled={!!busy} onClick={()=>action(r,'reprocess')}>Reprocess</button></div></td></tr>})}{!visible.length&&<tr><td colSpan={9}>No integration events found.</td></tr>}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}
