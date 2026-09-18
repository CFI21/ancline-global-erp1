'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell from './WorkspaceShell';
import {api,currentUser,requireToken} from '../lib/api';

const topTabs=['Details','Workflow & Tracking','eDocs','Notes','Logs'] as const;
const relationTabs=['Notes','Custom Fields','Sales Relations'] as const;

const blankLead={
  organizationId:'',organizationCode:'',organizationName:'',address1:'',address2:'',portCountry:'',city:'',postCode:'',state:'',website:'',registrationNumber:'',
  inquiryType:'EMAIL',inquiryTypeLabel:'Email Inquiry',contactName:'',phone:'',emailAddress:'',mobile:'',faxNumber:'',jobDescription:'',
  status:'OPEN',assignedSalesRep:'',originalCall:new Date().toISOString().slice(0,10),leadInterest:'WARM',closeReason:'',
  leadSourceCode:'DIRECT',leadSourceName:'Direct',sourceDetails:'',referringOrganization:'',referringContact:'',notes:'',customFields:{}
};

export default function SalesLeadWorkspace({leadId}:{leadId?:string}){
  const isNew=!leadId;
  const [token,setToken]=useState('');
  const [lead,setLead]=useState<any>(null);
  const [form,setForm]=useState<any>(blankLead);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [comms,setComms]=useState<any[]>([]);
  const [logs,setLogs]=useState<any>({events:[],audit:[]});
  const [tab,setTab]=useState<(typeof topTabs)[number]>('Details');
  const [relationTab,setRelationTab]=useState<(typeof relationTabs)[number]>('Sales Relations');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [comm,setComm]=useState<any>({type:'EMAIL',contact:'',subject:'',notes:''});
  const user=currentUser();

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[leadId]);

  async function load(t=token){
    try{
      const o=await api('/sales-crm/organizations',t);setOrgs(Array.isArray(o)?o:[]);
      if(isNew){
        const initial={...blankLead,assignedSalesRep:user?.email||''};
        setLead(initial);setForm(initial);setComm((x:any)=>({...x,contact:''}));return;
      }
      const [l,c,g]=await Promise.all([
        api(`/sales-crm/leads/${leadId}`,t),
        api(`/sales-crm/leads/${leadId}/communications`,t),
        api(`/sales-crm/leads/${leadId}/logs`,t)
      ]);
      setLead(l);setForm({...l,originalCall:l.originalCall?String(l.originalCall).slice(0,10):''});
      setComms(Array.isArray(c)?c:[]);setLogs(g||{events:[],audit:[]});setComm(x=>({...x,contact:l.contactName||''}));
    }catch(e:any){setMessage(e?.message||'Unable to load inquiry');}
  }

  function set(k:string,v:any){setForm((x:any)=>({...x,[k]:v}));}
  function applyOrg(id:string){
    const o=orgs.find((x:any)=>x.id===id);set('organizationId',id);
    if(o){
      const k=o.kycData||{};
      setForm((x:any)=>({...x,organizationId:id,organizationCode:o.code||'',organizationName:o.name||'',portCountry:o.countryCode||'',registrationNumber:o.registrationRef||'',address1:k.address1||x.address1||'',address2:k.address2||x.address2||'',city:k.city||x.city||'',postCode:k.postCode||x.postCode||'',state:k.state||x.state||'',website:k.website||x.website||''}));
    }
  }
  async function save(close=false){
    if(!form.organizationId&&!String(form.organizationName||'').trim()){setMessage('Organization is required.');return;}
    if(!String(form.contactName||'').trim()){setMessage('Inquiry Contact is required.');return;}
    setBusy(true);setMessage('');
    try{
      if(isNew){
        const created=await api('/sales-crm/leads',token,{method:'POST',body:JSON.stringify(form)});
        if(close){location.href='/sales-crm';return;}
        location.href=`/sales-crm/leads/${created.leadId}`;return;
      }
      await api(`/sales-crm/leads/${leadId}`,token,{method:'PATCH',body:JSON.stringify(form)});
      setMessage('Inquiry saved successfully.');if(close){location.href='/sales-crm';return;}await load();
    }catch(e:any){setMessage(e?.message||'Could not save inquiry');}
    finally{setBusy(false);}
  }
  async function addCommunication(){
    if(isNew){setMessage('Save the inquiry before adding communication.');return;}
    if(!comm.subject.trim())return;
    setBusy(true);
    try{await api(`/sales-crm/leads/${leadId}/communications`,token,{method:'POST',body:JSON.stringify(comm)});setComm({type:'EMAIL',contact:form.contactName||'',subject:'',notes:''});await load();setMessage('Communication added.');}
    catch(e:any){setMessage(e?.message||'Could not add communication');}
    finally{setBusy(false);}
  }
  async function convert(){
    if(isNew){setMessage('Save the inquiry first, then create the Sales Opportunity.');return;}
    setBusy(true);
    try{const r=await api(`/sales-crm/leads/${leadId}/opportunity`,token,{method:'POST',body:JSON.stringify({})});await load();setMessage(`Sales Opportunity ${r.opportunity?.opportunityId||''} created and linked.`);}
    catch(e:any){setMessage(e?.message||'Could not create Sales Opportunity');}
    finally{setBusy(false);}
  }

  const opportunity=lead?.opportunity||null;
  const opportunityId=opportunity?.opportunityId||form.opportunityId||'';
  const relationSummary=useMemo(()=>[form.inquiryTypeLabel||form.inquiryType,[form.leadSourceCode,form.leadSourceName].filter(Boolean).join(' - '),form.status].filter(Boolean).join('; '),[form]);
  const inquiryNo=form.inquiryNo||(isNew?'NEW':leadId||'');
  const field=(k:string,label:string,opts:{type?:string;green?:boolean;readonly?:boolean}={})=><div className="cw-row"><label>{label}</label><input className={'cw-input'+(opts.green?' cw-green':'')} type={opts.type||'text'} value={form[k]??''} readOnly={opts.readonly} onChange={e=>set(k,e.target.value)}/></div>;
  const select=(k:string,label:string,options:string[],green=false)=><div className="cw-row"><label>{label}</label><select className={'cw-input'+(green?' cw-green':'')} value={form[k]??''} onChange={e=>set(k,e.target.value)}>{options.map(x=><option key={x} value={x}>{x}</option>)}</select></div>;

  if(!lead)return <WorkspaceShell title="" subtitle="" active="/sales-crm/leads" hideHeader><div className="cw-screen"><div className="cw-loading">{message||'Loading inquiry...'}</div></div></WorkspaceShell>;

  return <WorkspaceShell title="" subtitle="" active="/sales-crm/leads" hideHeader>
    <div className="cw-screen">
      <div className="cw-titlebar">Edit Inquiry - {isNew?'New Inquiry':inquiryNo} - Branch: GLOBAL - Company: ANCLINE WORLDWIDE - Department: SALES - User: {user?.email||''}</div>
      <div className="cw-menubar"><button>File</button><button>Edit</button><button>Actions</button><button>Help</button><span className="cw-menuspacer"/><button onClick={()=>location.href='/sales-crm'}>Back to Sales CRM</button></div>
      <div className="cw-tabs">{topTabs.map(x=><button className={tab===x?'active':''} key={x} onClick={()=>setTab(x)}>{x}</button>)}</div>
      {message&&<div className="cw-message">{message}</div>}

      {tab==='Details'&&<>
        <div className="cw-headrow">
          <div className="cw-headitem"><label>Inquiry ID</label><input value={inquiryNo} readOnly/></div>
          <div className="cw-headitem"><label>Type</label><select value={form.inquiryType||'EMAIL'} onChange={e=>{set('inquiryType',e.target.value);set('inquiryTypeLabel',e.target.options[e.target.selectedIndex].text);}}><option value="EMAIL">Email Inquiry</option><option value="PHONE">Phone Inquiry</option><option value="WEB">Web Inquiry</option><option value="VISIT">Sales Visit</option><option value="REFERRAL">Referral</option></select><input className="cw-type-label" value={form.inquiryTypeLabel||''} readOnly/></div>
        </div>

        <div className="cw-main-grid">
          <fieldset className="cw-panel cw-org"><legend>Organization</legend>
            <div className="cw-row"><label>Name</label><select className="cw-input" value={form.organizationId||''} onChange={e=>applyOrg(e.target.value)}><option value="">New / unlinked prospect</option>{orgs.map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button className="cw-mini">...</button></div>
            {field('organizationName','',{green:false})}
            {field('address1','Address 1',{green:true})}
            {field('address2','Address 2',{green:true})}
            {field('portCountry','Port / Country',{green:true})}
            {field('city','City',{green:true})}
            {field('postCode','Post Code',{green:true})}
            {field('state','State',{green:true})}
            {field('website','Website')}
            {field('registrationNumber','Reg. Number')}
          </fieldset>

          <fieldset className="cw-panel cw-contact"><legend>Contact</legend>
            {field('contactName','Inquiry Contact')}
            <div className="cw-row"><label>Phone</label><input className="cw-input" value={form.phone||''} onChange={e=>set('phone',e.target.value)}/><button className="cw-phone">☎</button></div>
            {field('emailAddress','E-Mail Address',{type:'email'})}
            <div className="cw-row"><label>Mobile</label><input className="cw-input" value={form.mobile||''} onChange={e=>set('mobile',e.target.value)}/><button className="cw-phone">☎</button></div>
            {field('faxNumber','Fax Number')}
            <div className="cw-row"><label>Job Description</label><select className="cw-input" value={form.jobDescription||''} onChange={e=>set('jobDescription',e.target.value)}><option value=""></option><option>Employee (Administration)</option><option>Owner / Director</option><option>Operations</option><option>Procurement</option><option>Finance</option></select></div>
          </fieldset>

          <div className="cw-right-stack">
            <fieldset className="cw-panel"><legend>Details</legend>
              <div className="cw-row"><label>Status</label><select className="cw-input cw-status-open" value={form.status||'OPEN'} onChange={e=>set('status',e.target.value)}><option>OPEN</option><option>QUALIFIED</option><option>ON_HOLD</option><option>CONVERTED</option><option>CLOSED</option><option>LOST</option></select></div>
              {field('assignedSalesRep','Assigned Sales Rep')}
              {field('originalCall','Original Call',{type:'date'})}
              <div className="cw-row"><label>Lead Interest</label><select className="cw-input" value={form.leadInterest||'WARM'} onChange={e=>set('leadInterest',e.target.value)}><option>COLD</option><option>WARM</option><option>HOT</option></select></div>
              {field('closeReason','Close Reason')}
            </fieldset>

            <fieldset className="cw-panel"><legend>Lead Source</legend>
              <div className="cw-row"><label>Source</label><input className="cw-input cw-code" value={form.leadSourceCode||''} onChange={e=>set('leadSourceCode',e.target.value)}/><input className="cw-input" value={form.leadSourceName||''} onChange={e=>set('leadSourceName',e.target.value)}/></div>
              {field('sourceDetails','Source Details')}
              {field('referringOrganization','Referring Organization')}
              {field('referringContact','Referring Contact')}
            </fieldset>
          </div>
        </div>

        <div className="cw-bottom-grid">
          <div className="cw-lower-panel">
            <div className="cw-subtabs">{relationTabs.map(x=><button className={relationTab===x?'active':''} key={x} onClick={()=>setRelationTab(x)}>{x}</button>)}</div>
            {relationTab==='Notes'&&<textarea className="cw-notes" value={form.notes||''} onChange={e=>set('notes',e.target.value)}/>}
            {relationTab==='Custom Fields'&&<textarea className="cw-notes" value={JSON.stringify(form.customFields||{},null,2)} onChange={e=>{try{set('customFields',JSON.parse(e.target.value||'{}'));}catch{}}}/>}
            {relationTab==='Sales Relations'&&<div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Relation</th><th>Summary</th><th>Created Time</th><th>Last Edit Time</th></tr></thead><tbody>
              {!isNew&&<tr><td><b>INQ&nbsp; {inquiryNo}</b></td><td><b>{relationSummary}</b></td><td>{String(lead.createdAt||'').replace('T',' ').slice(0,16)}</td><td>{String(lead.updatedAt||lead.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>}
              {opportunityId&&<tr><td><a href={`/sales-crm?opportunity=${opportunityId}`}><b>OPP&nbsp; {opportunityId}</b></a></td><td>Sales Opportunity; {opportunity?.stage||'QUALIFY'}; {opportunity?.status||'OPEN'}</td><td>{String(opportunity?.createdAt||'').replace('T',' ').slice(0,16)}</td><td>{String(opportunity?.updatedAt||opportunity?.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>}
            </tbody></table></div>}
            <div className="cw-lower-actions"><span>Popup</span><span className="cw-spacer"/><button>□ New</button><button>✎ Edit</button><button>● Attach</button><button>⊖ Detach</button></div>
          </div>

          <div className="cw-lower-panel">
            <div className="cw-lower-title">Related Communication</div>
            <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Date</th><th>Type</th><th>Contact</th><th>Subject</th><th>Created Time</th></tr></thead><tbody>
              {comms.map((c:any)=><tr key={c.communicationId}><td>{String(c.date||'').slice(0,10)}</td><td>{c.type}</td><td>{c.contact}</td><td>{c.subject}</td><td>{String(c.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>)}
              {!comms.length&&<tr><td colSpan={5}>&nbsp;</td></tr>}
            </tbody></table></div>
            <div className="cw-comm-editor"><select value={comm.type} onChange={e=>setComm({...comm,type:e.target.value})}><option>EMAIL</option><option>PHONE</option><option>MEETING</option><option>NOTE</option></select><input placeholder="Contact" value={comm.contact} onChange={e=>setComm({...comm,contact:e.target.value})}/><input placeholder="Subject" value={comm.subject} onChange={e=>setComm({...comm,subject:e.target.value})}/><button disabled={busy||isNew||!comm.subject.trim()} onClick={()=>void addCommunication()}>Add</button></div>
            <div className="cw-lower-actions"><label><input type="checkbox"/> Show Notes</label><span className="cw-spacer"/><button disabled={isNew}>□ New</button><button disabled={isNew}>✎ Edit</button></div>
          </div>
        </div>

        <div className="cw-action-row">
          <button onClick={()=>location.href='/sales-crm'}>Close</button>
          <button>Set Client Intelligence</button>
          {!opportunityId?<button className="cw-primary-action" disabled={busy||isNew} onClick={()=>void convert()}>Create Sales Opportunity</button>:<button className="cw-primary-action" onClick={()=>location.href=`/sales-crm?opportunity=${opportunityId}`}>Open Sales Opportunity</button>}
        </div>
        <div className="cw-footerbar"><span className="cw-spacer"/><button onClick={()=>location.href='/sales-crm/leads/new'}>□ New</button><button disabled={busy} onClick={()=>void save(true)}>◉ Save & Close</button><button onClick={()=>location.href='/sales-crm'}>● Close</button></div>
      </>}

      {tab==='Workflow & Tracking'&&<div className="cw-tabpage"><h3>Workflow & Tracking</h3><div className="cw-track-grid"><div><b>Status</b><span>{form.status}</span></div><div><b>Assigned Sales Rep</b><span>{form.assignedSalesRep||'Unassigned'}</span></div><div><b>Lead Interest</b><span>{form.leadInterest}</span></div><div><b>Opportunity</b><span>{opportunityId||'Not created'}</span></div></div></div>}
      {tab==='eDocs'&&<div className="cw-tabpage"><h3>eDocs</h3><p>Lead-level document workspace. Booking documents remain separated from sales-lead records.</p></div>}
      {tab==='Notes'&&<div className="cw-tabpage"><h3>Notes</h3><textarea className="cw-notes cw-notes-large" value={form.notes||''} onChange={e=>set('notes',e.target.value)}/><button className="cw-classic-btn" disabled={busy} onClick={()=>void save(false)}>Save Notes</button></div>}
      {tab==='Logs'&&<div className="cw-tabpage"><h3>Logs</h3><div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Time</th><th>Type</th><th>Status / Action</th><th>Actor</th></tr></thead><tbody>{(logs.events||[]).map((x:any,i:number)=><tr key={'e'+i}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>{x.eventType}</td><td>{x.status}</td><td>{x.payload?.updatedBy||x.payload?.createdBy||'System'}</td></tr>)}{(logs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>AUDIT</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}</tbody></table></div></div>}
    </div>
  </WorkspaceShell>;
}
