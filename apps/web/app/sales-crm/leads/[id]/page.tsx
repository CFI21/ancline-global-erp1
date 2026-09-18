'use client';
import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';
import WorkspaceShell,{fieldStyle,labelStyle} from '../../../../components/WorkspaceShell';
import {api,requireToken} from '../../../../lib/api';

const tabNames=['Details','Workflow & Tracking','eDocs','Notes','Logs'] as const;
const subTabs=['Notes','Custom Fields','Sales Relations'] as const;

export default function SalesLeadDetailPage(){
 const params=useParams<{id:string}>(),id=String(params?.id||'');
 const [token,setToken]=useState(''),[lead,setLead]=useState<any>(null),[form,setForm]=useState<any>({}),[orgs,setOrgs]=useState<any[]>([]),[comms,setComms]=useState<any[]>([]),[logs,setLogs]=useState<any>({events:[],audit:[]});
 const [tab,setTab]=useState<(typeof tabNames)[number]>('Details'),[subTab,setSubTab]=useState<(typeof subTabs)[number]>('Notes');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [comm,setComm]=useState<any>({type:'EMAIL',contact:'',subject:'',notes:''});
 useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[id]);
 async function load(t=token){try{const [l,o,c,g]=await Promise.all([api(`/sales-crm/leads/${id}`,t),api('/sales-crm/organizations',t),api(`/sales-crm/leads/${id}/communications`,t),api(`/sales-crm/leads/${id}/logs`,t)]);setLead(l);setForm(l);setOrgs(o);setComms(c);setLogs(g);setComm((x:any)=>({...x,contact:l.contactName||''}));}catch(e:any){setMessage(e.message||'Unable to load inquiry');}}
 function set(k:string,v:any){setForm((x:any)=>({...x,[k]:v}));}
 async function save(close=false){setBusy(true);try{const updated=await api(`/sales-crm/leads/${id}`,token,{method:'PATCH',body:JSON.stringify(form)});setLead((x:any)=>({...x,...updated}));setMessage('Inquiry saved.');if(close)location.href='/sales-crm';else await load();}catch(e:any){setMessage(e.message||'Could not save inquiry');}finally{setBusy(false);}}
 async function addCommunication(){setBusy(true);try{await api(`/sales-crm/leads/${id}/communications`,token,{method:'POST',body:JSON.stringify(comm)});setComm({type:'EMAIL',contact:form.contactName||'',subject:'',notes:''});await load();setMessage('Communication added.');}catch(e:any){setMessage(e.message||'Could not add communication');}finally{setBusy(false);}}
 async function convert(){setBusy(true);try{const r=await api(`/sales-crm/leads/${id}/opportunity`,token,{method:'POST',body:JSON.stringify({})});await load();setMessage(`Sales Opportunity ${r.opportunity?.opportunityId||''} created and linked.`);}catch(e:any){setMessage(e.message||'Could not create Sales Opportunity');}finally{setBusy(false);}}
 const opportunity=lead?.opportunity||null;
 const summary=useMemo(()=>[form.inquiryTypeLabel||form.inquiryType,[form.leadSourceCode,form.leadSourceName].filter(Boolean).join(' - '),form.status].filter(Boolean).join('; '),[form]);
 if(!lead)return <WorkspaceShell title="Inquiry / Lead" subtitle="Loading Sales Lead" active="/sales-crm"><div className="card">{message||'Loading inquiry...'}</div></WorkspaceShell>;
 const grid3={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10} as const;
 const section={border:'1px solid #dce4eb',borderRadius:8,padding:12,background:'#fff'} as const;
 const input=(k:string,label:string,type='text')=><label><span style={labelStyle}>{label}</span><input type={type} style={fieldStyle} value={form[k]??''} onChange={e=>set(k,e.target.value)}/></label>;
 return <WorkspaceShell
   title={`Inquiry ${form.inquiryNo||''}`}
   subtitle="Sales Lead / Inquiry Workspace"
   active="/sales-crm"
   actions={<>
    {!opportunity&&!form.opportunityId&&<button className="btn" disabled={busy} onClick={()=>void convert()}>Create Sales Opportunity</button>}
    {(opportunity||form.opportunityId)&&<a className="btn" href={`/sales-crm?opportunity=${opportunity?.opportunityId||form.opportunityId}`} style={{textDecoration:'none'}}>Open Sales Opportunity</a>}
    <button className="btn" disabled={busy} onClick={()=>void save(false)}>Save</button>
    <button className="btn" disabled={busy} onClick={()=>void save(true)}>Save & Close</button>
   </>}
  >
  {message&&<div className="card" style={{marginBottom:10}}>{message}</div>}
  <div className="card" style={{marginBottom:10,padding:0}}>
   <div style={{display:'flex',gap:0,overflowX:'auto'}}>{tabNames.map(x=><button key={x} onClick={()=>setTab(x)} style={{border:0,borderBottom:tab===x?'3px solid #17385e':'3px solid transparent',background:tab===x?'#f4f7fa':'#fff',padding:'11px 15px',fontWeight:700,cursor:'pointer'}}>{x}</button>)}</div>
  </div>

  {tab==='Details'&&<>
   <div className="card" style={{marginBottom:10}}>
    <div style={{...grid3,gridTemplateColumns:'1fr 1fr 1fr'}}>
     <div>{input('inquiryNo','Inquiry ID')}</div>
     <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={form.inquiryType||'EMAIL'} onChange={e=>{set('inquiryType',e.target.value);set('inquiryTypeLabel',e.target.options[e.target.selectedIndex].text);}}><option value="EMAIL">Email Inquiry</option><option value="PHONE">Phone Inquiry</option><option value="WEB">Web Inquiry</option><option value="VISIT">Sales Visit</option><option value="REFERRAL">Referral</option></select></label>
     <div><span style={labelStyle}>Relation Summary</span><div className="status">{summary}</div></div>
    </div>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'start'}}>
    <div style={{display:'grid',gap:12}}>
     <section style={section}><h3 style={{marginTop:0}}>Organization</h3><div style={grid3}>
      <label><span style={labelStyle}>Name</span><select style={fieldStyle} value={form.organizationId||''} onChange={e=>{const o=orgs.find((x:any)=>x.id===e.target.value);set('organizationId',e.target.value);if(o){set('organizationName',o.name);set('organizationCode',o.code);set('portCountry',o.countryCode||'');set('registrationNumber',o.registrationRef||'');}}}><option value="">Unlinked prospect</option>{orgs.map((o:any)=><option value={o.id} key={o.id}>{o.code} - {o.name}</option>)}</select></label>
      {input('organizationName','Organization Name')}{input('address1','Address 1')}{input('address2','Address 2')}{input('portCountry','Port / Country')}{input('city','City')}{input('postCode','Post Code')}{input('state','State')}{input('website','Website')}{input('registrationNumber','Reg. Number')}
     </div></section>
     <section style={section}><h3 style={{marginTop:0}}>Contact</h3><div style={grid3}>{input('contactName','Inquiry Contact')}{input('phone','Phone')}{input('emailAddress','E-Mail Address','email')}{input('mobile','Mobile')}{input('faxNumber','Fax Number')}{input('jobDescription','Job Description')}</div></section>
    </div>
    <div style={{display:'grid',gap:12}}>
     <section style={section}><h3 style={{marginTop:0}}>Details</h3><div style={grid3}>
      <label><span style={labelStyle}>Status</span><select style={fieldStyle} value={form.status||'OPEN'} onChange={e=>set('status',e.target.value)}><option>OPEN</option><option>QUALIFIED</option><option>ON_HOLD</option><option>CONVERTED</option><option>CLOSED</option><option>LOST</option></select></label>
      {input('assignedSalesRep','Assigned Sales Rep')}{input('originalCall','Original Call','date')}
      <label><span style={labelStyle}>Lead Interest</span><select style={fieldStyle} value={form.leadInterest||'WARM'} onChange={e=>set('leadInterest',e.target.value)}><option>COLD</option><option>WARM</option><option>HOT</option></select></label>
      {input('closeReason','Close Reason')}
     </div></section>
     <section style={section}><h3 style={{marginTop:0}}>Lead Source</h3><div style={grid3}>{input('leadSourceCode','Source Code')}{input('leadSourceName','Source')}{input('sourceDetails','Source Details')}{input('referringOrganization','Referring Organization')}{input('referringContact','Referring Contact')}</div></section>
     <section style={section}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><h3 style={{margin:0}}>Related Communication</h3></div>
      <div style={{...grid3,marginTop:10}}><label><span style={labelStyle}>Type</span><select style={fieldStyle} value={comm.type} onChange={e=>setComm({...comm,type:e.target.value})}><option>EMAIL</option><option>PHONE</option><option>MEETING</option><option>NOTE</option></select></label><label><span style={labelStyle}>Contact</span><input style={fieldStyle} value={comm.contact} onChange={e=>setComm({...comm,contact:e.target.value})}/></label><label><span style={labelStyle}>Subject</span><input style={fieldStyle} value={comm.subject} onChange={e=>setComm({...comm,subject:e.target.value})}/></label></div>
      <button className="btn" style={{marginTop:8}} disabled={busy||!comm.subject.trim()} onClick={()=>void addCommunication()}>+ Add Communication</button>
      <div style={{overflowX:'auto',marginTop:10}}><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Contact</th><th>Subject</th><th>Created Time</th></tr></thead><tbody>{comms.map((c:any)=><tr key={c.communicationId}><td>{String(c.date||'').slice(0,10)}</td><td>{c.type}</td><td>{c.contact}</td><td>{c.subject}</td><td>{String(c.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>)}{!comms.length&&<tr><td colSpan={5}>No related communication yet.</td></tr>}</tbody></table></div>
     </section>
    </div>
   </div>
   <div className="card" style={{marginTop:12}}>
    <div style={{display:'flex',gap:4,borderBottom:'1px solid #e1e7ed',marginBottom:10}}>{subTabs.map(x=><button key={x} onClick={()=>setSubTab(x)} style={{border:0,borderBottom:subTab===x?'2px solid #17385e':'2px solid transparent',background:'transparent',padding:'8px 10px',fontWeight:700}}>{x}</button>)}</div>
    {subTab==='Notes'&&<textarea style={{...fieldStyle,minHeight:90}} value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Lead / inquiry notes"/>}
    {subTab==='Custom Fields'&&<div><div className="sub">Custom fields are preserved as structured lead data.</div><textarea style={{...fieldStyle,minHeight:90,marginTop:8}} value={JSON.stringify(form.customFields||{},null,2)} onChange={e=>{try{set('customFields',JSON.parse(e.target.value||'{}'));}catch{}}}/></div>}
    {subTab==='Sales Relations'&&<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Relation</th><th>Summary</th><th>Created Time</th><th>Last Edit Time</th></tr></thead><tbody><tr><td><b>{form.inquiryNo}</b></td><td>{summary}</td><td>{String(lead.createdAt||'').replace('T',' ').slice(0,16)}</td><td>{String(lead.updatedAt||lead.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>{(opportunity||form.opportunityId)&&<tr><td><a href={`/sales-crm?opportunity=${opportunity?.opportunityId||form.opportunityId}`}><b>{opportunity?.opportunityId||form.opportunityId}</b></a></td><td>Sales Opportunity; {opportunity?.stage||'QUALIFY'}; {opportunity?.status||'OPEN'}</td><td>{String(opportunity?.createdAt||'').replace('T',' ').slice(0,16)}</td><td>{String(opportunity?.updatedAt||opportunity?.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>}</tbody></table></div>}
   </div>
  </>}

  {tab==='Workflow & Tracking'&&<div className="card"><h3>Workflow & Tracking</h3><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="status">Inquiry {form.status}</span><span className="status">Interest {form.leadInterest}</span><span className="status">Owner {form.assignedSalesRep||'Unassigned'}</span>{(opportunity||form.opportunityId)&&<span className="status">Opportunity linked</span>}</div><p className="sub">Lead qualification is auditable. Conversion preserves the original Inquiry ID and source lead relation.</p></div>}
  {tab==='eDocs'&&<div className="card"><h3>eDocs</h3><p className="sub">Lead-level document attachments are reserved for the document integration layer. Booking documents remain separated from inquiry data.</p></div>}
  {tab==='Notes'&&<div className="card"><h3>Notes</h3><textarea style={{...fieldStyle,minHeight:180}} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/><button className="btn" style={{marginTop:8}} onClick={()=>void save(false)}>Save Notes</button></div>}
  {tab==='Logs'&&<div className="card"><h3>Logs</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Time</th><th>Type</th><th>Status / Action</th><th>Actor</th></tr></thead><tbody>{(logs.events||[]).map((x:any,i:number)=><tr key={'e'+i}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>{x.eventType}</td><td>{x.status}</td><td>{x.payload?.updatedBy||x.payload?.createdBy||'System'}</td></tr>)}{(logs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>AUDIT</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}</tbody></table></div></div>}
 </WorkspaceShell>;
}
