'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from './WorkspaceShell';
import {api,requireToken} from '../lib/api';

const tabs=['Details','Workflow & Tracking','Charges & Margin','Notes','Logs'] as const;
const blankQuote={
  quoteNo:'',customerId:'',trade:'',equipment:'40HC',buyRate:0,sellRate:0,currency:'USD',
  validFrom:new Date().toISOString().slice(0,10),validTo:'',status:'DRAFT',source:'NVOCC_COMMERCIAL_DESK',
  customerRef:'',costCenterCode:'',carrierCode:'',carrierQuoteRef:'',termsVersion:'',termsAcceptedAt:'',termsAcceptedBy:'',
  requestData:{} as any,bookings:[] as any[]
};

function laneParts(trade:string){
  return String(trade||'').split(/\s*(?:->|>|\/|→|-)\s*/).filter(Boolean);
}
function statusTone(status:string){
  const s=String(status||'').toUpperCase();
  if(s.includes('ACCEPT'))return {background:'#e8f5e9',borderColor:'#a5d6a7',color:'#2e7d32'};
  if(s.includes('REJECT'))return {background:'#ffebee',borderColor:'#ef9a9a',color:'#c62828'};
  if(s.includes('SENT'))return {background:'#fff8e1',borderColor:'#ffe082',color:'#8d6e00'};
  if(s.includes('APPROVED'))return {background:'#e3f2fd',borderColor:'#90caf9',color:'#1565c0'};
  return {background:'#f4f6f8',borderColor:'#d7dee5',color:'#455a64'};
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
  const customers=useMemo(()=>orgs.filter((o:any)=>Array.isArray(o.roles)&&o.roles.includes('CUSTOMER')),[orgs]);
  const locked=!isNew&&String(form.status||'DRAFT')!=='DRAFT';
  const gp=Number(form.sellRate||0)-Number(form.buyRate||0);
  const margin=Number(form.sellRate||0)>0?gp/Number(form.sellRate||0)*100:0;
  const expired=!!form.validTo&&new Date(form.validTo+'T23:59:59').getTime()<Date.now()&&!['Customer Accepted','Rejected'].includes(String(form.status));
  const sourceOpportunityId=form.requestData?.sourceOpportunityId||'';
  const sourceInquiryNo=form.requestData?.sourceInquiryNo||'';
  const booking=form.bookings?.[0]||null;
  const lifecycleOrder=['DRAFT','Rate Approved','Quote Sent','Customer Accepted'];
  const currentStageIndex=lifecycleOrder.indexOf(String(form.status||'DRAFT'));
  const tone=statusTone(form.status);

  if(!quote)return <WorkspaceShell title="ANC Quote / Commercial Quote" subtitle="Loading commercial quote workspace" active="/rates"><div className="card">{message||'Loading ANC Quote...'}</div></WorkspaceShell>;

  const modernField=(label:string,child:any)=><label><span style={labelStyle}>{label}</span>{child}</label>;
  const input=(k:string,opts:{type?:string;readonly?:boolean}={})=><input style={fieldStyle} type={opts.type||'text'} value={form[k]??''} readOnly={opts.readonly} onChange={e=>set(k,e.target.value)}/>;

  return <WorkspaceShell
    title={isNew?'New ANC Quote / Commercial Quote':`ANC Quote ${form.quoteNo||quoteId}`}
    subtitle="Opportunity-linked commercial quote, rate governance, activity history and quote-to-booking conversion"
    active="/rates"
    actions={<>
      {sourceOpportunityId&&<button className="btn" onClick={()=>location.href=`/sales-crm/opportunities/${sourceOpportunityId}`}>Open Opportunity</button>}
      {booking&&<button className="btn" onClick={()=>location.href=`/bookings/${booking.id}`}>Open Booking</button>}
      <button className="btn" onClick={()=>location.href='/rates'}>Quote Register</button>
    </>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,marginBottom:12}}>
      {[
        ['Quote No.',isNew?'AUTO':form.quoteNo||'—','Commercial reference'],
        ['Status',form.status||'DRAFT',expired?'Expired validity':'Lifecycle stage'],
        ['Gross Profit',`${form.currency||'USD'} ${gp.toFixed(2)}`,`${margin.toFixed(1)}% margin`],
        ['Valid To',form.validTo||'—',expired?'Expired':'Commercial validity'],
        ['Booking',booking?.bookingNo||'Not converted',booking?'Linked booking':'Awaiting accepted quote']
      ].map(([label,value,note])=><div className="card" key={label}>
        <div style={{fontSize:11,fontWeight:800,color:'#526778',textTransform:'uppercase'}}>{label}</div>
        <div style={{fontSize:20,fontWeight:900,color:'#153a5d',margin:'5px 0'}}>{value}</div>
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
              <h3 style={{...sectionTitle,marginBottom:0,flex:1}}>Customer & Source</h3>
              <span style={{...tone,border:'1px solid',borderRadius:16,padding:'5px 10px',fontSize:11,fontWeight:800}}>{form.status||'DRAFT'}</span>
            </div>
            <div style={formGrid}>
              {modernField('Customer *',<select style={fieldStyle} disabled={locked} value={form.customerId||''} onChange={e=>set('customerId',e.target.value)}><option value="">Select customer</option>{customers.map((o:any)=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select>)}
              {modernField('Customer Code',<input style={fieldStyle} value={customer?.code||''} readOnly/>)}
              {modernField('Country',<input style={fieldStyle} value={customer?.countryCode||''} readOnly/>)}
              {modernField('Customer Reference',input('customerRef'))}
              {modernField('Cost Center',input('costCenterCode'))}
              {modernField('Opportunity',sourceOpportunityId?<button className="btn" style={{width:'100%',minHeight:36,textAlign:'left'}} onClick={()=>location.href=`/sales-crm/opportunities/${sourceOpportunityId}`}>{sourceOpportunityId}</button>:<input style={fieldStyle} value="" readOnly/>)}
              {modernField('Source Inquiry',<input style={fieldStyle} value={sourceInquiryNo} readOnly/>)}
              {modernField('Inquiry Contact',<input style={fieldStyle} value={form.requestData?.inquiryContact||''} readOnly/>)}
              {modernField('Inquiry E-Mail',<input style={fieldStyle} value={form.requestData?.inquiryEmail||''} readOnly/>)}
            </div>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <h3 style={sectionTitle}>Routing & Commercial</h3>
            <div style={formGrid}>
              {modernField('Trade / Lane *',<input style={fieldStyle} value={form.trade||''} readOnly={locked} onChange={e=>set('trade',e.target.value)}/>)}
              {modernField('Equipment',<select style={fieldStyle} disabled={locked} value={form.equipment||'40HC'} onChange={e=>set('equipment',e.target.value)}>{['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(x=><option key={x}>{x}</option>)}</select>)}
              {modernField('Source',<input style={fieldStyle} value={form.source||''} readOnly={locked} onChange={e=>set('source',e.target.value)}/>)}
              {modernField('Valid From',<input type="date" style={fieldStyle} value={form.validFrom||''} readOnly={locked} onChange={e=>set('validFrom',e.target.value)}/>)}
              {modernField('Valid To *',<input type="date" style={fieldStyle} value={form.validTo||''} onChange={e=>set('validTo',e.target.value)}/>)}
              {modernField('Currency',<select style={fieldStyle} disabled={locked} value={form.currency||'USD'} onChange={e=>set('currency',e.target.value)}>{['USD','EUR','GBP','AED','CNY'].map(x=><option key={x}>{x}</option>)}</select>)}
              {modernField('Buy Rate',<input type="number" min="0" style={fieldStyle} value={form.buyRate??0} readOnly={locked} onChange={e=>set('buyRate',e.target.value)}/>)}
              {modernField('Sell Rate',<input type="number" min="0" style={fieldStyle} value={form.sellRate??0} readOnly={locked} onChange={e=>set('sellRate',e.target.value)}/>)}
              {modernField('Gross Profit',<input style={fieldStyle} value={`${form.currency||'USD'} ${gp.toFixed(2)}`} readOnly/>)}
              {modernField('Margin %',<input style={fieldStyle} value={`${margin.toFixed(2)}%`} readOnly/>)}
            </div>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <h3 style={sectionTitle}>Carrier & Commercial References</h3>
            <div style={formGrid}>
              {modernField('Carrier Code',input('carrierCode'))}
              {modernField('Carrier Quote Ref.',input('carrierQuoteRef'))}
              {modernField('Terms Version',input('termsVersion'))}
              {modernField('Quote Version',<input style={fieldStyle} value={form.requestData?.quoteVersionId||''} readOnly/>)}
              {modernField('Terms Accepted',<input style={fieldStyle} value={form.termsAcceptedAt?String(form.termsAcceptedAt).replace('T',' ').slice(0,16):''} readOnly/>)}
              {modernField('Accepted By',<input style={fieldStyle} value={form.termsAcceptedBy||''} readOnly/>)}
            </div>
          </div>

          <div className="card">
            <h3 style={sectionTitle}>Commercial Relations</h3>
            <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Relation</th><th>Reference</th><th>Summary</th><th>Status</th><th>Open</th></tr></thead><tbody>
              {sourceOpportunityId&&<tr><td>Opportunity</td><td><b>{sourceOpportunityId}</b></td><td>{form.requestData?.opportunityName||'Sales Opportunity'}</td><td>Linked</td><td><button className="btn" onClick={()=>location.href=`/sales-crm/opportunities/${sourceOpportunityId}`}>Open</button></td></tr>}
              {!isNew&&<tr><td>Quote</td><td><b>{form.quoteNo}</b></td><td>{form.trade} / {form.equipment}</td><td>{form.status}</td><td>Current</td></tr>}
              {(form.bookings||[]).map((b:any)=><tr key={b.id}><td>Booking</td><td><b>{b.bookingNo}</b></td><td>Created from accepted quote</td><td>{b.status}</td><td><button className="btn" onClick={()=>location.href=`/bookings/${b.id}`}>Open</button></td></tr>)}
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
              {isNew&&<div className="sub">Save the Quote first to register activity.</div>}
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
            {!isNew&&form.status==='DRAFT'&&<><button className="btn" disabled={busy||expired} onClick={()=>void lifecycle('approve')}>Approve Rate</button><button className="btn" disabled={busy} onClick={()=>void lifecycle('reject')}>Reject</button></>}
            {!isNew&&form.status==='Rate Approved'&&<><button className="btn" disabled={busy||expired} onClick={()=>void lifecycle('send')}>Send Quote</button><button className="btn" disabled={busy} onClick={()=>void lifecycle('reject')}>Reject</button></>}
            {!isNew&&form.status==='Quote Sent'&&<><button className="btn" disabled={busy||expired} onClick={()=>void lifecycle('accept')}>Customer Accept</button><button className="btn" disabled={busy} onClick={()=>void lifecycle('reject')}>Reject</button></>}
            {!isNew&&form.status==='Customer Accepted'&&!booking&&<button className="btn" disabled={busy} onClick={()=>setTab('Workflow & Tracking')}>Convert to Booking</button>}
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn" disabled={busy} onClick={()=>void save(false)}>Save</button>
            <button className="btn" disabled={busy} onClick={()=>void save(true)}>Save & Close</button>
            <button className="btn" onClick={()=>location.href='/rates'}>Close</button>
          </div>
        </div>
      </div>
    </>}

    {tab==='Workflow & Tracking'&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Quote Lifecycle</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>
          {['DRAFT','Rate Approved','Quote Sent','Customer Accepted','Booking'].map((s,i)=>{
            const done=s==='Booking'?!!booking:(lifecycleOrder.indexOf(s)>=0&&currentStageIndex>=lifecycleOrder.indexOf(s));
            return <div key={s} style={{border:'1px solid '+(done?'#9dc6a4':'#d9e0e6'),background:done?'#eef8f0':'#f7f9fa',borderRadius:8,padding:12}}>
              <div style={{fontSize:11,color:'#627687'}}>STEP {i+1}</div><div style={{fontWeight:900,marginTop:4}}>{s}</div>
            </div>;
          })}
        </div>
      </div>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Workflow Tracking</h3>
        <div style={formGrid}>
          {modernField('Status',<input style={fieldStyle} value={form.status||''} readOnly/>)}
          {modernField('Validity',<input style={fieldStyle} value={form.validTo||''} readOnly/>)}
          {modernField('Opportunity',<input style={fieldStyle} value={sourceOpportunityId||''} readOnly/>)}
          {modernField('Booking',<input style={fieldStyle} value={booking?.bookingNo||'Not converted'} readOnly/>)}
        </div>
      </div>
      {form.status==='Customer Accepted'&&!booking&&<div className="card">
        <h3 style={sectionTitle}>Convert Accepted Quote to Booking</h3>
        <div style={formGrid}>
          {modernField('Booking No.',<input style={fieldStyle} value={convert.bookingNo} onChange={e=>setConvert({...convert,bookingNo:e.target.value})} placeholder="Auto if blank"/>)}
          {modernField('Origin *',<input style={fieldStyle} value={convert.origin} onChange={e=>setConvert({...convert,origin:e.target.value})}/>)}
          {modernField('Destination *',<input style={fieldStyle} value={convert.destination} onChange={e=>setConvert({...convert,destination:e.target.value})}/>)}
          {modernField('Quantity',<input type="number" min="1" style={fieldStyle} value={convert.quantity} onChange={e=>setConvert({...convert,quantity:e.target.value})}/>)}
          {modernField('Customer Reference',<input style={fieldStyle} value={convert.customerReference} onChange={e=>setConvert({...convert,customerReference:e.target.value})}/>)}
          {modernField('Carrier',<input style={fieldStyle} value={convert.carrier} onChange={e=>setConvert({...convert,carrier:e.target.value})}/>)}
          {modernField('Vessel / Voyage',<input style={fieldStyle} value={convert.vesselVoyage} onChange={e=>setConvert({...convert,vesselVoyage:e.target.value})}/>)}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={()=>void convertToBooking()}>Create Booking</button></div>
      </div>}
    </>}

    {tab==='Charges & Margin'&&<div className="card">
      <h3 style={sectionTitle}>Charges & Margin</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
        {[
          ['Buy Rate',`${form.currency} ${Number(form.buyRate||0).toFixed(2)}`],
          ['Sell Rate',`${form.currency} ${Number(form.sellRate||0).toFixed(2)}`],
          ['Gross Profit',`${form.currency} ${gp.toFixed(2)}`],
          ['Margin %',`${margin.toFixed(2)}%`],
          ['Commercial Status',form.status],
          ['Validity',`${form.validFrom||'—'} → ${form.validTo||'—'}`]
        ].map(([label,value])=><div key={label} style={{border:'1px solid #dfe5ea',borderRadius:8,padding:14,background:'#fafcfd'}}><div className="sub">{label}</div><div style={{fontSize:18,fontWeight:900,color:'#153a5d',marginTop:5}}>{value}</div></div>)}
      </div>
      <div className="sub" style={{marginTop:12}}>Commercial rate fields are editable in Draft. After approval, the commercial values are locked while validity and operational references remain controlled.</div>
    </div>}

    {tab==='Notes'&&<div className="card">
      <h3 style={sectionTitle}>Notes</h3>
      <textarea style={{...fieldStyle,minHeight:240,resize:'vertical'}} value={form.requestData?.notes||''} onChange={e=>setRequest('notes',e.target.value)}/>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}><button className="btn" disabled={busy} onClick={()=>void save(false)}>Save Notes</button></div>
    </div>}

    {tab==='Logs'&&<div className="card">
      <h3 style={sectionTitle}>Audit & Activity Logs</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Time</th><th>Type</th><th>Action</th><th>Actor</th></tr></thead><tbody>
        {(logs.audit||[]).map((x:any)=><tr key={x.id}><td>{String(x.createdAt||'').replace('T',' ').slice(0,19)}</td><td>Audit</td><td>{x.action}</td><td>{x.actorId}</td></tr>)}
        {(logs.activities||[]).map((x:any)=><tr key={x.activityId}><td>{String(x.createdAt||x.date||'').replace('T',' ').slice(0,19)}</td><td>Activity</td><td>{x.type}: {x.subject}</td><td>{x.createdBy||'System'}</td></tr>)}
        {!(logs.audit||[]).length&&!(logs.activities||[]).length&&<tr><td colSpan={4}>No log entries.</td></tr>}
      </tbody></table></div>
    </div>}
  </WorkspaceShell>;
}
