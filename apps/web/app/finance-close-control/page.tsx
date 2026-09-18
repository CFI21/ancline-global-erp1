'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

const nowPeriod=()=>new Date().toISOString().slice(0,7);
export default function FinanceCloseControlPage(){
  const [token,setToken]=useState('');const [period,setPeriod]=useState(nowPeriod());const [data,setData]=useState<any>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,nowPeriod());},[]);
  async function load(t=token,p=period){if(!t)return;setBusy(true);setMessage('');try{setData(await api(`/finance-close-orchestration/dashboard/${encodeURIComponent(p)}`,t));}catch(e:any){setMessage(e.message||'Unable to load finance close control.');}finally{setBusy(false);}}
  async function snapshot(){setBusy(true);setMessage('');try{await api(`/finance-close-orchestration/snapshot/${encodeURIComponent(period)}`,token,{method:'POST',body:'{}'});setMessage(`Close-control snapshot saved for ${period}.`);await load();}catch(e:any){setMessage(e.message||'Snapshot failed.');}finally{setBusy(false);}}
  const areas=data?.areas||[],blockers=data?.blockers||[];
  return <WorkspaceShell title="Finance Close Control Board" subtitle="Cross-module readiness across revenue, GL, AR/AP, treasury, procurement, statutory and intercompany" active="/finance-close-control" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12,display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
      <label style={{minWidth:200}}><span className="sub">PERIOD</span><input type="month" style={fieldStyle} value={period} onChange={e=>{setPeriod(e.target.value);void load(token,e.target.value);}}/></label>
      <button className="btn" disabled={busy} onClick={()=>void snapshot()}>Snapshot Control Board</button>
    </div>
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">OVERALL</div><div className="kpi">{data?.ready?'READY':'BLOCKED'}</div></div>
      <div className="card"><div className="sub">BLOCKERS</div><div className="kpi">{data?.blockerCount||0}</div></div>
      <div className="card"><div className="sub">GL PERIOD</div><div className="kpi">{data?.glStatus||'OPEN'}</div></div>
    </div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Close Area Status</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Area</th><th>Status</th><th>Blockers</th></tr></thead><tbody>{areas.map((x:any)=><tr key={x.area}><td>{x.area.replaceAll('_',' ')}</td><td><span className="status">{x.status}</span></td><td>{x.blockers}</td></tr>)}</tbody></table></div></div>
    <div className="card"><h3 style={sectionTitle}>Deterministic Close Blockers</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Area</th><th>Type</th><th>Object</th><th>Message</th></tr></thead><tbody>{blockers.map((x:any,i:number)=><tr key={`${x.area}-${x.type}-${x.objectId||i}`}><td>{x.area}</td><td><span className="status">{x.type}</span></td><td>{x.objectId||'-'}</td><td>{x.message}</td></tr>)}{!blockers.length&&<tr><td colSpan={4}>No blockers detected for {period}.</td></tr>}</tbody></table></div></div>
  </WorkspaceShell>;
}
