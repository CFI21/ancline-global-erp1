'use client';
import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,currentUser,requireToken} from '../../lib/api';

const blankLead={
 organizationId:'',organizationName:'',inquiryType:'EMAIL',inquiryTypeLabel:'Email Inquiry',
 contactName:'',phone:'',emailAddress:'',mobile:'',fax:'',jobDescription:'',
 status:'OPEN',assignedSalesRep:'',originalCall:new Date().toISOString().slice(0,10),
 leadInterest:'WARM',closeReasonCode:'',closeReasonDescription:'',
 leadSourceCode:'DIRECT',leadSourceName:'Direct',sourceDetails:'',
 referringOrganization:'',referringContact:'',notes:'',opportunityId:''
};

export default function SalesCrmPage(){
 const [token,setToken]=useState('');
 const [data,setData]=useState<any>({summary:{},leads:[],opportunities:[],tenders:[],pipelineByCurrency:[],lossReasons:[]});
 const [customers,setCustomers]=useState<any[]>([]);
 const [organizations,setOrganizations]=useState<any[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);

 const [lead,setLead]=useState<any>(blankLead);
 const [leadId,setLeadId]=useState('');
 const [leadDetail,setLeadDetail]=useState<any>(null);
 const [leadComms,setLeadComms]=useState<any[]>([]);
 const [leadLogs,setLeadLogs]=useState<any>({events:[],audit:[]});
 const [showLeadEditor,setShowLeadEditor]=useState(false);
 const [leadComm,setLeadComm]=useState<any>({date:new Date().toISOString().slice(0,10),type:'EMAIL',contact:'',subject:'',notes:''});

 const [opp,setOpp]=useState<any>({customerId:'',name:'',owner:'',stage:'QUALIFY',probability:'20',value:'0',currency:'USD',origin:'',destination:'',equipment:'40HC',expectedClose:'',source:'DIRECT',notes:''});
 const [tender,setTender]=useState<any>({customerId:'',name:'',opportunityId:'',trade:'',equipment:'40HC',estimatedVolume:'0',volumeUnit:'TEU',deadline:'',status:'OPEN',owner:'',notes:''});
 const [selected,setSelected]=useState<any>(null);
 const [quotes,setQuotes]=useState<any[]>([]);
 const [quote,setQuote]=useState<any>({buyRate:'0',sellRate:'0',currency:'USD',trade:'',equipment:'40HC',validFrom:new Date().toISOString().slice(0,10),validTo:new Date(Date.now()+30*86400000).toISOString().slice(0,10),notes:''});

 useEffect(()=>{
   const t=requireToken();if(!t)return;
   setToken(t);
   void load(t);
   const p=new URLSearchParams(location.search);
   const requestedLead=p.get('lead');
   const newInquiry=p.get('newInquiry');
   if(requestedLead)void openLead(requestedLead,t);
   else if(newInquiry==='1')newInquiryForm();
 },[]);

 useEffect(()=>{
   const id=new URLSearchParams(location.search).get('opportunity');
   if(!id||!data?.opportunities?.length)return;
   const x=data.opportunities.find((r:any)=>r.opportunityId===id);
   if(x&&!selected)void selectOpp(x);
 },[data?.opportunities]);

 async function load(t=token){
   try{
     const [d,c,o]=await Promise.all([
       api('/sales-crm/dashboard',t),
       api('/sales-crm/customers',t),
       api('/sales-crm/organizations',t)
     ]);
     setData(d);setCustomers(c);setOrganizations(o);
   }catch(e:any){setMessage(e.message||'Unable to load Sales CRM');}
 }

 function newInquiryForm(){
   const me=currentUser();
   setLead({...blankLead,assignedSalesRep:me?.email||''});
   setLeadId('');setLeadDetail(null);setLeadComms([]);setLeadLogs({events:[],audit:[]});
   setLeadComm({date:new Date().toISOString().slice(0,10),type:'EMAIL',contact:'',subject:'',notes:''});
   setShowLeadEditor(true);setMessage('');
   setTimeout(()=>document.getElementById('inquiry-editor')?.scrollIntoView({behavior:'smooth',block:'start'}),20);
 }

 async function openLead(id:string,t=token){
   setBusy(true);setMessage('');
   try{
     const [r,c,l]=await Promise.all([
       api(`/sales-crm/leads/${id}`,t),
       api(`/sales-crm/leads/${id}/communications`,t).catch(()=>[]),
       api(`/sales-crm/leads/${id}/logs`,t).catch(()=>({events:[],audit:[]}))
     ]);
     const mapped={...blankLead,...r,originalCall:r.originalCall?String(r.originalCall).slice(0,10):''};
     setLead(mapped);setLeadId(id);setLeadDetail(r);setLeadComms(Array.isArray(c)?c:[]);setLeadLogs(l||{events:[],audit:[]});
     setLeadComm({date:new Date().toISOString().slice(0,10),type:'EMAIL',contact:r.contactName||'',subject:'',notes:''});
     setShowLeadEditor(true);
     if(location.pathname==='/sales-crm')history.replaceState(null,'',`/sales-crm?lead=${encodeURIComponent(id)}#inquiries`);
     setTimeout(()=>document.getElementById('inquiry-editor')?.scrollIntoView({behavior:'smooth',block:'start'}),20);
   }catch(e:any){setMessage(e?.message||'Unable to open Inquiry / Sales Lead');}
   finally{setBusy(false);}
 }

 async function saveLead(){
   if(!lead.organizationId&&!String(lead.organizationName||'').trim()){setMessage('Organization is required.');return;}
   if(!String(lead.contactName||'').trim()){setMessage('Inquiry Contact is required.');return;}
   setBusy(true);setMessage('');
   try{
     const org=organizations.find((x:any)=>x.id===lead.organizationId);
     const payload={...lead,organizationName:lead.organizationName||org?.name||''};
     if(!leadId){
       const created=await api('/sales-crm/leads',token,{method:'POST',body:JSON.stringify(payload)});
       await load();
       await openLead(created.leadId);
       setMessage('Inquiry created successfully.');
     }else{
       await api(`/sales-crm/leads/${leadId}`,token,{method:'PATCH',body:JSON.stringify(payload)});
       await load();
       await openLead(leadId);
       setMessage('Inquiry saved successfully.');
     }
   }catch(e:any){setMessage(e.message||'Inquiry / lead could not be saved');}
   finally{setBusy(false);}
 }

 async function addLeadCommunication(){
   if(!leadId){setMessage('Save the Inquiry before registering activity.');return;}
   if(!String(leadComm.subject||'').trim())return;
   setBusy(true);
   try{
     await api(`/sales-crm/leads/${leadId}/communications`,token,{method:'POST',body:JSON.stringify(leadComm)});
     await openLead(leadId);
     setMessage('Inquiry activity registered.');
   }catch(e:any){setMessage(e.message||'Could not register Inquiry activity');}
   finally{setBusy(false);}
 }

 async function convertLead(){
   if(!leadId){setMessage('Save the Inquiry first.');return;}
   setBusy(true);
   try{
     const r=await api(`/sales-crm/leads/${leadId}/opportunity`,token,{method:'POST',body:'{}'});
     await load();
     await openLead(leadId);
     const id=r?.opportunity?.opportunityId||r?.opportunityId||'';
     setMessage(`Sales Opportunity ${id} created and linked.`);
   }catch(e:any){setMessage(e.message||'Could not create Sales Opportunity');}
   finally{setBusy(false);}
 }

 async function createOpp(){setBusy(true);try{await api('/sales-crm/opportunities',token,{method:'POST',body:JSON.stringify({...opp,probability:Number(opp.probability),value:Number(opp.value)})});setMessage('Opportunity created.');setOpp({...opp,name:'',value:'0'});await load();}catch(e:any){setMessage(e.message||'Opportunity could not be created');}finally{setBusy(false);}}
 async function createTender(){setBusy(true);try{await api('/sales-crm/tenders',token,{method:'POST',body:JSON.stringify({...tender,estimatedVolume:Number(tender.estimatedVolume)})});setMessage('Tender / RFQ created.');await load();}catch(e:any){setMessage(e.message||'Tender could not be created');}finally{setBusy(false);}}
 async function selectOpp(x:any){setSelected(x);try{setQuotes(await api(`/sales-crm/opportunities/${x.opportunityId}/quotes`,token));}catch(e:any){setMessage(e.message||'Unable to load quote versions');}}
 async function createQuote(){if(!selected)return;setBusy(true);try{await api(`/sales-crm/opportunities/${selected.opportunityId}/quotes`,token,{method:'POST',body:JSON.stringify({...quote,buyRate:Number(quote.buyRate),sellRate:Number(quote.sellRate)})});setQuotes(await api(`/sales-crm/opportunities/${selected.opportunityId}/quotes`,token));setMessage('Quote version created.');}catch(e:any){setMessage(e.message||'Quote version could not be created');}finally{setBusy(false);}}
 async function quoteAction(id:string,action:string){setBusy(true);try{await api(`/sales-crm/quotes/${id}/${action}`,token,{method:'POST',body:'{}'});if(selected)setQuotes(await api(`/sales-crm/opportunities/${selected.opportunityId}/quotes`,token));setMessage(action==='publish'?'Quote published into Commercial / Quotes.':'Quote version approved.');await load();}catch(e:any){setMessage(e.message||'Quote action failed');}finally{setBusy(false);}}
 async function closeOpp(id:string,result:string){const lossReason=result==='LOST'?prompt('Loss reason?')||'Unspecified':null;setBusy(true);try{await api(`/sales-crm/opportunities/${id}/close/${result}`,token,{method:'POST',body:JSON.stringify({lossReason})});await load();setMessage(`Opportunity marked ${result}.`);}catch(e:any){setMessage(e.message||'Opportunity update failed');}finally{setBusy(false);}}

 const s=data.summary||{};
 const linkedOpportunityId=lead.opportunityId||leadDetail?.opportunity?.opportunityId||'';
 const orgForLead=organizations.find((x:any)=>x.id===lead.organizationId);
 const leadActivities=useMemo(()=>leadComms.slice().sort((a:any,b:any)=>new Date(b.createdAt||b.date).getTime()-new Date(a.createdAt||a.date).getTime()),[leadComms]);

 const leadField=(label:string,child:any)=><label><span style={labelStyle}>{label}</span>{child}</label>;

 return <WorkspaceShell title="Sales CRM / Pipeline" subtitle="Inquiries, sales leads, opportunities, tenders/RFQs, quote versions, forecast and win/loss control" active="/sales-crm" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
  {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:12}}>
   {[
    ['Open Inquiries',s.openLeads],['Open Opportunities',s.openOpportunities],['Won',s.won],['Lost',s.lost],['Win Rate',`${Number(s.winRate||0).toFixed(1)}%`],['Open Tenders',s.openTenders]
   ].map(([a,b])=><div className="card" key={String(a)}><div className="sub">{a}</div><div style={{fontSize:24,fontWeight:800}}>{b??0}</div></div>)}
  </div>

  <div id="inquiries" className="card" style={{marginBottom:12,display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
    <div>
      <h3 style={{...sectionTitle,marginBottom:4}}>Inquiry / Sales Leads</h3>
      <div className="sub">Create, qualify, manage activity and convert inquiries directly inside the Sales CRM / Pipeline workspace.</div>
    </div>
    <button className="btn" onClick={newInquiryForm}>+ New Inquiry</button>
  </div>

  {showLeadEditor&&<div id="inquiry-editor" style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(300px,.85fr)',gap:12,alignItems:'start',marginBottom:12}}>
    <div>
      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}>
          <h3 style={{...sectionTitle,marginBottom:0,flex:1}}>{leadId?`Inquiry ${lead.inquiryNo||leadId}`:'New Inquiry / Sales Lead'}</h3>
          <span className="status">{lead.status||'OPEN'}</span>
        </div>
        <div style={{...formGrid,marginTop:12}}>
          {leadField('Organization *',<select style={fieldStyle} value={lead.organizationId||''} onChange={e=>{const o=organizations.find((x:any)=>x.id===e.target.value);setLead({...lead,organizationId:e.target.value,organizationName:o?.name||''});}}><option value="">Select organization</option>{organizations.map((o:any)=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select>)}
          {leadField('Organization Name',<input style={fieldStyle} value={lead.organizationName||orgForLead?.name||''} onChange={e=>setLead({...lead,organizationName:e.target.value})}/>)}
          {leadField('Inquiry Type',<select style={fieldStyle} value={lead.inquiryType||'EMAIL'} onChange={e=>setLead({...lead,inquiryType:e.target.value,inquiryTypeLabel:e.target.options[e.target.selectedIndex].text})}><option value="EMAIL">Email Inquiry</option><option value="PHONE">Phone Inquiry</option><option value="WEB">Web Inquiry</option><option value="VISIT">Sales Visit</option><option value="REFERRAL">Referral</option></select>)}
          {leadField('Status',<select style={fieldStyle} value={lead.status||'OPEN'} onChange={e=>setLead({...lead,status:e.target.value})}><option>OPEN</option><option>QUALIFIED</option><option>ON_HOLD</option><option>CONVERTED</option><option>CLOSED</option><option>LOST</option></select>)}
          {leadField('Inquiry Contact *',<input style={fieldStyle} value={lead.contactName||''} onChange={e=>setLead({...lead,contactName:e.target.value})}/>)}
          {leadField('E-Mail',<input style={fieldStyle} value={lead.emailAddress||''} onChange={e=>setLead({...lead,emailAddress:e.target.value})}/>)}
          {leadField('Phone',<input style={fieldStyle} value={lead.phone||''} onChange={e=>setLead({...lead,phone:e.target.value})}/>)}
          {leadField('Mobile',<input style={fieldStyle} value={lead.mobile||''} onChange={e=>setLead({...lead,mobile:e.target.value})}/>)}
          {leadField('Job Description',<input style={fieldStyle} value={lead.jobDescription||''} onChange={e=>setLead({...lead,jobDescription:e.target.value})}/>)}
          {leadField('Assigned Sales Rep',<input style={fieldStyle} value={lead.assignedSalesRep||''} onChange={e=>setLead({...lead,assignedSalesRep:e.target.value})}/>)}
          {leadField('Original Call',<input type="date" style={fieldStyle} value={lead.originalCall||''} onChange={e=>setLead({...lead,originalCall:e.target.value})}/>)}
          {leadField('Lead Interest',<select style={fieldStyle} value={lead.leadInterest||'WARM'} onChange={e=>setLead({...lead,leadInterest:e.target.value})}><option>COLD</option><option>WARM</option><option>HOT</option></select>)}
          {leadField('Lead Source',<select style={fieldStyle} value={lead.leadSourceCode||'DIRECT'} onChange={e=>setLead({...lead,leadSourceCode:e.target.value,leadSourceName:e.target.options[e.target.selectedIndex].text})}><option value="DIRECT">Direct</option><option value="OAG">OAG</option><option value="WEB">Web</option><option value="REF">Referral</option><option value="PHONE">Phone</option><option value="VIS">Sales Visit</option></select>)}
          {leadField('Source Details',<input style={fieldStyle} value={lead.sourceDetails||''} onChange={e=>setLead({...lead,sourceDetails:e.target.value})}/>)}
          {leadField('Referring Organization',<input style={fieldStyle} value={lead.referringOrganization||''} onChange={e=>setLead({...lead,referringOrganization:e.target.value})}/>)}
          {leadField('Referring Contact',<input style={fieldStyle} value={lead.referringContact||''} onChange={e=>setLead({...lead,referringContact:e.target.value})}/>)}
          {leadField('Close Reason',<input style={fieldStyle} value={lead.closeReasonDescription||''} onChange={e=>setLead({...lead,closeReasonDescription:e.target.value})}/>)}
        </div>
        <label style={{display:'block',marginTop:10}}><span style={labelStyle}>Notes</span><textarea style={{...fieldStyle,minHeight:100,resize:'vertical'}} value={lead.notes||''} onChange={e=>setLead({...lead,notes:e.target.value})}/></label>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginTop:12}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn" disabled={busy} onClick={()=>void saveLead()}>{leadId?'Save Inquiry':'Create Inquiry'}</button>
            {leadId&&!linkedOpportunityId&&<button className="btn" disabled={busy} onClick={()=>void convertLead()}>Create Sales Opportunity</button>}
            {linkedOpportunityId&&<button className="btn" onClick={()=>location.href=`/sales-crm/opportunities/${linkedOpportunityId}`}>Open Opportunity {linkedOpportunityId}</button>}
          </div>
          <button className="btn" onClick={()=>{setShowLeadEditor(false);history.replaceState(null,'','/sales-crm#inquiries');}}>Close Editor</button>
        </div>
      </div>

      {leadId&&<div className="card">
        <h3 style={sectionTitle}>Inquiry Audit / System Activity</h3>
        <div style={{overflowX:'auto',maxHeight:310,overflowY:'auto'}}><table className="table"><thead><tr><th>Time</th><th>Type</th><th>Status / Action</th><th>Actor</th></tr></thead><tbody>
          {(leadLogs.events||[]).map((x:any,i:number)=><tr key={'e'+i}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>{x.eventType}</td><td>{x.status}</td><td>{x.payload?.updatedBy||x.payload?.createdBy||'System'}</td></tr>)}
          {(leadLogs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>Audit</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}
          {!(leadLogs.events||[]).length&&!(leadLogs.audit||[]).length&&<tr><td colSpan={4}>No audit entries.</td></tr>}
        </tbody></table></div>
      </div>}
    </div>

    <div>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Current Activity Registration</h3>
        <div style={{display:'grid',gap:8}}>
          {leadField('Date',<input type="date" style={fieldStyle} value={leadComm.date||''} onChange={e=>setLeadComm({...leadComm,date:e.target.value})}/>)}
          {leadField('Activity Type',<select style={fieldStyle} value={leadComm.type||'EMAIL'} onChange={e=>setLeadComm({...leadComm,type:e.target.value})}><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="MEETING">Meeting</option><option value="FOLLOW_UP">Follow Up</option><option value="NOTE">Note</option></select>)}
          {leadField('Contact',<input style={fieldStyle} value={leadComm.contact||''} onChange={e=>setLeadComm({...leadComm,contact:e.target.value})}/>)}
          {leadField('Subject',<input style={fieldStyle} value={leadComm.subject||''} onChange={e=>setLeadComm({...leadComm,subject:e.target.value})}/>)}
          <label><span style={labelStyle}>Notes</span><textarea style={{...fieldStyle,minHeight:85,resize:'vertical'}} value={leadComm.notes||''} onChange={e=>setLeadComm({...leadComm,notes:e.target.value})}/></label>
          <button className="btn" disabled={busy||!leadId||!String(leadComm.subject||'').trim()} onClick={()=>void addLeadCommunication()}>Register Activity</button>
          {!leadId&&<div className="sub">Save the Inquiry first to register activity.</div>}
        </div>
      </div>

      <div className="card">
        <h3 style={sectionTitle}>Recent Inquiry Activity</h3>
        <div style={{display:'grid',gap:7,maxHeight:430,overflowY:'auto'}}>
          {leadActivities.slice(0,20).map((x:any)=><div key={x.communicationId||x.createdAt} style={{border:'1px solid #dfe5ea',borderRadius:7,padding:8,background:'#fafcfd'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:11,color:'#627687'}}><span>{String(x.date||x.createdAt||'').replace('T',' ').slice(0,16)}</span><b>{x.type}</b></div>
            <div style={{fontWeight:800,margin:'3px 0',fontSize:12}}>{x.subject||'Communication'}</div>
            <div className="sub">{x.contact||x.createdBy||'System'}</div>
          </div>)}
          {!leadActivities.length&&<div className="sub">No activity registered yet.</div>}
        </div>
      </div>
    </div>
  </div>}

  <div className="card" style={{marginBottom:12}}>
   <h3 style={sectionTitle}>Inquiry / Lead Register</h3>
   <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Inquiry</th><th>Type</th><th>Organization</th><th>Contact</th><th>Sales Rep</th><th>Interest</th><th>Source</th><th>Status</th><th>Opportunity</th><th></th></tr></thead><tbody>
    {(data.leads||[]).map((x:any)=><tr key={x.leadId}>
      <td><b>{x.inquiryNo}</b></td><td>{x.inquiryTypeLabel||x.inquiryType}</td><td>{x.organizationName}</td>
      <td>{x.contactName}<div className="sub">{x.emailAddress||x.phone||''}</div></td><td>{x.assignedSalesRep||'—'}</td>
      <td><span className="status">{x.leadInterest||'—'}</span></td><td>{[x.leadSourceCode,x.leadSourceName].filter(Boolean).join(' - ')}</td>
      <td><span className="status">{x.status}</span></td>
      <td>{x.opportunityId?<button className="btn" onClick={()=>location.href=`/sales-crm/opportunities/${x.opportunityId}`}>{x.opportunityId}</button>:'—'}</td>
      <td><button className="btn" disabled={busy} onClick={()=>void openLead(x.leadId)}>Open</button></td>
    </tr>)}
    {!(data.leads||[]).length&&<tr><td colSpan={10}>No inquiries / leads yet.</td></tr>}
   </tbody></table></div>
  </div>

  <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Pipeline Forecast</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Currency</th><th>Gross Pipeline</th><th>Weighted Forecast</th></tr></thead><tbody>{(data.pipelineByCurrency||[]).map((x:any)=><tr key={x.currency}><td>{x.currency}</td><td>{Number(x.grossPipeline||0).toFixed(2)}</td><td>{Number(x.weightedPipeline||0).toFixed(2)}</td></tr>)}</tbody></table></div></div>

  <div className="card" style={{marginBottom:12}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><h3 style={sectionTitle}>New Opportunity</h3><a className="btn" href="/sales-crm/opportunities/new" style={{textDecoration:'none'}}>Open Opportunity</a></div>
   <div style={formGrid}>
    <label><span style={labelStyle}>Customer</span><select style={fieldStyle} value={opp.customerId} onChange={e=>setOpp({...opp,customerId:e.target.value})}><option value="">Select customer</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {['name','owner','value','currency','origin','destination','equipment','expectedClose','source'].map(k=><label key={k}><span style={labelStyle}>{k}</span><input type={k==='value'?'number':k==='expectedClose'?'date':'text'} style={fieldStyle} value={opp[k]} onChange={e=>setOpp({...opp,[k]:e.target.value})}/></label>)}
    <label><span style={labelStyle}>Stage</span><select style={fieldStyle} value={opp.stage} onChange={e=>setOpp({...opp,stage:e.target.value})}>{['QUALIFY','DISCOVERY','SOLUTION','PRICING','NEGOTIATION'].map(x=><option key={x}>{x}</option>)}</select></label>
    <label><span style={labelStyle}>Probability %</span><input type="number" style={fieldStyle} value={opp.probability} onChange={e=>setOpp({...opp,probability:e.target.value})}/></label>
   </div>
   <button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void createOpp()}>Create Opportunity</button>
  </div>

  <div className="card" style={{marginBottom:12}}>
   <h3 style={sectionTitle}>Opportunity Pipeline</h3>
   <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Opportunity</th><th>Customer</th><th>Stage</th><th>Probability</th><th>Value</th><th>Lane</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {(data.opportunities||[]).map((x:any)=><tr key={x.opportunityId}><td><a className="btn" href={`/sales-crm/opportunities/${x.opportunityId}`} style={{textDecoration:'none'}}>{x.name}</a></td><td>{customers.find(c=>c.id===x.customerId)?.name||x.customerId}</td><td>{x.stage}</td><td>{x.probability}%</td><td>{x.currency} {Number(x.value||0).toFixed(2)}</td><td>{x.origin||'—'} → {x.destination||'—'}</td><td>{x.status}</td><td>{!['WON','LOST'].includes(x.status)&&<><button className="btn" onClick={()=>void closeOpp(x.opportunityId,'WON')}>Won</button> <button className="btn" onClick={()=>void closeOpp(x.opportunityId,'LOST')}>Lost</button></>}</td></tr>)}
   </tbody></table></div>
  </div>

  {selected&&<div className="card" style={{marginBottom:12}}>
   <h3 style={sectionTitle}>Quote Versioning — {selected.name}</h3>
   <div style={formGrid}>{['buyRate','sellRate','currency','trade','equipment','validFrom','validTo'].map(k=><label key={k}><span style={labelStyle}>{k}</span><input type={k==='buyRate'||k==='sellRate'?'number':k==='validFrom'||k==='validTo'?'date':'text'} style={fieldStyle} value={quote[k]} onChange={e=>setQuote({...quote,[k]:e.target.value})}/></label>)}</div>
   <button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void createQuote()}>Create Version</button>
   <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Version</th><th>Buy</th><th>Sell</th><th>Margin</th><th>Validity</th><th>Status</th><th>Commercial Quote</th><th>Action</th></tr></thead><tbody>
    {quotes.map((q:any)=><tr key={q.quoteVersionId}><td>v{q.version}</td><td>{q.currency} {q.buyRate}</td><td>{q.currency} {q.sellRate}</td><td>{Number(q.marginPct||0).toFixed(1)}%</td><td>{String(q.validTo||'').slice(0,10)}</td><td>{q.status}</td><td>{q.rateQuoteId?<button className="btn" onClick={()=>location.href=`/rates/${q.rateQuoteId}`}>Open Quote</button>:'—'}</td><td>{q.status==='DRAFT'?<button className="btn" onClick={()=>void quoteAction(q.quoteVersionId,'approve')}>Approve</button>:!q.rateQuoteId?<button className="btn" onClick={()=>void quoteAction(q.quoteVersionId,'publish')}>Publish</button>:'Published'}</td></tr>)}
   </tbody></table></div>
  </div>}

  <div className="card" style={{marginBottom:12}}>
   <h3 style={sectionTitle}>Tender / RFQ Register</h3>
   <div style={formGrid}>
    <label><span style={labelStyle}>Customer</span><select style={fieldStyle} value={tender.customerId} onChange={e=>setTender({...tender,customerId:e.target.value})}><option value="">Select customer</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {['name','opportunityId','trade','equipment','estimatedVolume','volumeUnit','deadline','owner'].map(k=><label key={k}><span style={labelStyle}>{k}</span><input type={k==='estimatedVolume'?'number':k==='deadline'?'date':'text'} style={fieldStyle} value={tender[k]} onChange={e=>setTender({...tender,[k]:e.target.value})}/></label>)}
   </div>
   <button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void createTender()}>Create Tender / RFQ</button>
   <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Tender</th><th>Customer</th><th>Trade</th><th>Volume</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{(data.tenders||[]).map((x:any)=><tr key={x.tenderId}><td>{x.name}</td><td>{customers.find(c=>c.id===x.customerId)?.name||x.customerId}</td><td>{x.trade||'—'}</td><td>{x.estimatedVolume} {x.volumeUnit}</td><td>{String(x.deadline||'').slice(0,10)||'—'}</td><td>{x.status}</td></tr>)}</tbody></table></div>
  </div>

  <div className="card"><h3 style={sectionTitle}>Win / Loss Analysis</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Loss Reason</th><th>Count</th></tr></thead><tbody>{(data.lossReasons||[]).map((x:any)=><tr key={x.reason}><td>{x.reason}</td><td>{String(x.count)}</td></tr>)}</tbody></table></div></div>
 </WorkspaceShell>;
}
