'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell from './WorkspaceShell';
import {api,currentUser,requireToken} from '../lib/api';

const tabs=['Details','Workflow & Tracking','Quotes','Notes','Logs'] as const;
const blankOpp={
  customerId:'',name:'',owner:'',stage:'QUALIFY',probability:20,value:0,currency:'USD',
  origin:'',destination:'',equipment:'40HC',expectedClose:'',source:'DIRECT',notes:'',
  status:'OPEN',sourceLeadId:'',sourceInquiryNo:'',inquiryContact:'',inquiryEmail:'',
  inquiryPhone:'',leadInterest:'',leadSource:'',leadSourceDetails:'',referringOrganization:'',
  referringContact:'',lossReason:'',competitor:''
};

export default function SalesOpportunityWorkspace({opportunityId}:{opportunityId?:string}){
  const isNew=!opportunityId;
  const [token,setToken]=useState('');
  const [opp,setOpp]=useState<any>(null);
  const [form,setForm]=useState<any>(blankOpp);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [quotes,setQuotes]=useState<any[]>([]);
  const [activities,setActivities]=useState<any[]>([]);
  const [logs,setLogs]=useState<any>({events:[],audit:[]});
  const [tab,setTab]=useState<(typeof tabs)[number]>('Details');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [quote,setQuote]=useState<any>({buyRate:0,sellRate:0,currency:'USD',trade:'',equipment:'40HC',validFrom:new Date().toISOString().slice(0,10),validTo:new Date(Date.now()+30*86400000).toISOString().slice(0,10),notes:''});
  const [activity,setActivity]=useState<any>({date:new Date().toISOString().slice(0,10),type:'FOLLOW_UP',contact:'',subject:'',notes:''});
  const user=currentUser();

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[opportunityId]);

  async function load(t=token){
    try{
      const o=await api('/sales-crm/organizations',t);setOrgs(Array.isArray(o)?o:[]);
      if(isNew){
        const initial={...blankOpp,owner:user?.email||''};
        setOpp(initial);setForm(initial);return;
      }
      const [r,q,a,l]=await Promise.all([
        api(`/sales-crm/opportunities/${opportunityId}`,t),
        api(`/sales-crm/opportunities/${opportunityId}/quotes`,t),
        api(`/sales-crm/opportunities/${opportunityId}/activities`,t),
        api(`/sales-crm/opportunities/${opportunityId}/logs`,t)
      ]);
      const mapped={...r,expectedClose:r.expectedClose?String(r.expectedClose).slice(0,10):''};
      setOpp(r);setForm(mapped);setQuotes(Array.isArray(q)?q:[]);setActivities(Array.isArray(a)?a:[]);setLogs(l||{events:[],audit:[]});
      setActivity((x:any)=>({...x,contact:r.inquiryContact||x.contact||''}));
      setQuote((x:any)=>({...x,currency:r.currency||x.currency,equipment:r.equipment||x.equipment,trade:[r.origin,r.destination].filter(Boolean).join('->')||x.trade}));
    }catch(e:any){setMessage(e?.message||'Unable to load Sales Opportunity');}
  }
  function set(k:string,v:any){setForm((x:any)=>({...x,[k]:v}));}
  function applyCustomer(id:string){
    const o=orgs.find((x:any)=>x.id===id);
    setForm((x:any)=>({...x,customerId:id,customer:o||null}));
  }
  async function save(close=false){
    if(!form.customerId){setMessage('Customer is required.');return;}
    if(!String(form.name||'').trim()){setMessage('Opportunity name is required.');return;}
    setBusy(true);setMessage('');
    try{
      const payload={...form,probability:Number(form.probability||0),value:Number(form.value||0),expectedClose:form.expectedClose||null};
      if(isNew){
        const created=await api('/sales-crm/opportunities',token,{method:'POST',body:JSON.stringify(payload)});
        if(close){location.href='/sales-crm/opportunities';return;}
        location.href=`/sales-crm/opportunities/${created.opportunityId}`;return;
      }
      await api(`/sales-crm/opportunities/${opportunityId}`,token,{method:'PATCH',body:JSON.stringify(payload)});
      if(close){location.href='/sales-crm/opportunities';return;}
      await load();setMessage('Sales Opportunity saved.');
    }catch(e:any){setMessage(e?.message||'Could not save Sales Opportunity');}
    finally{setBusy(false);}
  }
  async function registerActivity(){
    if(isNew||!String(activity.subject||'').trim())return;
    setBusy(true);
    try{
      await api(`/sales-crm/opportunities/${opportunityId}/activities`,token,{method:'POST',body:JSON.stringify(activity)});
      setActivity({date:new Date().toISOString().slice(0,10),type:'FOLLOW_UP',contact:form.inquiryContact||'',subject:'',notes:''});
      await load();setMessage('Activity registered.');
    }catch(e:any){setMessage(e?.message||'Could not register activity');}
    finally{setBusy(false);}
  }
  async function createQuote(){
    if(isNew)return;
    setBusy(true);
    try{
      await api(`/sales-crm/opportunities/${opportunityId}/quotes`,token,{method:'POST',body:JSON.stringify({...quote,buyRate:Number(quote.buyRate||0),sellRate:Number(quote.sellRate||0)})});
      await load();setMessage('Quote version created.');
    }catch(e:any){setMessage(e?.message||'Quote version could not be created');}
    finally{setBusy(false);}
  }
  async function quoteAction(id:string,action:string){
    setBusy(true);
    try{await api(`/sales-crm/quotes/${id}/${action}`,token,{method:'POST',body:'{}'});await load();setMessage(action==='publish'?'Quote published.':'Quote approved.');}
    catch(e:any){setMessage(e?.message||'Quote action failed');}
    finally{setBusy(false);}
  }
  async function closeOpportunity(result:'WON'|'LOST'){
    if(isNew)return;
    const lossReason=result==='LOST'?(prompt('Loss reason?')||'Unspecified'):null;
    const competitor=result==='LOST'?(prompt('Competitor, if known?')||null):null;
    setBusy(true);
    try{await api(`/sales-crm/opportunities/${opportunityId}/close/${result}`,token,{method:'POST',body:JSON.stringify({lossReason,competitor})});await load();setMessage(`Opportunity marked ${result}.`);}
    catch(e:any){setMessage(e?.message||'Opportunity close action failed');}
    finally{setBusy(false);}
  }

  const customer=useMemo(()=>orgs.find((x:any)=>x.id===form.customerId)||opp?.customer||null,[orgs,form.customerId,opp]);
  const activityRows=useMemo(()=>activities.slice().sort((a:any,b:any)=>new Date(b.createdAt||b.date).getTime()-new Date(a.createdAt||a.date).getTime()).slice(0,14),[activities]);
  const weighted=Number(form.value||0)*Number(form.probability||0)/100;
  const field=(k:string,label:string,opts:{type?:string;readonly?:boolean}={})=><div className="cw-row"><label>{label}</label><input className="cw-input" type={opts.type||'text'} value={form[k]??''} readOnly={opts.readonly} onChange={e=>set(k,e.target.value)}/><span/></div>;

  if(!opp)return <WorkspaceShell title="" subtitle="" active="/sales-crm/opportunities" hideHeader><div className="cw-screen"><div className="cw-loading">{message||'Loading Sales Opportunity...'}</div></div></WorkspaceShell>;

  return <WorkspaceShell title="" subtitle="" active="/sales-crm/opportunities" hideHeader>
    <div className="cw-screen">
      <div className="cw-titlebar">Edit Sales Opportunity - {isNew?'New Opportunity':opportunityId} - Branch: GLOBAL - Company: ANCLINE WORLDWIDE - Department: SALES - User: {user?.email||''}</div>
      <div className="cw-menubar"><button>File</button><button>Edit</button><button>Actions</button><button>Help</button><span className="cw-menuspacer"/><button onClick={()=>location.href='/sales-crm/opportunities'}>Opportunity Register</button><button onClick={()=>location.href='/sales-crm'}>Pipeline Dashboard</button></div>
      <div className="cw-tabs">{tabs.map(x=><button className={tab===x?'active':''} key={x} onClick={()=>setTab(x)}>{x}</button>)}</div>
      {message&&<div className="cw-message">{message}</div>}

      {tab==='Details'&&<>
        <div className="cw-headrow opp-headrow">
          <div className="cw-headitem"><label>Opportunity ID</label><input value={isNew?'NEW':opportunityId||''} readOnly/></div>
          <div className="cw-headitem"><label>Status</label><input className="opp-status-head" value={form.status||'OPEN'} readOnly/></div>
          <div className="cw-headitem"><label>Stage</label><input value={form.stage||'QUALIFY'} readOnly/></div>
        </div>

        <div className="cw-workspace-body">
          <div className="cw-workspace-left">
            <div className="cw-main-grid">
              <fieldset className="cw-panel cw-form3040 opp-customer"><legend>Customer</legend>
                <div className="cw-row"><label>Name</label><select className="cw-input" value={form.customerId||''} onChange={e=>applyCustomer(e.target.value)}><option value="">Select customer</option>{orgs.filter((o:any)=>Array.isArray(o.roles)&&o.roles.includes('CUSTOMER')).map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button className="cw-mini" type="button">...</button></div>
                <div className="cw-row"><label>Code</label><input className="cw-input" value={customer?.code||''} readOnly/><span/></div>
                <div className="cw-row"><label>Country</label><input className="cw-input" value={customer?.countryCode||''} readOnly/><span/></div>
                <div className="cw-row"><label>Reg. Number</label><input className="cw-input" value={customer?.registrationRef||''} readOnly/><span/></div>
                {field('inquiryContact','Inquiry Contact')}
                {field('inquiryEmail','E-Mail')}
                {field('inquiryPhone','Phone')}
              </fieldset>

              <fieldset className="cw-panel cw-form3040 opp-commercial"><legend>Sales Opportunity</legend>
                {field('name','Opportunity Name')}
                <div className="cw-row"><label>Value</label><input className="cw-input" type="number" value={form.value??0} onChange={e=>set('value',e.target.value)}/><select className="cw-input opp-inline-select" value={form.currency||'USD'} onChange={e=>set('currency',e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>CNY</option></select></div>
                {field('origin','Origin')}
                {field('destination','Destination')}
                {field('equipment','Equipment')}
                {field('source','Source')}
                <div className="cw-row"><label>Weighted Value</label><input className="cw-input" value={Number(weighted||0).toFixed(2)} readOnly/><span/></div>
              </fieldset>

              <div className="cw-right-stack">
                <fieldset className="cw-panel cw-form3040 opp-details"><legend>Details</legend>
                  <div className="cw-row"><label>Status</label><select className="cw-input cw-status-open" value={form.status||'OPEN'} onChange={e=>set('status',e.target.value)}><option>OPEN</option><option>ON_HOLD</option><option>WON</option><option>LOST</option></select><span/></div>
                  {field('owner','Owner')}
                  <div className="cw-row"><label>Stage</label><select className="cw-input" value={form.stage||'QUALIFY'} onChange={e=>set('stage',e.target.value)}>{['QUALIFY','DISCOVERY','SOLUTION','PRICING','NEGOTIATION','WON','LOST'].map(x=><option key={x}>{x}</option>)}</select><span/></div>
                  <div className="cw-row"><label>Probability %</label><input className="cw-input" type="number" min="0" max="100" value={form.probability??0} onChange={e=>set('probability',e.target.value)}/><span/></div>
                  {field('expectedClose','Expected Close',{type:'date'})}
                  {field('lossReason','Loss Reason')}
                  {field('competitor','Competitor')}
                </fieldset>

                <fieldset className="cw-panel cw-form3040 opp-source"><legend>Inquiry / Lead Source</legend>
                  {field('sourceInquiryNo','Inquiry ID',{readonly:true})}
                  {field('leadInterest','Lead Interest',{readonly:true})}
                  {field('leadSource','Lead Source',{readonly:true})}
                  {field('leadSourceDetails','Source Details',{readonly:true})}
                  {field('referringOrganization','Referring Org.',{readonly:true})}
                  {field('referringContact','Referring Contact',{readonly:true})}
                </fieldset>
              </div>
            </div>

            <div className="cw-bottom-grid">
              <div className="cw-lower-panel cw-sales-relations-panel">
                <div className="cw-lower-title">Sales Relations</div>
                <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Relation</th><th>Summary</th><th>Status</th><th>Updated</th></tr></thead><tbody>
                  {form.sourceLeadId&&<tr><td><a href={`/sales-crm/leads/${form.sourceLeadId}`}><b>INQ&nbsp; {form.sourceInquiryNo||form.sourceLeadId}</b></a></td><td>{opp?.sourceLead?.organizationName||customer?.name||'Inquiry'}; {form.inquiryContact||'—'}</td><td>{opp?.sourceLead?.status||'CONVERTED'}</td><td>{String(opp?.sourceLead?.updatedAt||opp?.sourceLead?.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>}
                  {!isNew&&<tr><td><b>OPP&nbsp; {opportunityId}</b></td><td>{form.name}; {form.origin||'—'} → {form.destination||'—'}</td><td>{form.status}</td><td>{String(opp?.updatedAt||opp?.createdAt||'').replace('T',' ').slice(0,16)}</td></tr>}
                </tbody></table></div>
                <div className="cw-lower-actions"><span>Popup</span><span className="cw-spacer"/><button disabled={!form.sourceLeadId} onClick={()=>{if(form.sourceLeadId)location.href=`/sales-crm/leads/${form.sourceLeadId}`;}}>Open Inquiry</button><button onClick={()=>setTab('Quotes')}>Quotes</button></div>
              </div>

              <div className="cw-lower-panel cw-related-communication-panel">
                <div className="cw-lower-title">Quote Versions</div>
                <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Version</th><th>Sell</th><th>Margin</th><th>Status</th></tr></thead><tbody>
                  {quotes.slice(0,6).map((q:any)=><tr key={q.quoteVersionId}><td>v{q.version}</td><td>{q.currency} {Number(q.sellRate||0).toFixed(2)}</td><td>{Number(q.marginPct||0).toFixed(1)}%</td><td>{q.rateQuoteId?'PUBLISHED':q.status}</td></tr>)}
                  {!quotes.length&&<tr><td colSpan={4}>No quote versions.</td></tr>}
                </tbody></table></div>
                <div className="cw-lower-actions"><span className="cw-spacer"/><button disabled={isNew} onClick={()=>setTab('Quotes')}>New Quote</button></div>
              </div>
            </div>
          </div>

          <aside className="cw-summary-rail cw-activity-rail">
            <div className="cw-summary-title cw-activity-title">Current Activity Registration</div>
            <div className="cw-activity-register">
              <div className="cw-activity-field"><label>Date</label><input type="date" value={activity.date||''} onChange={e=>setActivity({...activity,date:e.target.value})}/></div>
              <div className="cw-activity-field"><label>Activity Type</label><select value={activity.type} onChange={e=>setActivity({...activity,type:e.target.value})}><option value="FOLLOW_UP">Follow Up</option><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="MEETING">Meeting</option><option value="NOTE">Note</option></select></div>
              <div className="cw-activity-field"><label>Contact</label><input value={activity.contact||''} onChange={e=>setActivity({...activity,contact:e.target.value})}/></div>
              <div className="cw-activity-field"><label>Subject</label><input value={activity.subject||''} onChange={e=>setActivity({...activity,subject:e.target.value})}/></div>
              <div className="cw-activity-field cw-activity-notes"><label>Notes</label><textarea value={activity.notes||''} onChange={e=>setActivity({...activity,notes:e.target.value})}/></div>
              <button className="cw-register-activity" disabled={busy||isNew||!String(activity.subject||'').trim()} onClick={()=>void registerActivity()}>Register Activity</button>
              {isNew&&<div className="cw-activity-hint">Save the Opportunity first to register activity.</div>}
            </div>
            <div className="cw-activity-list-head"><span>Current Activity</span><b>{activityRows.length}</b></div>
            <div className="cw-activity-feed">
              {activityRows.map((x:any)=><div className="cw-activity-item" key={x.activityId||x.createdAt}>
                <div className="cw-activity-item-top"><span>{String(x.date||x.createdAt||'').replace('T',' ').slice(0,16)}</span><b>{x.type}</b></div>
                <div className="cw-activity-subject">{x.subject}</div>
                <div className="cw-activity-meta"><span>{x.contact||x.createdBy||'System'}</span><em>Registered</em></div>
              </div>)}
              {!activityRows.length&&<div className="cw-activity-empty">No activity registered yet.</div>}
            </div>
          </aside>
        </div>

        <div className="cw-action-row">
          <button onClick={()=>location.href='/sales-crm/opportunities'}>Close</button>
          <button disabled={busy||isNew||form.status==='WON'} onClick={()=>void closeOpportunity('WON')}>Mark Won</button>
          <button disabled={busy||isNew||form.status==='LOST'} onClick={()=>void closeOpportunity('LOST')}>Mark Lost</button>
          <button className="cw-primary-action" disabled={busy||isNew} onClick={()=>setTab('Quotes')}>Create / Manage Quote</button>
        </div>
        <div className="cw-footerbar"><span className="cw-spacer"/><button onClick={()=>location.href='/sales-crm/opportunities/new'}>□ New</button><button disabled={busy} onClick={()=>void save(false)}>◉ Save</button><button disabled={busy} onClick={()=>void save(true)}>◉ Save & Close</button><button onClick={()=>location.href='/sales-crm/opportunities'}>● Close</button></div>
      </>}

      {tab==='Workflow & Tracking'&&<div className="cw-tabpage"><h3>Workflow & Tracking</h3><div className="cw-track-grid"><div><b>Status</b><span>{form.status}</span></div><div><b>Stage</b><span>{form.stage}</span></div><div><b>Probability</b><span>{form.probability}%</span></div><div><b>Expected Close</b><span>{form.expectedClose||'—'}</span></div></div><div className="opp-workflow-line"><b>Lead → Opportunity → Quote → Booking</b><span>{form.sourceInquiryNo||'No source inquiry'} → {isNew?'NEW':opportunityId} → {quotes.length?quotes[0].quoteVersionId:'No quote'} → Pending booking</span></div></div>}

      {tab==='Quotes'&&<div className="cw-tabpage opp-quote-page"><h3>Quote Versioning — {form.name||opportunityId}</h3>
        <div className="opp-quote-form">
          {['buyRate','sellRate','currency','trade','equipment','validFrom','validTo'].map(k=><label key={k}><span>{k}</span><input type={k==='buyRate'||k==='sellRate'?'number':k==='validFrom'||k==='validTo'?'date':'text'} value={quote[k]??''} onChange={e=>setQuote({...quote,[k]:e.target.value})}/></label>)}
        </div>
        <button className="cw-classic-btn" disabled={busy||isNew} onClick={()=>void createQuote()}>Create Quote Version</button>
        <div className="cw-tablewrap opp-quotes-table"><table className="cw-table"><thead><tr><th>Version</th><th>Buy</th><th>Sell</th><th>GP</th><th>Margin</th><th>Validity</th><th>Status</th><th>Commercial Quote</th><th>Action</th></tr></thead><tbody>
          {quotes.map((q:any)=><tr key={q.quoteVersionId}><td>v{q.version}</td><td>{q.currency} {q.buyRate}</td><td>{q.currency} {q.sellRate}</td><td>{q.currency} {Number(q.grossProfit||0).toFixed(2)}</td><td>{Number(q.marginPct||0).toFixed(1)}%</td><td>{String(q.validTo||'').slice(0,10)}</td><td>{q.status}</td><td>{q.rateQuoteId||'—'}</td><td>{q.status==='DRAFT'?<button className="cw-classic-btn" onClick={()=>void quoteAction(q.quoteVersionId,'approve')}>Approve</button>:!q.rateQuoteId?<button className="cw-classic-btn" onClick={()=>void quoteAction(q.quoteVersionId,'publish')}>Publish</button>:'Published'}</td></tr>)}
          {!quotes.length&&<tr><td colSpan={9}>No quote versions.</td></tr>}
        </tbody></table></div>
      </div>}

      {tab==='Notes'&&<div className="cw-tabpage"><h3>Notes</h3><textarea className="cw-notes cw-notes-large" value={form.notes||''} onChange={e=>set('notes',e.target.value)}/><button className="cw-classic-btn" disabled={busy} onClick={()=>void save(false)}>Save Notes</button></div>}

      {tab==='Logs'&&<div className="cw-tabpage"><h3>Logs</h3><div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Time</th><th>Type</th><th>Status / Action</th><th>Actor</th></tr></thead><tbody>
        {(logs.events||[]).map((x:any,i:number)=><tr key={'e'+i}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>{x.eventType}</td><td>{x.status}</td><td>{x.payload?.updatedBy||x.payload?.createdBy||'System'}</td></tr>)}
        {(logs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>AUDIT</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}
      </tbody></table></div></div>}
    </div>
  </WorkspaceShell>;
}
