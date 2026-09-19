'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell from './WorkspaceShell';
import {api,currentUser,requireToken} from '../lib/api';

const tabs=['Details','Workflow & Tracking','Charges & Margin','Notes','Logs'] as const;
const blankQuote={
  quoteNo:'',customerId:'',trade:'',equipment:'40HC',buyRate:0,sellRate:0,currency:'USD',
  validFrom:new Date().toISOString().slice(0,10),validTo:'',status:'DRAFT',source:'NVOCC_COMMERCIAL_DESK',
  customerRef:'',costCenterCode:'',carrierCode:'',carrierQuoteRef:'',termsVersion:'',requestData:{} as any,
  bookings:[] as any[]
};

function laneParts(trade:string){
  return String(trade||'').split(/\s*(?:->|>|\/|→|-)\s*/).filter(Boolean);
}

export default function SalesQuoteWorkspace({quoteId}:{quoteId?:string}){
  const isNew=!quoteId;
  const [token,setToken]=useState('');
  const [quote,setQuote]=useState<any>(null);
  const [form,setForm]=useState<any>(blankQuote);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [activities,setActivities]=useState<any[]>([]);
  const [logs,setLogs]=useState<any>({audit:[],activities:[]});
  const [tab,setTab]=useState<(typeof tabs)[number]>('Details');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [activity,setActivity]=useState<any>({date:new Date().toISOString().slice(0,10),type:'FOLLOW_UP',contact:'',subject:'',notes:''});
  const [convert,setConvert]=useState<any>({bookingNo:'',origin:'',destination:'',quantity:1,customerReference:'',carrier:'',vesselVoyage:''});
  const user=currentUser();

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[quoteId]);

  async function load(t=token){
    try{
      const o=await api('/organizations',t);setOrgs(Array.isArray(o)?o:[]);
      if(isNew){
        const initial={...blankQuote,requestData:{}};
        setQuote(initial);setForm(initial);return;
      }
      const [r,a,l]=await Promise.all([
        api(`/rates/${quoteId}`,t),
        api(`/rates/${quoteId}/activities`,t),
        api(`/rates/${quoteId}/logs`,t)
      ]);
      const mapped={...r,validFrom:r.validFrom?String(r.validFrom).slice(0,10):'',validTo:r.validTo?String(r.validTo).slice(0,10):'',requestData:r.requestData||{},bookings:Array.isArray(r.bookings)?r.bookings:[]};
      setQuote(r);setForm(mapped);setActivities(Array.isArray(a)?a:[]);setLogs(l||{audit:[],activities:[]});
      const parts=laneParts(r.trade);
      setConvert((x:any)=>({...x,origin:(parts[0]||'').toUpperCase(),destination:(parts[parts.length-1]||'').toUpperCase(),customerReference:r.customerRef||''}));
      setActivity((x:any)=>({...x,contact:r.requestData?.inquiryContact||x.contact||''}));
    }catch(e:any){setMessage(e?.message||'Unable to load ANC Quote');}
  }

  function set(k:string,v:any){setForm((x:any)=>({...x,[k]:v}));}
  function setRequest(k:string,v:any){setForm((x:any)=>({...x,requestData:{...(x.requestData||{}),[k]:v}}));}

  async function save(close=false){
    if(!form.customerId){setMessage('Customer is required.');return;}
    if(!String(form.trade||'').trim()){setMessage('Trade / lane is required.');return;}
    if(!form.validTo){setMessage('Valid-to date is required.');return;}
    setBusy(true);setMessage('');
    try{
      const payload=locked
        ? {validTo:form.validTo,customerRef:form.customerRef||null,costCenterCode:form.costCenterCode||null,carrierCode:form.carrierCode||null,carrierQuoteRef:form.carrierQuoteRef||null,termsVersion:form.termsVersion||null,requestData:form.requestData||{}}
        : {...form,buyRate:Number(form.buyRate||0),sellRate:Number(form.sellRate||0),validFrom:form.validFrom,validTo:form.validTo,requestData:form.requestData||{}};
      if(isNew){
        const created=await api('/rates',token,{method:'POST',body:JSON.stringify(payload)});
        if(close){location.href='/rates';return;}
        location.href=`/rates/${created.id}`;return;
      }
      await api(`/rates/${quoteId}`,token,{method:'PATCH',body:JSON.stringify(payload)});
      if(close){location.href='/rates';return;}
      await load();setMessage('ANC Quote saved.');
    }catch(e:any){setMessage(e?.message||'Could not save quote');}
    finally{setBusy(false);}
  }

  async function lifecycle(act:'approve'|'send'|'accept'|'reject'){
    if(isNew)return;
    setBusy(true);setMessage('');
    try{
      const init:any={method:'POST'};
      if(act==='reject')init.body=JSON.stringify({reason:prompt('Reject reason?')||'Commercial quote rejected'});
      await api(`/rates/${quoteId}/${act}`,token,init);
      await load();setMessage(`Quote action completed: ${act}.`);
    }catch(e:any){setMessage(e?.message||'Quote action failed');}
    finally{setBusy(false);}
  }

  async function registerActivity(){
    if(isNew||!String(activity.subject||'').trim())return;
    setBusy(true);
    try{
      await api(`/rates/${quoteId}/activities`,token,{method:'POST',body:JSON.stringify(activity)});
      setActivity({date:new Date().toISOString().slice(0,10),type:'FOLLOW_UP',contact:form.requestData?.inquiryContact||'',subject:'',notes:''});
      await load();setMessage('Activity registered.');
    }catch(e:any){setMessage(e?.message||'Could not register activity');}
    finally{setBusy(false);}
  }

  async function convertToBooking(){
    if(isNew)return;
    if(!String(convert.origin||'').trim()||!String(convert.destination||'').trim()){setMessage('Origin and destination are required.');return;}
    setBusy(true);setMessage('');
    try{
      const r=await api(`/rates/${quoteId}/convert`,token,{method:'POST',body:JSON.stringify({...convert,quantity:Number(convert.quantity||1)})});
      await load();setMessage(`Booking ${r?.booking?.bookingNo||''} created from quote.`);
    }catch(e:any){setMessage(e?.message||'Quote could not be converted to booking');}
    finally{setBusy(false);}
  }

  const customer=useMemo(()=>orgs.find((x:any)=>x.id===form.customerId)||null,[orgs,form.customerId]);
  const locked=!isNew&&String(form.status||'DRAFT')!=='DRAFT';
  const gp=Number(form.sellRate||0)-Number(form.buyRate||0);
  const margin=Number(form.sellRate||0)>0?gp/Number(form.sellRate||0)*100:0;
  const expired=!!form.validTo&&new Date(form.validTo+'T23:59:59').getTime()<Date.now()&&!['Customer Accepted','Rejected'].includes(String(form.status));
  const sourceOpportunityId=form.requestData?.sourceOpportunityId||'';
  const sourceInquiryNo=form.requestData?.sourceInquiryNo||'';
  const booking=form.bookings?.[0]||null;
  const lifecycleOrder=['DRAFT','Rate Approved','Quote Sent','Customer Accepted'];
  const currentStageIndex=lifecycleOrder.indexOf(String(form.status||'DRAFT'));
  const activityRows=useMemo(()=>activities.slice(0,20),[activities]);

  const field=(k:string,label:string,opts:{type?:string;readonly?:boolean;locked?:boolean}={})=><div className="cw-row"><label>{label}</label><input className="cw-input" type={opts.type||'text'} value={form[k]??''} readOnly={opts.readonly||opts.locked} onChange={e=>set(k,e.target.value)}/><span/></div>;

  if(!quote)return <WorkspaceShell title="" subtitle="" active="/rates" hideHeader><div className="cw-screen"><div className="cw-loading">{message||'Loading ANC Quote...'}</div></div></WorkspaceShell>;

  return <WorkspaceShell title="" subtitle="" active="/rates" hideHeader>
    <div className="cw-screen">
      <div className="cw-titlebar">Edit ANC Quote - {isNew?'New Quote':form.quoteNo||quoteId} - Branch: GLOBAL - Company: ANCLINE WORLDWIDE - Department: SALES / COMMERCIAL - User: {user?.email||''}</div>
      <div className="cw-menubar"><button>File</button><button>Edit</button><button>Actions</button><button>Help</button><span className="cw-menuspacer"/><button onClick={()=>location.href='/rates'}>Quote Register</button>{sourceOpportunityId&&<button onClick={()=>location.href=`/sales-crm/opportunities/${sourceOpportunityId}`}>Open Opportunity</button>}</div>
      <div className="cw-tabs">{tabs.map(x=><button className={tab===x?'active':''} key={x} onClick={()=>setTab(x)}>{x}</button>)}</div>
      {message&&<div className="cw-message">{message}</div>}

      {tab==='Details'&&<>
        <div className="cw-headrow quote-headrow">
          <div className="cw-headitem"><label>Quote No.</label><input value={isNew?'AUTO':form.quoteNo||''} readOnly/></div>
          <div className="cw-headitem"><label>Status</label><input className={'quote-status-head '+String(form.status||'DRAFT').toLowerCase().replaceAll(' ','-')} value={form.status||'DRAFT'} readOnly/></div>
          <div className="cw-headitem"><label>Validity</label><input value={form.validTo||''} readOnly/></div>
        </div>

        <div className="cw-workspace-body">
          <div className="cw-workspace-left">
            <div className="cw-main-grid">
              <fieldset className="cw-panel cw-form3040 quote-customer"><legend>Customer</legend>
                <div className="cw-row"><label>Name</label><select className="cw-input" value={form.customerId||''} disabled={locked} onChange={e=>set('customerId',e.target.value)}><option value="">Select customer</option>{orgs.filter((o:any)=>Array.isArray(o.roles)&&o.roles.includes('CUSTOMER')).map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button className="cw-mini" type="button">...</button></div>
                <div className="cw-row"><label>Code</label><input className="cw-input" value={customer?.code||''} readOnly/><span/></div>
                <div className="cw-row"><label>Country</label><input className="cw-input" value={customer?.countryCode||''} readOnly/><span/></div>
                {field('customerRef','Customer Ref.')}
                {field('costCenterCode','Cost Center')}
                <div className="cw-row"><label>Inquiry Contact</label><input className="cw-input" value={form.requestData?.inquiryContact||''} readOnly/><span/></div>
                <div className="cw-row"><label>Inquiry E-Mail</label><input className="cw-input" value={form.requestData?.inquiryEmail||''} readOnly/><span/></div>
              </fieldset>

              <fieldset className="cw-panel cw-form3040 quote-commercial"><legend>Quote / Routing</legend>
                {field('trade','Trade / Lane',{locked})}
                <div className="cw-row"><label>Equipment</label><select className="cw-input" disabled={locked} value={form.equipment||'40HC'} onChange={e=>set('equipment',e.target.value)}>{['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(x=><option key={x}>{x}</option>)}</select><span/></div>
                {field('source','Source',{locked})}
                <div className="cw-row"><label>Opportunity</label>{sourceOpportunityId?<a className="cw-input quote-link-field" href={`/sales-crm/opportunities/${sourceOpportunityId}`}>{sourceOpportunityId}</a>:<input className="cw-input" value="" readOnly/>}<span/></div>
                <div className="cw-row"><label>Inquiry ID</label><input className="cw-input" value={sourceInquiryNo} readOnly/><span/></div>
                <div className="cw-row"><label>Quote Version</label><input className="cw-input" value={form.requestData?.quoteVersionId||''} readOnly/><span/></div>
                <div className="cw-row"><label>Expired</label><input className="cw-input" value={expired?'YES':'NO'} readOnly/><span/></div>
              </fieldset>

              <div className="cw-right-stack">
                <fieldset className="cw-panel cw-form3040 quote-details"><legend>Details</legend>
                  <div className="cw-row"><label>Status</label><input className={'cw-input quote-status-field '+String(form.status||'DRAFT').toLowerCase().replaceAll(' ','-')} value={form.status||'DRAFT'} readOnly/><span/></div>
                  {field('validFrom','Valid From',{type:'date',locked})}
                  {field('validTo','Valid To',{type:'date'})}
                  <div className="cw-row"><label>Currency</label><select className="cw-input" disabled={locked} value={form.currency||'USD'} onChange={e=>set('currency',e.target.value)}>{['USD','EUR','GBP','AED','CNY'].map(x=><option key={x}>{x}</option>)}</select><span/></div>
                  <div className="cw-row"><label>Buy Rate</label><input className="cw-input" type="number" readOnly={locked} value={form.buyRate??0} onChange={e=>set('buyRate',e.target.value)}/><span/></div>
                  <div className="cw-row"><label>Sell Rate</label><input className="cw-input" type="number" readOnly={locked} value={form.sellRate??0} onChange={e=>set('sellRate',e.target.value)}/><span/></div>
                  <div className="cw-row"><label>GP / Margin</label><input className="cw-input" value={`${form.currency||'USD'} ${gp.toFixed(2)} / ${margin.toFixed(1)}%`} readOnly/><span/></div>
                </fieldset>

                <fieldset className="cw-panel cw-form3040 quote-source"><legend>Carrier / References</legend>
                  {field('carrierCode','Carrier Code')}
                  {field('carrierQuoteRef','Carrier Quote Ref.')}
                  {field('termsVersion','Terms Version')}
                  <div className="cw-row"><label>Terms Accepted</label><input className="cw-input" value={form.termsAcceptedAt?String(form.termsAcceptedAt).replace('T',' ').slice(0,16):''} readOnly/><span/></div>
                  <div className="cw-row"><label>Accepted By</label><input className="cw-input" value={form.termsAcceptedBy||''} readOnly/><span/></div>
                </fieldset>
              </div>
            </div>

            <div className="cw-bottom-grid">
              <div className="cw-lower-panel cw-sales-relations-panel">
                <div className="cw-lower-title">Commercial Relations</div>
                <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Relation</th><th>Summary</th><th>Status</th><th>Reference</th></tr></thead><tbody>
                  {sourceOpportunityId&&<tr><td><a href={`/sales-crm/opportunities/${sourceOpportunityId}`}><b>OPP&nbsp; {sourceOpportunityId}</b></a></td><td>{form.requestData?.opportunityName||'Sales Opportunity'}</td><td>LINKED</td><td>{sourceInquiryNo||'—'}</td></tr>}
                  {!isNew&&<tr><td><b>QTE&nbsp; {form.quoteNo}</b></td><td>{form.trade}; {form.equipment}</td><td>{form.status}</td><td>{form.carrierQuoteRef||'—'}</td></tr>}
                  {(form.bookings||[]).map((b:any)=><tr key={b.id}><td><a href={`/bookings/${b.id}`}><b>BKG&nbsp; {b.bookingNo}</b></a></td><td>Booking created from quote</td><td>{b.status}</td><td>{b.id}</td></tr>)}
                </tbody></table></div>
                <div className="cw-lower-actions"><span>Popup</span><span className="cw-spacer"/>{sourceOpportunityId&&<button onClick={()=>location.href=`/sales-crm/opportunities/${sourceOpportunityId}`}>Open Opportunity</button>}{booking&&<button onClick={()=>location.href=`/bookings/${booking.id}`}>Open Booking</button>}</div>
              </div>

              <div className="cw-lower-panel cw-related-communication-panel">
                <div className="cw-lower-title">Quote Control</div>
                <div className="quote-control-list">
                  <div><span>Buy</span><b>{form.currency} {Number(form.buyRate||0).toFixed(2)}</b></div>
                  <div><span>Sell</span><b>{form.currency} {Number(form.sellRate||0).toFixed(2)}</b></div>
                  <div><span>Gross Profit</span><b>{form.currency} {gp.toFixed(2)}</b></div>
                  <div><span>Margin</span><b>{margin.toFixed(1)}%</b></div>
                  <div><span>Bookings</span><b>{form.bookings?.length||0}</b></div>
                </div>
                <div className="cw-lower-actions"><span className="cw-spacer"/><button onClick={()=>setTab('Charges & Margin')}>Commercial Detail</button></div>
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
              {isNew&&<div className="cw-activity-hint">Save the Quote first to register activity.</div>}
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
          <button onClick={()=>location.href='/rates'}>Close</button>
          {!isNew&&form.status==='DRAFT'&&<><button disabled={busy||expired} onClick={()=>void lifecycle('approve')}>Approve Rate</button><button disabled={busy} onClick={()=>void lifecycle('reject')}>Reject</button></>}
          {!isNew&&form.status==='Rate Approved'&&<><button disabled={busy||expired} onClick={()=>void lifecycle('send')}>Send Quote</button><button disabled={busy} onClick={()=>void lifecycle('reject')}>Reject</button></>}
          {!isNew&&form.status==='Quote Sent'&&<><button disabled={busy||expired} onClick={()=>void lifecycle('accept')}>Customer Accept</button><button disabled={busy} onClick={()=>void lifecycle('reject')}>Reject</button></>}
          {!isNew&&form.status==='Customer Accepted'&&!booking&&<button className="cw-primary-action" disabled={busy} onClick={()=>setTab('Workflow & Tracking')}>Convert to Booking</button>}
          {booking&&<button className="cw-primary-action" onClick={()=>location.href=`/bookings/${booking.id}`}>Open Booking</button>}
        </div>
        <div className="cw-footerbar"><span className="cw-spacer"/><button onClick={()=>location.href='/rates/new'}>□ New</button><button disabled={busy} onClick={()=>void save(false)}>◉ Save</button><button disabled={busy} onClick={()=>void save(true)}>◉ Save & Close</button><button onClick={()=>location.href='/rates'}>● Close</button></div>
      </>}

      {tab==='Workflow & Tracking'&&<div className="cw-tabpage quote-workflow-page">
        <h3>Workflow & Tracking</h3>
        <div className="quote-stage-track">{['DRAFT','Rate Approved','Quote Sent','Customer Accepted','Booking'].map((s,i)=>{const done=s==='Booking'?!!booking:(lifecycleOrder.indexOf(s)>=0&&currentStageIndex>=lifecycleOrder.indexOf(s));return <div className={'quote-stage '+(done?'done':'')} key={s}><b>{i+1}</b><span>{s}</span></div>;})}</div>
        <div className="cw-track-grid"><div><b>Status</b><span>{form.status}</span></div><div><b>Validity</b><span>{form.validTo||'—'}</span></div><div><b>Opportunity</b><span>{sourceOpportunityId||'—'}</span></div><div><b>Booking</b><span>{booking?.bookingNo||'Not converted'}</span></div></div>
        {form.status==='Customer Accepted'&&!booking&&<div className="quote-convert-panel">
          <h4>Booking Conversion</h4>
          <div className="quote-convert-grid">
            <label><span>Booking No.</span><input value={convert.bookingNo} onChange={e=>setConvert({...convert,bookingNo:e.target.value})} placeholder="Auto if blank"/></label>
            <label><span>Origin</span><input value={convert.origin} onChange={e=>setConvert({...convert,origin:e.target.value})}/></label>
            <label><span>Destination</span><input value={convert.destination} onChange={e=>setConvert({...convert,destination:e.target.value})}/></label>
            <label><span>Quantity</span><input type="number" min="1" value={convert.quantity} onChange={e=>setConvert({...convert,quantity:e.target.value})}/></label>
            <label><span>Customer Reference</span><input value={convert.customerReference} onChange={e=>setConvert({...convert,customerReference:e.target.value})}/></label>
            <label><span>Carrier</span><input value={convert.carrier} onChange={e=>setConvert({...convert,carrier:e.target.value})}/></label>
            <label><span>Vessel / Voyage</span><input value={convert.vesselVoyage} onChange={e=>setConvert({...convert,vesselVoyage:e.target.value})}/></label>
          </div>
          <button className="cw-classic-btn" disabled={busy} onClick={()=>void convertToBooking()}>Create Booking</button>
        </div>}
      </div>}

      {tab==='Charges & Margin'&&<div className="cw-tabpage quote-margin-page">
        <h3>Charges & Margin</h3>
        <div className="quote-margin-grid">
          <div><span>Buy Rate</span><b>{form.currency} {Number(form.buyRate||0).toFixed(2)}</b></div>
          <div><span>Sell Rate</span><b>{form.currency} {Number(form.sellRate||0).toFixed(2)}</b></div>
          <div><span>Gross Profit</span><b>{form.currency} {gp.toFixed(2)}</b></div>
          <div><span>Margin %</span><b>{margin.toFixed(2)}%</b></div>
          <div><span>Commercial Status</span><b>{form.status}</b></div>
          <div><span>Validity</span><b>{form.validFrom||'—'} → {form.validTo||'—'}</b></div>
        </div>
        <div className="quote-commercial-note">Rate fields are editable while the quote is in Draft. After approval, commercial values are locked; validity and operational references can still be maintained through controlled updates.</div>
      </div>}

      {tab==='Notes'&&<div className="cw-tabpage"><h3>Notes</h3><textarea className="cw-notes cw-notes-large" value={form.requestData?.notes||''} onChange={e=>setRequest('notes',e.target.value)}/><button className="cw-classic-btn" disabled={busy} onClick={()=>void save(false)}>Save Notes</button></div>}

      {tab==='Logs'&&<div className="cw-tabpage"><h3>Logs</h3><div className="cw-tablewrap"><table className="cw-table"><thead><tr><th>Time</th><th>Type</th><th>Action</th><th>Actor</th></tr></thead><tbody>
        {(logs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>AUDIT</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}
        {(logs.activities||[]).map((x:any)=><tr key={x.activityId}><td>{String(x.createdAt||x.date||'').replace('T',' ').slice(0,19)}</td><td>ACTIVITY</td><td>{x.type}: {x.subject}</td><td>{x.createdBy||'System'}</td></tr>)}
      </tbody></table></div></div>}
    </div>
  </WorkspaceShell>;
}
