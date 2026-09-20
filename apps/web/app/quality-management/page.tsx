'use client';
import {useEffect,useState} from 'react';
import WorkspaceShell from '../../components/WorkspaceShell';
import {api,token} from '../../lib/api';

export default function QualityPage(){
 const [d,setD]=useState<any>({summary:{},ncrs:[],capas:[],audits:[],sops:[],attestations:[],recurring:[],overdueCapa:[]});
 const [msg,setMsg]=useState('');
 const [ncr,setNcr]=useState<any>({title:'',source:'OPERATIONS',severity:'MEDIUM',category:'PROCESS'});
 const [capa,setCapa]=useState<any>({ncrId:'',action:'',actionType:'CORRECTIVE',dueAt:''});
 const [audit,setAudit]=useState<any>({title:'',auditType:'INTERNAL',plannedAt:''});
 const [sop,setSop]=useState<any>({code:'',title:'',version:'1.0',requiresAttestation:true});
 const load=async()=>{try{setD(await api('/quality/dashboard',token()));}catch(e:any){setMsg(e?.message||'Load failed');}};
 useEffect(()=>{load();},[]);
 const post=async(path:string,body:any,ok:string)=>{try{await api(path,token(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});setMsg(ok);await load();}catch(e:any){setMsg(e?.message||'Action failed');}};
 const s=d.summary||{};
 const kpis=[
  ['Open NCR',s.openNcr],
  ['Open CAPA',s.openCapa],
  ['Overdue CAPA',s.overdueCapa],
  ['Open Audits',s.openAudits],
  ['Active SOPs',s.activeSops],
  ['Recurring Patterns',s.recurringPatterns],
 ];

 return <WorkspaceShell
  title="Quality Management / CAPA"
  subtitle="Non-conformance, root cause, corrective action, internal audits, SOP attestations and recurring quality signals"
  active="/quality-management"
 >
  {msg&&<div className="erp-message">{msg}</div>}

  <div className="erp-kpi-grid">
   {kpis.map(([label,value])=><div className="erp-kpi" key={String(label)}>
    <div className="erp-kpi-label">{label}</div>
    <div className="erp-kpi-value">{value||0}</div>
   </div>)}
  </div>

  <div className="erp-panel-grid">
   <section className="erp-panel">
    <h3 className="erp-section-title">Raise Non-Conformance</h3>
    <div className="erp-form-grid">
     <label>Title<input value={ncr.title} onChange={e=>setNcr({...ncr,title:e.target.value})}/></label>
     <label>Severity<select value={ncr.severity} onChange={e=>setNcr({...ncr,severity:e.target.value})}>{['LOW','MEDIUM','HIGH','CRITICAL'].map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Category<input value={ncr.category} onChange={e=>setNcr({...ncr,category:e.target.value})}/></label>
     <label>Source<input value={ncr.source} onChange={e=>setNcr({...ncr,source:e.target.value})}/></label>
     <label style={{gridColumn:'1/-1'}}>Description<textarea value={ncr.description||''} onChange={e=>setNcr({...ncr,description:e.target.value})}/></label>
    </div>
    <div className="erp-form-actions"><button className="btn" onClick={()=>post('/quality/ncrs',ncr,'NCR created')}>Create NCR</button></div>
   </section>

   <section className="erp-panel">
    <h3 className="erp-section-title">Create CAPA</h3>
    <div className="erp-form-grid">
     <label>NCR<select value={capa.ncrId} onChange={e=>setCapa({...capa,ncrId:e.target.value})}><option value="">Select NCR</option>{d.ncrs.map((x:any)=><option key={x.ncrId} value={x.ncrId}>{x.ncrId} — {x.title}</option>)}</select></label>
     <label>Type<select value={capa.actionType} onChange={e=>setCapa({...capa,actionType:e.target.value})}><option>CORRECTIVE</option><option>PREVENTIVE</option></select></label>
     <label>Due date<input type="date" value={capa.dueAt} onChange={e=>setCapa({...capa,dueAt:e.target.value})}/></label>
     <label style={{gridColumn:'1/-1'}}>Action<textarea value={capa.action} onChange={e=>setCapa({...capa,action:e.target.value})}/></label>
    </div>
    <div className="erp-form-actions"><button className="btn" onClick={()=>post('/quality/capas',capa,'CAPA created')}>Create CAPA</button></div>
   </section>

   <section className="erp-panel">
    <h3 className="erp-section-title">Internal Audit</h3>
    <div className="erp-form-grid">
     <label>Audit title<input value={audit.title} onChange={e=>setAudit({...audit,title:e.target.value})}/></label>
     <label>Type<input value={audit.auditType} onChange={e=>setAudit({...audit,auditType:e.target.value})}/></label>
     <label>Planned date<input type="date" value={audit.plannedAt} onChange={e=>setAudit({...audit,plannedAt:e.target.value})}/></label>
    </div>
    <div className="erp-form-actions"><button className="btn" onClick={()=>post('/quality/audits',audit,'Audit created')}>Create Audit</button></div>
   </section>

   <section className="erp-panel">
    <h3 className="erp-section-title">SOP / Attestation</h3>
    <div className="erp-form-grid">
     <label>Code<input value={sop.code} onChange={e=>setSop({...sop,code:e.target.value})}/></label>
     <label>Title<input value={sop.title} onChange={e=>setSop({...sop,title:e.target.value})}/></label>
     <label>Version<input value={sop.version} onChange={e=>setSop({...sop,version:e.target.value})}/></label>
    </div>
    <div className="erp-form-actions"><button className="btn" onClick={()=>post('/quality/sops',sop,'SOP created')}>Create SOP</button></div>
   </section>
  </div>

  <section className="erp-register-panel">
   <h3 className="erp-section-title">NCR / Root Cause Register</h3>
   <div className="erp-register-wrap"><table className="erp-register"><thead><tr><th>NCR</th><th>Title</th><th>Severity</th><th>Category</th><th>Status</th><th>Root Cause</th></tr></thead><tbody>
    {d.ncrs.map((x:any)=><tr key={x.ncrId}><td>{x.ncrId}</td><td>{x.title}</td><td>{x.severity}</td><td>{x.category}</td><td>{x.status}</td><td>{x.rootCause||'—'}</td></tr>)}
    {!d.ncrs.length&&<tr><td colSpan={6}>No NCR records.</td></tr>}
   </tbody></table></div>
  </section>

  <section className="erp-register-panel">
   <h3 className="erp-section-title">CAPA Control</h3>
   <div className="erp-register-wrap"><table className="erp-register"><thead><tr><th>CAPA</th><th>NCR</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>
    {d.capas.map((x:any)=><tr key={x.capaId}><td>{x.capaId}</td><td>{x.ncrId}</td><td>{x.action}</td><td>{x.owner}</td><td>{x.dueAt||'—'}</td><td>{x.status}</td></tr>)}
    {!d.capas.length&&<tr><td colSpan={6}>No CAPA records.</td></tr>}
   </tbody></table></div>
  </section>

  <div className="erp-split-grid">
   <section className="erp-panel">
    <h3 className="erp-section-title">Recurring Quality Signals</h3>
    {d.recurring.length?d.recurring.map((x:any)=><div key={x.key} className="erp-list-row"><b>{x.key}</b> — {x.count} occurrences<div className="sub">{x.sources.join(', ')}</div></div>):<div className="erp-empty">No recurring pattern above threshold.</div>}
   </section>
   <section className="erp-panel">
    <h3 className="erp-section-title">SOP Register</h3>
    {d.sops.length?d.sops.map((x:any)=><div key={x.sopId} className="erp-list-row"><b>{x.code} v{x.version}</b> — {x.title}<button className="btn" style={{marginLeft:8}} onClick={()=>post(`/quality/sops/${x.sopId}/attest`,{},'SOP attested')}>Attest</button></div>):<div className="erp-empty">No SOP records.</div>}
   </section>
  </div>
 </WorkspaceShell>;
}
