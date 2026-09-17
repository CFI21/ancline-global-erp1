'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

export default function BackgroundAutomationPage(){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=async()=>{try{setError('');setData(await api('/background-automation/dashboard',requireToken()));}catch(e:any){setError(e.message||'Unable to load background automation');}};
 useEffect(()=>{void load();},[]);
 const run=async(job:string)=>{try{setBusy(job);setError('');await api(`/background-automation/run/${job}`,requireToken(),{method:'POST'});await load();}catch(e:any){setError(e.message||'Run failed');}finally{setBusy('');}};
 const jobs=data?.jobs||[];
 return <WorkspaceShell title="Scheduled Automation / Background Processing" subtitle="Automatic escalations, report runs, compliance checks, integration SLA/retry control and recurring data-quality scans" active="/background-automation" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
  {error&&<div className="card" style={{marginBottom:12,borderColor:'#d99'}}>{error}</div>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:14}}>
   {[["Jobs",data?.summary?.jobs],["Healthy",data?.summary?.healthy],["Failed",data?.summary?.failed],["Never Run",data?.summary?.neverRun],["Heartbeat",data?.scheduler?`${data.scheduler.heartbeatSeconds}s`:'-']].map(([k,v])=><div className="card" key={String(k)}><div className="sub">{k}</div><div style={{fontSize:24,fontWeight:800}}>{v??'-'}</div></div>)}
  </div>
  <div className="card"><h2 style={sectionTitle}>Background Jobs</h2><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Job</th><th>Cadence</th><th>Last Status</th><th>Last Completed</th><th>Next Due</th><th>Last Result / Error</th><th>Action</th></tr></thead><tbody>
   {jobs.map((j:any)=><tr key={j.job}><td style={{fontWeight:700}}>{j.job.replaceAll('_',' ')}</td><td>{j.cadenceMinutes} min</td><td>{j.lastStatus}</td><td>{j.lastCompletedAt?new Date(j.lastCompletedAt).toLocaleString():'-'}</td><td>{j.nextDueAt?new Date(j.nextDueAt).toLocaleString():'-'}</td><td style={{maxWidth:360,whiteSpace:'normal'}}>{j.lastError||summarize(j.lastResult)}</td><td><button className="btn" disabled={busy===j.job} onClick={()=>void run(j.job)}>{busy===j.job?'Running…':'Run now'}</button></td></tr>)}
   {!jobs.length&&<tr><td colSpan={7}>No background jobs available.</td></tr>}
  </tbody></table></div></div>
  <div className="card" style={{marginTop:14}}><h2 style={sectionTitle}>Execution Model</h2><div className="sub" style={{lineHeight:1.6}}>The API service runs a one-minute heartbeat. Each job has its own persisted cadence and run history, so restarts do not cause immediate repeat execution. Risk-expiry and integration-SLA findings are handed to Workflow Automation with idempotency keys. External email or EDI delivery is not fabricated; this scheduler only advances controls already supported by ANCLINE.</div></div>
 </WorkspaceShell>;
}
function summarize(v:any){if(!v)return '-';try{const s=JSON.stringify(v);return s.length>240?s.slice(0,237)+'…':s;}catch{return String(v);}}
