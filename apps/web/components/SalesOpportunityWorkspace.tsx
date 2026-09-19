'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from './WorkspaceShell';
import {api,currentUser,requireToken} from '../lib/api';

const tabs=['Details','Workflow & Tracking','Quotes','Notes','Logs'] as const;
const blankOpp={
  customerId:'',name:'',owner:'',stage:'QUALIFY',probability:20,value:0,currency:'USD',
  origin:'',destination:'',equipment:'40HC',expectedClose:'',source:'DIRECT',notes:'',
  status:'OPEN',sourceLeadId:'',sourceInquiryNo:'',inquiryContact:'',inquiryEmail:'',
  inquiryPhone:'',leadInterest:'',leadSource:'',leadSourceDetails:'',referringOrganization:'',
  referringContact:'',lossReason:'',competitor:''
};

function statusTone(status:string){
  const s=String(status||'').toUpperCase();
  if(s==='WON')return {background:'#e8f5e9',borderColor:'#a5d6a7',color:'#2e7d32'};
  if(s==='LOST')return {background:'#ffebee',borderColor:'#ef9a9a',color:'#c62828'};
  if(s==='ON_HOLD')return {background:'#fff8e1',borderColor:'#ffe082',color:'#8d6e00'};
  return {background:'#e3f2fd',borderColor:'#90caf9',color:'#1565c0'};
}

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
    try{
      await api(`/sales-crm/quotes/${id}/${action}`,token,{method:'POST',body:'{}'});
      await load();setMessage(action==='publish'?'Quote published to ANC Commercial Quotes.':'Quote version approved.');
    }catch(e:any){setMessage(e?.message||'Quote action failed');}
    finally{setBusy(false);}
  }

  async function closeOpportunity(result:'WON'|'LOST'){
    if(isNew)return;
    const lossReason=result==='LOST'?(prompt('Loss reason?')||'Unspecified'):null;
    const competitor=result==='LOST'?(prompt('Competitor, if known?')||null):null;
    setBusy(true);
    try{
      await api(`/sales-crm/opportunities/${opportunityId}/close/${result}`,token,{method:'POST',body:JSON.stringify({lossReason,competitor})});
      await load();setMessage(`Opportunity marked ${result}.`);
    }catch(e:any){setMessage(e?.message||'Opportunity close action failed');}
    finally{setBusy(false);}
  }

  const customers=useMemo(()=>orgs.filter((o:any)=>Array.isArray(o.roles)&&o.roles.includes('CUSTOMER')),[orgs]);
  const customer=useMemo(()=>orgs.find((x:any)=>x.id===form.customerId)||opp?.customer||null,[orgs,form.customerId,opp]);
  const weighted=Number(form.value||0)*Number(form.probability||0)/100;
  const tone=statusTone(form.status);

  if(!opp)return <WorkspaceShell title="Sales Opportunity" subtitle="Loading opportunity workspace" active="/sales-crm/opportunities"><div className="card">{message||'Loading Sales Opportunity...'}</div></WorkspaceShell>;

  const modernField=(label:string,child:any)=><label><span style={labelStyle}>{label}</span>{child}</label>;
  const input=(k:string,opts:{type?:string;readonly?:boolean}={})=><input style={fieldStyle} type={opts.type||'text'} value={form[k]??''} readOnly={opts.readonly} onChange={e=>set(k,e.target.value)}/>;

  return <WorkspaceShell
    title={isNew?'New Sales Opportunity':form.name||opportunityId||'Sales Opportunity'}
    subtitle="Commercial pipeline, inquiry relationship, activity management, quote versioning and win/loss control"
    active="/sales-crm/opportunities"
    actions={<>
      {form.sourceLeadId&&<button className="btn" onClick={()=>location.href=`/sales-crm?lead=${form.sourceLeadId}#inquiries`}>Open Inquiry</button>}
      <button className="btn" onClick={()=>location.href='/sales-crm/opportunities'}>Opportunity Register</button>
      <button className="btn" onClick={()=>location.href='/sales-crm'}>Pipeline Dashboard</button>
    </>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:12}}>
      {[
        ['Opportunity ID',isNew?'NEW':opportunityId||'—','Commercial reference'],
        ['Status',form.status||'OPEN',form.stage||'QUALIFY'],
        ['Probability',`${Number(form.probability||0)}%`,'Win probability'],
        ['Value',`${form.currency||'USD'} ${Number(form.value||0).toFixed(2)}`,'Gross opportunity'],
        ['Weighted',`${form.currency||'USD'} ${weighted.toFixed(2)}`,'Forecast value'],
        ['Quotes',String(quotes.length),'Quote versions']
      ].map(([label,value,note])=><div className="card" key={label}>
        <div style={{fontSize:11,fontWeight:800,color:'#526778',textTransform:'uppercase'}}>{label}</div>
        <div style={{fontSize:22,fontWeight:900,color:'#153a5d',margin:'5px 0'}}>{value}</div>
        <div className="sub">{note}</div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:12,paddingBottom:0}}>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {tabs.map(x=><button key={x} className="btn" onClick={()=>setTab(x)} style={tab===x?{background:'#153a5d',color:'#fff',borderColor:'#153a5d'}:{}}>{x}</button>)}
      </div>
    </div>

    {tab==='Details'&&<>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(300px,.85fr)',gap:12,alignItems:'start'}}>
        <div>
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:10}}>
              <h3 style={{...sectionTitle,marginBottom:0,flex:1}}>Customer & Opportunity</h3>
              <span style={{...tone,border:'1px solid',borderRadius:16,padding:'5px 10px',fontSize:11,fontWeight:800}}>{form.status||'OPEN'}</span>
            </div>
            <div style={formGrid}>
              {modernField('Customer *',<select style={fieldStyle} value={form.customerId||''} onChange={e=>set('customerId',e.target.value)}><option value="">Select customer</option>{customers.map((o:any)=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select>)}
              {modernField('Customer Code',<input style={fieldStyle} value={customer?.code||''} readOnly/>)}
              {modernField('Country',<input style={fieldStyle} value={customer?.countryCode||''} readOnly/>)}
              {modernField('Registration No.',<input style={fieldStyle} value={customer?.registrationRef||''} readOnly/>)}
              {modernField('Opportunity Name *',input('name'))}
              {modernField('Owner',input('owner'))}
              {modernField('Stage',<select style={fieldStyle} value={form.stage||'QUALIFY'} onChange={e=>set('stage',e.target.value)}>{['QUALIFY','DISCOVERY','SOLUTION','PRICING','NEGOTIATION','WON','LOST'].map(x=><option key={x}>{x}</option>)}</select>)}
              {modernField('Status',<select style={fieldStyle} value={form.status||'OPEN'} onChange={e=>set('status',e.target.value)}><option>OPEN</option><option>ON_HOLD</option><option>WON</option><option>LOST</option></select>)}
              {modernField('Probability %',<input type="number" min="0" max="100" style={fieldStyle} value={form.probability??0} onChange={e=>set('probability',e.target.value)}/>)}
              {modernField('Expected Close',<input type="date" style={fieldStyle} value={form.expectedClose||''} onChange={e=>set('expectedClose',e.target.value)}/>)}
              {modernField('Value',<input type="number" min="0" style={fieldStyle} value={form.value??0} onChange={e=>set('value',e.target.value)}/>)}
              {modernField('Currency',<select style={fieldStyle} value={form.currency||'USD'} onChange={e=>set('currency',e.target.value)}>{['USD','EUR','GBP','AED','CNY'].map(x=><option key={x}>{x}</option>)}</select>)}
            </div>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <h3 style={sectionTitle}>Routing & Commercial Scope</h3>
            <div style={formGrid}>
              {modernField('Origin',input('origin'))}
              {modernField('Destination',input('destination'))}
              {modernField('Equipment',input('equipment'))}
              {modernField('Source',input('source'))}
              {modernField('Weighted Value',<input style={fieldStyle} value={`${form.currency||'USD'} ${weighted.toFixed(2)}`} readOnly/>)}
              {modernField('Loss Reason',input('lossReason'))}
              {modernField('Competitor',input('competitor'))}
            </div>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <h3 style={sectionTitle}>Inquiry / Lead Source</h3>
            <div style={formGrid}>
              {modernField('Inquiry ID',form.sourceLeadId?<button className="btn" style={{width:'100%',minHeight:36,textAlign:'left'}} onClick={()=>location.href=`/sales-crm?lead=${form.sourceLeadId}#inquiries`}>{form.sourceInquiryNo||form.sourceLeadId}</button>:<input style={fieldStyle} value={form.sourceInquiryNo||''} readOnly/>)}
              {modernField('Inquiry Contact',input('inquiryContact'))}
              {modernField('Inquiry E-Mail',input('inquiryEmail'))}
              {modernField('Inquiry Phone',input('inquiryPhone'))}
              {modernField('Lead Interest',input('leadInterest',{readonly:true}))}
              {modernField('Lead Source',input('leadSource',{readonly:true}))}
              {modernField('Source Details',input('leadSourceDetails',{readonly:true}))}
              {modernField('Referring Organization',input('referringOrganization',{readonly:true}))}
              {modernField('Referring Contact',input('referringContact',{readonly:true}))}
            </div>
          </div>

          <div className="card">
            <h3 style={sectionTitle}>Sales Relations</h3>
            <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Relation</th><th>Reference</th><th>Summary</th><th>Status</th><th>Open</th></tr></thead><tbody>
              {form.sourceLeadId&&<tr><td>Inquiry</td><td><b>{form.sourceInquiryNo||form.sourceLeadId}</b></td><td>{opp?.sourceLead?.organizationName||customer?.name||'Inquiry'} / {form.inquiryContact||'—'}</td><td>{opp?.sourceLead?.status||'CONVERTED'}</td><td><button className="btn" onClick={()=>location.href=`/sales-crm?lead=${form.sourceLeadId}#inquiries`}>Open</button></td></tr>}
              {!isNew&&<tr><td>Opportunity</td><td><b>{opportunityId}</b></td><td>{form.name} / {form.origin||'—'} → {form.destination||'—'}</td><td>{form.status}</td><td>Current</td></tr>}
              {quotes.filter((q:any)=>q.rateQuoteId).map((q:any)=><tr key={q.quoteVersionId}><td>ANC Quote</td><td><b>{q.rateQuoteId}</b></td><td>Published from quote version v{q.version}</td><td>Published</td><td><button className="btn" onClick={()=>location.href=`/rates/${q.rateQuoteId}`}>Open</button></td></tr>)}
            </tbody></table></div>
          </div>
        </div>

        <div>
          <div className="card" style={{marginBottom:12}}>
            <h3 style={sectionTitle}>Current Activity Registration</h3>
            <div style={{display:'grid',gap:8}}>
              {modernField('Date',<input type="date" style={fieldStyle} value={activity.date||''} onChange={e=>setActivity({...activity,date:e.target.value})}/>)}
              {modernField('Activity Type',<select style={fieldStyle} value={activity.type} onChange={e=>setActivity({...activity,type:e.target.value})}><option value="FOLLOW_UP">Follow Up</option><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="MEETING">Meeting</option><option value="NOTE">Note</option></select>)}
              {modernField('Contact',<input style={fieldStyle} value={activity.contact||''} onChange={e=>setActivity({...activity,contact:e.target.value})}/>)}
              {modernField('Subject',<input style={fieldStyle} value={activity.subject||''} onChange={e=>setActivity({...activity,subject:e.target.value})}/>)}
              <label><span style={labelStyle}>Notes</span><textarea style={{...fieldStyle,minHeight:90,resize:'vertical'}} value={activity.notes||''} onChange={e=>setActivity({...activity,notes:e.target.value})}/></label>
              <button className="btn" disabled={busy||isNew||!String(activity.subject||'').trim()} onClick={()=>void registerActivity()}>Register Activity</button>
              {isNew&&<div className="sub">Save the Opportunity first to register activity.</div>}
            </div>
          </div>

          <div className="card">
            <h3 style={sectionTitle}>Recent Activity</h3>
            <div style={{display:'grid',gap:7,maxHeight:430,overflowY:'auto'}}>
              {activities.slice(0,20).map((x:any)=><div key={x.activityId||x.createdAt} style={{border:'1px solid #dfe5ea',borderRadius:7,padding:8,background:'#fafcfd'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:11,color:'#627687'}}><span>{String(x.date||x.createdAt||'').replace('T',' ').slice(0,16)}</span><b>{x.type}</b></div>
                <div style={{fontWeight:800,margin:'3px 0',fontSize:12}}>{x.subject}</div>
                <div className="sub">{x.contact||x.createdBy||'System'}</div>
              </div>)}
              {!activities.length&&<div className="sub">No activity registered yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn" disabled={busy||isNew||form.status==='WON'} onClick={()=>void closeOpportunity('WON')}>Mark Won</button>
            <button className="btn" disabled={busy||isNew||form.status==='LOST'} onClick={()=>void closeOpportunity('LOST')}>Mark Lost</button>
            <button className="btn" disabled={busy||isNew} onClick={()=>setTab('Quotes')}>Create / Manage Quote</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn" disabled={busy} onClick={()=>void save(false)}>Save</button>
            <button className="btn" disabled={busy} onClick={()=>void save(true)}>Save & Close</button>
            <button className="btn" onClick={()=>location.href='/sales-crm/opportunities'}>Close</button>
          </div>
        </div>
      </div>
    </>}

    {tab==='Workflow & Tracking'&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Opportunity Workflow</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8}}>
          {['QUALIFY','DISCOVERY','SOLUTION','PRICING','NEGOTIATION','WON'].map((s,i)=>{
            const stages=['QUALIFY','DISCOVERY','SOLUTION','PRICING','NEGOTIATION','WON'];
            const current=stages.indexOf(String(form.stage||'QUALIFY'));
            const done=current>=i||form.status==='WON';
            return <div key={s} style={{border:'1px solid '+(done?'#9dc6a4':'#d9e0e6'),background:done?'#eef8f0':'#f7f9fa',borderRadius:8,padding:12}}>
              <div style={{fontSize:11,color:'#627687'}}>STEP {i+1}</div><div style={{fontWeight:900,marginTop:4}}>{s}</div>
            </div>;
          })}
        </div>
      </div>
      <div className="card">
        <h3 style={sectionTitle}>Workflow Tracking</h3>
        <div style={formGrid}>
          {modernField('Status',<input style={fieldStyle} value={form.status||''} readOnly/>)}
          {modernField('Stage',<input style={fieldStyle} value={form.stage||''} readOnly/>)}
          {modernField('Probability',<input style={fieldStyle} value={`${form.probability||0}%`} readOnly/>)}
          {modernField('Expected Close',<input style={fieldStyle} value={form.expectedClose||''} readOnly/>)}
          {modernField('Source Inquiry',<input style={fieldStyle} value={form.sourceInquiryNo||''} readOnly/>)}
          {modernField('Quote Versions',<input style={fieldStyle} value={String(quotes.length)} readOnly/>)}
        </div>
      </div>
    </>}

    {tab==='Quotes'&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Create Quote Version</h3>
        <div style={formGrid}>
          {modernField('Buy Rate',<input type="number" min="0" style={fieldStyle} value={quote.buyRate??0} onChange={e=>setQuote({...quote,buyRate:e.target.value})}/>)}
          {modernField('Sell Rate',<input type="number" min="0" style={fieldStyle} value={quote.sellRate??0} onChange={e=>setQuote({...quote,sellRate:e.target.value})}/>)}
          {modernField('Currency',<select style={fieldStyle} value={quote.currency||'USD'} onChange={e=>setQuote({...quote,currency:e.target.value})}>{['USD','EUR','GBP','AED','CNY'].map(x=><option key={x}>{x}</option>)}</select>)}
          {modernField('Trade / Lane',<input style={fieldStyle} value={quote.trade||''} onChange={e=>setQuote({...quote,trade:e.target.value})}/>)}
          {modernField('Equipment',<input style={fieldStyle} value={quote.equipment||''} onChange={e=>setQuote({...quote,equipment:e.target.value})}/>)}
          {modernField('Valid From',<input type="date" style={fieldStyle} value={quote.validFrom||''} onChange={e=>setQuote({...quote,validFrom:e.target.value})}/>)}
          {modernField('Valid To',<input type="date" style={fieldStyle} value={quote.validTo||''} onChange={e=>setQuote({...quote,validTo:e.target.value})}/>)}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy||isNew} onClick={()=>void createQuote()}>Create Quote Version</button></div>
      </div>
      <div className="card">
        <h3 style={sectionTitle}>Quote Versions</h3>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Version</th><th>Buy</th><th>Sell</th><th>GP</th><th>Margin</th><th>Validity</th><th>Status</th><th>ANC Quote</th><th>Action</th></tr></thead><tbody>
          {quotes.map((q:any)=><tr key={q.quoteVersionId}>
            <td>v{q.version}</td><td>{q.currency} {q.buyRate}</td><td>{q.currency} {q.sellRate}</td><td>{q.currency} {Number(q.grossProfit||0).toFixed(2)}</td><td>{Number(q.marginPct||0).toFixed(1)}%</td><td>{String(q.validTo||'').slice(0,10)}</td><td>{q.status}</td>
            <td>{q.rateQuoteId?<button className="btn" onClick={()=>location.href=`/rates/${q.rateQuoteId}`}>Open Quote</button>:'—'}</td>
            <td>{q.status==='DRAFT'?<button className="btn" onClick={()=>void quoteAction(q.quoteVersionId,'approve')}>Approve</button>:!q.rateQuoteId?<button className="btn" onClick={()=>void quoteAction(q.quoteVersionId,'publish')}>Publish</button>:'Published'}</td>
          </tr>)}
          {!quotes.length&&<tr><td colSpan={9}>No quote versions.</td></tr>}
        </tbody></table></div>
      </div>
    </>}

    {tab==='Notes'&&<div className="card">
      <h3 style={sectionTitle}>Notes</h3>
      <textarea style={{...fieldStyle,minHeight:240,resize:'vertical'}} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}><button className="btn" disabled={busy} onClick={()=>void save(false)}>Save Notes</button></div>
    </div>}

    {tab==='Logs'&&<div className="card">
      <h3 style={sectionTitle}>Audit & Activity Logs</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Time</th><th>Type</th><th>Status / Action</th><th>Actor</th></tr></thead><tbody>
        {(logs.events||[]).map((x:any,i:number)=><tr key={'e'+i}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>{x.eventType}</td><td>{x.status}</td><td>{x.payload?.updatedBy||x.payload?.createdBy||'System'}</td></tr>)}
        {(logs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>Audit</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}
        {!(logs.events||[]).length&&!(logs.audit||[]).length&&<tr><td colSpan={4}>No log entries.</td></tr>}
      </tbody></table></div>
    </div>}
  </WorkspaceShell>;
}
