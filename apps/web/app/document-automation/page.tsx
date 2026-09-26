'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken,fmtDate} from '../../lib/api';

const split=(v:string)=>v.split(',').map(x=>x.trim()).filter(Boolean);

export default function DocumentAutomationPage(){
  const [token,setToken]=useState('');const [data,setData]=useState<any>({summary:{},templates:[],communications:[],packs:[],generated:[],documents:[],bookings:[],readiness:[]});const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [readinessFilter,setReadinessFilter]=useState('ALL');
  const [tpl,setTpl]=useState({name:'Booking Confirmation',templateType:'BOOKING_CONFIRMATION',documentType:'BOOKING_CONFIRMATION',channel:'DOCUMENT',subjectTemplate:'',bodyTemplate:'Booking {{booking.bookingNo}} · {{booking.origin}} to {{booking.destination}} · Customer {{customer.name}}',requiresApproval:true});
  const [gen,setGen]=useState({bookingId:'',templateId:'',documentType:'',documentNo:'',releaseControl:'Clear'});
  const [com,setCom]=useState({bookingId:'',templateId:'',recipients:'',subject:'',message:'',channel:'EMAIL'});
  const [pack,setPack]=useState({bookingId:'',packType:'CUSTOMER_PACK',name:'',releasedOnly:true});
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{setData(await api('/document-automation/dashboard',t));}catch(e:any){setMessage(e.message||'Unable to load document automation');}}
  async function post(path:string,body:any,success:string){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body)});setMessage(success);await load();}catch(e:any){setMessage(e.message||'Action failed');}finally{setBusy(false);}}
  const s=data.summary||{};
  const readinessRows=useMemo(()=>readinessFilter==='ALL'?(data.readiness||[]):(data.readiness||[]).filter((r:any)=>r.state===readinessFilter),[data.readiness,readinessFilter]);
  async function retryCommunication(id:string){
    await post(`/document-automation/communications/${id}/retry`,{requestId:`ui-${id}`},'Communication queued for controlled retry');
  }
  function downloadExceptions(){
    const rows=(data.readiness||[]).filter((r:any)=>Array.isArray(r.reasons)&&r.reasons.length);
    if(!rows.length){setMessage('No document/communication exceptions to export.');return;}
    const esc=(v:any)=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const csv=['bookingNo,state,customer,origin,destination,exceptions',...rows.map((r:any)=>[r.bookingNo,r.state,r.customer||'',r.origin||'',r.destination||'',r.reasons.map((x:any)=>x.code+': '+x.message).join(' | ')].map(esc).join(','))].join('\n')+'\n';
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ancline-document-communication-exceptions.csv';a.click();URL.revokeObjectURL(url);
  }
  return <WorkspaceShell title="Document Automation / Communications" subtitle="Templates, generated shipping documents, release-aware packs and auditable customer/vendor communications" active="/document-automation" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',marginBottom:12}}>
      {[['Templates',s.templates],['Generated',s.generatedDocuments],['Released docs',s.releasedDocuments],['Pending review',s.pendingReview],['Communications',s.communications],['Failed / bounced',s.failedCommunications],['Ready bookings',s.readyBookings],['Blocked bookings',s.blockedBookings],['Document packs',s.documentPacks]].map(([l,v])=><div className="card" key={String(l)}><div className="sub">{l}</div><div style={{fontSize:24,fontWeight:800}}>{v??0}</div></div>)}
    </div>

    <div className="card" style={{marginBottom:12,overflowX:'auto'}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><div><h3 style={{...sectionTitle,margin:0}}>Document + Communication Readiness</h3><div className="sub">Release-aware readiness and exception control. Live provider dispatch remains disabled.</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><select style={{...fieldStyle,width:150}} value={readinessFilter} onChange={e=>setReadinessFilter(e.target.value)}><option value="ALL">All states</option><option>READY</option><option>BLOCKED</option><option>OPEN</option></select><button className="btn" onClick={downloadExceptions}>Download Exceptions</button></div></div><table style={{marginTop:10}}><thead><tr><th>Booking</th><th>Customer / Route</th><th>State</th><th>Released</th><th>Pending</th><th>Failed comms</th><th>Exceptions</th><th>Actions</th></tr></thead><tbody>{readinessRows.map((r:any)=><tr key={r.bookingId}><td><b>{r.bookingNo}</b><div className="sub">{r.bookingStatus}</div></td><td>{r.customer||'-'}<div className="sub">{r.origin||'-'} → {r.destination||'-'}</div></td><td><span className="status">{r.state}</span></td><td>{r.releasedCount}</td><td>{r.pendingCount}</td><td>{r.failedCommunicationCount}</td><td>{r.reasons.length?r.reasons.map((x:any)=><div key={x.code}><b>{x.code}</b><div className="sub">{x.message}</div></div>):<span className="status">CLEAR</span>}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}><a className="btn" href={r.actionHref}>Job</a><a className="btn" href={r.documentsHref}>Documents</a></div></td></tr>)}{!readinessRows.length&&<tr><td colSpan={8}>No readiness rows match the current filter.</td></tr>}</tbody></table></div>

    <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))'}}>
      <div className="card"><h3 style={sectionTitle}>Template Master</h3><div style={formGrid}>
        <label><span style={labelStyle}>Name</span><input style={fieldStyle} value={tpl.name} onChange={e=>setTpl({...tpl,name:e.target.value})}/></label>
        <label><span style={labelStyle}>Template Type</span><input style={fieldStyle} value={tpl.templateType} onChange={e=>setTpl({...tpl,templateType:e.target.value})}/></label>
        <label><span style={labelStyle}>Channel</span><select style={fieldStyle} value={tpl.channel} onChange={e=>setTpl({...tpl,channel:e.target.value})}><option>DOCUMENT</option><option>EMAIL</option><option>PORTAL</option></select></label>
        <label><span style={labelStyle}>Document Type</span><input style={fieldStyle} value={tpl.documentType} onChange={e=>setTpl({...tpl,documentType:e.target.value})}/></label>
      </div><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Subject template</span><input style={fieldStyle} value={tpl.subjectTemplate} onChange={e=>setTpl({...tpl,subjectTemplate:e.target.value})}/></label><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Body template · variables like {'{{booking.bookingNo}}'} / {'{{customer.name}}'}</span><textarea style={{...fieldStyle,minHeight:100}} value={tpl.bodyTemplate} onChange={e=>setTpl({...tpl,bodyTemplate:e.target.value})}/></label><label style={{display:'flex',gap:8,marginTop:10}}><input type="checkbox" checked={tpl.requiresApproval} onChange={e=>setTpl({...tpl,requiresApproval:e.target.checked})}/> Generated document requires approval</label><button disabled={busy} className="btn" style={{marginTop:10}} onClick={()=>void post('/document-automation/templates',tpl,'Template saved')}>Save Template</button></div>

      <div className="card"><h3 style={sectionTitle}>Generate Shipping Document</h3><div style={formGrid}>
        <label><span style={labelStyle}>Booking</span><select style={fieldStyle} value={gen.bookingId} onChange={e=>setGen({...gen,bookingId:e.target.value})}><option value="">Select booking</option>{data.bookings.map((b:any)=><option key={b.id} value={b.id}>{b.bookingNo} · {b.customer?.name||b.customerId}</option>)}</select></label>
        <label><span style={labelStyle}>Template</span><select style={fieldStyle} value={gen.templateId} onChange={e=>setGen({...gen,templateId:e.target.value})}><option value="">Select template</option>{data.templates.filter((t:any)=>String(t.channel||'DOCUMENT')==='DOCUMENT'&&t.active!==false).map((t:any)=><option key={t.templateId} value={t.templateId}>{t.name}</option>)}</select></label>
        <label><span style={labelStyle}>Document Type Override</span><input style={fieldStyle} value={gen.documentType} onChange={e=>setGen({...gen,documentType:e.target.value})}/></label>
        <label><span style={labelStyle}>Document No Override</span><input style={fieldStyle} value={gen.documentNo} onChange={e=>setGen({...gen,documentNo:e.target.value})}/></label>
      </div><button disabled={busy||!gen.bookingId||!gen.templateId} className="btn" style={{marginTop:10}} onClick={()=>void post('/document-automation/generate',gen,'Document generated into controlled Documents workflow')}>Generate Document</button></div>

      <div className="card"><h3 style={sectionTitle}>Communication Record</h3><div style={formGrid}>
        <label><span style={labelStyle}>Booking</span><select style={fieldStyle} value={com.bookingId} onChange={e=>setCom({...com,bookingId:e.target.value})}><option value="">Select booking</option>{data.bookings.map((b:any)=><option key={b.id} value={b.id}>{b.bookingNo}</option>)}</select></label>
        <label><span style={labelStyle}>Communication Template</span><select style={fieldStyle} value={com.templateId} onChange={e=>setCom({...com,templateId:e.target.value})}><option value="">Optional template</option>{data.templates.filter((t:any)=>String(t.channel||'')!=='DOCUMENT'&&t.active!==false).map((t:any)=><option key={t.templateId} value={t.templateId}>{t.name}</option>)}</select></label>
        <label><span style={labelStyle}>Recipients</span><input style={fieldStyle} value={com.recipients} onChange={e=>setCom({...com,recipients:e.target.value})} placeholder="ops@customer.com, agent@example.com"/></label>
        <label><span style={labelStyle}>Channel</span><select style={fieldStyle} value={com.channel} onChange={e=>setCom({...com,channel:e.target.value})}><option>EMAIL</option><option>PORTAL</option><option>EDI</option></select></label>
      </div><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Subject override</span><input style={fieldStyle} value={com.subject} onChange={e=>setCom({...com,subject:e.target.value})}/></label><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Message override</span><textarea style={{...fieldStyle,minHeight:80}} value={com.message} onChange={e=>setCom({...com,message:e.target.value})}/></label><button disabled={busy||!com.bookingId||!com.recipients} className="btn" style={{marginTop:10}} onClick={()=>void post('/document-automation/communications',{...com,recipients:split(com.recipients)},'Communication record created as DRAFT')}>Create Communication</button></div>

      <div className="card"><h3 style={sectionTitle}>Bulk Document Pack</h3><div style={formGrid}>
        <label><span style={labelStyle}>Booking</span><select style={fieldStyle} value={pack.bookingId} onChange={e=>setPack({...pack,bookingId:e.target.value})}><option value="">Select booking</option>{data.bookings.map((b:any)=><option key={b.id} value={b.id}>{b.bookingNo}</option>)}</select></label>
        <label><span style={labelStyle}>Pack Type</span><select style={fieldStyle} value={pack.packType} onChange={e=>setPack({...pack,packType:e.target.value})}><option>CUSTOMER_PACK</option><option>AGENT_PACK</option><option>CARRIER_PACK</option><option>CUSTOMS_PACK</option><option>CLOSEOUT_PACK</option></select></label>
        <label><span style={labelStyle}>Pack Name</span><input style={fieldStyle} value={pack.name} onChange={e=>setPack({...pack,name:e.target.value})}/></label>
      </div><label style={{display:'flex',gap:8,marginTop:10}}><input type="checkbox" checked={pack.releasedOnly} onChange={e=>setPack({...pack,releasedOnly:e.target.checked})}/> Include released documents only</label><button disabled={busy||!pack.bookingId} className="btn" style={{marginTop:10}} onClick={()=>void post('/document-automation/packs',pack,'Document pack manifest created')}>Create Pack</button></div>
    </div>

    <div className="card" style={{marginTop:12,overflowX:'auto'}}><h3 style={sectionTitle}>Controlled Documents</h3><table><thead><tr><th>Booking</th><th>Document</th><th>Type</th><th>Version</th><th>Status</th><th>Release control</th></tr></thead><tbody>{data.documents.slice(0,40).map((d:any)=><tr key={d.id}><td>{d.booking?.bookingNo}</td><td>{d.documentNo}</td><td>{d.type}</td><td>{d.version}</td><td>{d.status}</td><td>{d.releaseControl||'-'}</td></tr>)}</tbody></table></div>

    <div className="card" style={{marginTop:12,overflowX:'auto'}}><h3 style={sectionTitle}>Communication History</h3><table><thead><tr><th>Booking</th><th>Channel</th><th>Recipients</th><th>Subject</th><th>Status</th><th>Status control</th></tr></thead><tbody>{data.communications.map((c:any)=><tr key={c.communicationId}><td>{c.bookingNo}</td><td>{c.channel}</td><td>{(c.recipients||[]).join(', ')}</td><td>{c.subject||'-'}</td><td>{c.status}</td><td><div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}><select style={{...fieldStyle,minWidth:120}} value={c.status} onChange={e=>void post(`/document-automation/communications/${c.communicationId}/status`,{status:e.target.value},`Communication marked ${e.target.value}`)}><option>DRAFT</option><option>QUEUED</option><option>SENT</option><option>DELIVERED</option><option>FAILED</option><option>BOUNCED</option></select>{['FAILED','BOUNCED'].includes(c.status)&&<button className="btn" disabled={busy} onClick={()=>void retryCommunication(c.communicationId)}>Retry</button>}{c.retryCount?<span className="sub">Retry {c.retryCount}</span>:null}</div></td></tr>)}</tbody></table></div>

    <div className="card" style={{marginTop:12,overflowX:'auto'}}><h3 style={sectionTitle}>Document Pack History</h3><table><thead><tr><th>Booking</th><th>Pack</th><th>Type</th><th>Documents</th><th>Created</th></tr></thead><tbody>{data.packs.map((p:any)=><tr key={p.packId}><td>{p.bookingNo}</td><td>{p.name}</td><td>{p.packType}</td><td>{p.documentCount}</td><td>{fmtDate(p.createdAt)}</td></tr>)}</tbody></table></div>
  </WorkspaceShell>;
}
