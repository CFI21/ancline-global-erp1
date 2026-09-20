'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import CommercialFlowGrid from '../../components/CommercialFlowGrid';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[]};
type Rate={
  id:string;quoteNo:string;customerId:string;trade:string;equipment:string;
  buyRate:any;sellRate:any;currency:string;validFrom:string;validTo:string;
  status:string;source?:string;grossProfit?:number;marginPct?:number;expired?:boolean;
  _count?:{bookings:number};
};
type Dashboard={
  totalQuotes:number;openPipeline:number;pipelineSellValue:number;pipelineGrossProfit:number;
  avgMarginPct:number;expiring7d:number;expiredOpen:number;acceptedAwaitingBooking:number;
};
type ConvertForm={
  id:string;quoteNo:string;bookingNo:string;origin:string;destination:string;
  quantity:string;customerReference:string;
};

const emptyDashboard:Dashboard={
  totalQuotes:0,openPipeline:0,pipelineSellValue:0,pipelineGrossProfit:0,
  avgMarginPct:0,expiring7d:0,expiredOpen:0,acceptedAwaitingBooking:0
};

function laneParts(trade:string){
  return String(trade||'').split(/\s*(?:->|>|\/|→|-)\s*/).filter(Boolean);
}

export default function RatesPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Rate[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [dashboard,setDashboard]=useState<Dashboard>(emptyDashboard);
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [convert,setConvert]=useState<ConvertForm|null>(null);
  const [lastBooking,setLastBooking]=useState<{id:string;bookingNo:string}|null>(null);
  const [contextBooking,setContextBooking]=useState<any>(null);
  const [form,setForm]=useState({
    quoteNo:'',customerId:'',trade:'',equipment:'40HC',buyRate:'',sellRate:'',
    currency:'USD',validFrom:new Date().toISOString().slice(0,10),validTo:'',source:'NVOCC_COMMERCIAL_DESK'
  });

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const [r,o,d]=await Promise.all([api('/rates',t),api('/organizations',t),api('/rates/dashboard',t)]);
      setRows(Array.isArray(r)?r:[]);
      setOrgs(Array.isArray(o)?o:[]);
      setDashboard({...emptyDashboard,...d});
      const contextId=new URLSearchParams(location.search).get('bookingId')||'';
      if(contextId){
        const b=await api(`/bookings/${contextId}`,t).catch(()=>null);
        if(b){
          setContextBooking(b);
          setForm(x=>({...x,
            customerId:b.customerId||x.customerId,
            trade:[b.origin,b.destination].filter(Boolean).join('-')||x.trade,
            equipment:b.equipment||x.equipment,
            currency:b.currency||x.currency
          }));
          setSearch(b.customerReference||b.bookingNo||'');
        }
      }
    }catch(e:any){setMessage(e.message||'Unable to load commercial quotes');}
  }

  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')),[orgs]);
  const customerName=(id:string)=>orgs.find(o=>o.id===id)?.name||id;
  const visible=useMemo(()=>{
    const q=search.toLowerCase().trim();
    return rows.filter(r=>{
      const statusOk=statusFilter==='ALL'||r.status===statusFilter||(statusFilter==='EXPIRED'&&r.expired);
      const queryOk=!q||[r.quoteNo,r.trade,r.equipment,r.status,r.currency,r.source,customerName(r.customerId)]
        .some(v=>String(v||'').toLowerCase().includes(q));
      return statusOk&&queryOk;
    });
  },[rows,search,statusFilter,orgs]);

  const gross=(r:Rate)=>Number(r.grossProfit??(Number(r.sellRate||0)-Number(r.buyRate||0)));
  const margin=(r:Rate)=>Number(r.marginPct??(Number(r.sellRate||0)>0?gross(r)/Number(r.sellRate)*100:0));

  async function createRate(){
    if(!form.customerId||!form.trade.trim()||!form.validTo){setMessage('Customer, trade and valid-to date are required.');return;}
    setBusy(true);setMessage('');setLastBooking(null);
    try{
      const quoteNo=form.quoteNo.trim()||`Q-${Date.now().toString().slice(-8)}`;
      await api('/rates',token,{method:'POST',body:JSON.stringify({
        quoteNo,customerId:form.customerId,trade:form.trade.trim().toUpperCase(),equipment:form.equipment,
        buyRate:Number(form.buyRate||0),sellRate:Number(form.sellRate||0),currency:form.currency,
        validFrom:new Date(`${form.validFrom}T00:00:00Z`).toISOString(),
        validTo:new Date(`${form.validTo}T23:59:59Z`).toISOString(),
        source:form.source
      })});
      setMessage(`Quote ${quoteNo} created in Draft.`);
      setForm({...form,quoteNo:'',trade:'',buyRate:'',sellRate:'',validTo:''});
      await load();
    }catch(e:any){setMessage(e.message||'Quote could not be created.');}
    finally{setBusy(false);}
  }

  async function action(id:string,act:'approve'|'send'|'accept'|'reject'){
    setMessage('');setLastBooking(null);
    try{
      const init:RequestInit={method:'POST'};
      if(act==='reject') init.body=JSON.stringify({reason:'Commercial quote rejected'});
      await api(`/rates/${id}/${act}`,token,init);
      await load();
    }catch(e:any){setMessage(e.message||'Quote action failed.');}
  }

  function beginConvert(r:Rate){
    const parts=laneParts(r.trade);
    setConvert({
      id:r.id,quoteNo:r.quoteNo,bookingNo:'',
      origin:(parts[0]||'').toUpperCase(),
      destination:(parts[parts.length-1]||'').toUpperCase(),
      quantity:'1',customerReference:''
    });
    setMessage('');
    setLastBooking(null);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function convertQuote(){
    if(!convert)return;
    if(!convert.origin.trim()||!convert.destination.trim()){
      setMessage('Origin and destination are required for booking conversion.');return;
    }
    setBusy(true);setMessage('');
    try{
      const result=await api(`/rates/${convert.id}/convert`,token,{method:'POST',body:JSON.stringify({
        bookingNo:convert.bookingNo.trim()||undefined,
        origin:convert.origin.trim().toUpperCase(),
        destination:convert.destination.trim().toUpperCase(),
        quantity:Number(convert.quantity||1),
        customerReference:convert.customerReference.trim()||undefined
      })});
      const booking=result?.booking;
      setMessage(`Quote ${convert.quoteNo} converted to booking ${booking?.bookingNo||''}.`);
      if(booking?.id&&booking?.bookingNo)setLastBooking({id:booking.id,bookingNo:booking.bookingNo});
      setConvert(null);
      await load();
    }catch(e:any){setMessage(e.message||'Quote could not be converted to a booking.');}
    finally{setBusy(false);}
  }

  const kpis=[
    ['Open pipeline',String(dashboard.openPipeline),'Active commercial quotes'],
    ['Pipeline sell',fmtMoney(dashboard.pipelineSellValue,'USD'),'Indicative across open quotes'],
    ['Average GP %',`${Number(dashboard.avgMarginPct||0).toFixed(1)}%`,'Gross margin on open pipeline'],
    ['Expiring ≤ 7d',String(dashboard.expiring7d),'Quotes requiring action'],
    ['Accepted → booking',String(dashboard.acceptedAwaitingBooking),'Won quotes not yet converted']
  ];

  return <WorkspaceShell
    title="NVOCC Commercial / Tariffs"
    subtitle="ANC NVOCC tariff publication, quote-to-booking control, margin governance and validity"
    active="/rates"
    actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>
      {message}
      {lastBooking&&<> &nbsp;<a href={`/bookings/${lastBooking.id}`}><b>Open {lastBooking.bookingNo}</b></a></>}
    </div>}
    <CommercialFlowGrid
      active="ANC_QUOTE"
      bookingId={contextBooking?.id||lastBooking?.id||''}
      bookingNo={contextBooking?.bookingNo||lastBooking?.bookingNo||''}
      quoteNo={contextBooking?.rateQuote?.quoteNo||''}
      carrier={contextBooking?.carrier||''}
      quoteStatus={contextBooking?.rateQuote?.status||''}
      buyLabel={contextBooking?.rateQuote?fmtMoney(contextBooking.rateQuote.buyRate,contextBooking.rateQuote.currency):''}
      sellLabel={contextBooking?.rateQuote?fmtMoney(contextBooking.rateQuote.sellRate,contextBooking.rateQuote.currency):''}
    />
    {contextBooking&&<JobContextRail
      bookingId={contextBooking.id}
      bookingNo={contextBooking.bookingNo}
      active="RATES"
      customer={contextBooking.customer?.name||customerName(contextBooking.customerId)}
      route={`${contextBooking.origin||'—'} → ${contextBooking.destination||'—'}`}
      carrier={contextBooking.carrier||''}
      vessel={contextBooking.vesselVoyage||''}
      equipment={contextBooking.equipment?`${contextBooking.quantity||1} × ${contextBooking.equipment}`:''}
      status={contextBooking.status||''}
      etd={contextBooking.etd?fmtDate(contextBooking.etd):''}
      eta={contextBooking.eta?fmtDate(contextBooking.eta):''}
    />}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:12}}>
      {kpis.map(([label,value,note])=><div className="card" key={label}>
        <div style={{fontSize:12,fontWeight:800,color:'#526778',textTransform:'uppercase'}}>{label}</div>
        <div style={{fontSize:24,fontWeight:900,color:'#153a5d',margin:'4px 0'}}>{value}</div>
        <div className="sub">{note}</div>
      </div>)}
    </div>

    {convert&&<div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Convert accepted quote {convert.quoteNo} to booking</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Job Ref</span><input inputMode="numeric" maxLength={5} pattern="\\d{5}" style={fieldStyle} value={convert.bookingNo} onChange={e=>setConvert({...convert,bookingNo:e.target.value.replace(/\\D/g,'').slice(0,5)})} placeholder="Auto 5-digit"/></label>
        <label><span style={labelStyle}>Origin *</span><input style={fieldStyle} value={convert.origin} onChange={e=>setConvert({...convert,origin:e.target.value})} placeholder="CNSHA"/></label>
        <label><span style={labelStyle}>Destination *</span><input style={fieldStyle} value={convert.destination} onChange={e=>setConvert({...convert,destination:e.target.value})} placeholder="AEJEA"/></label>
        <label><span style={labelStyle}>Quantity</span><input type="number" min="1" style={fieldStyle} value={convert.quantity} onChange={e=>setConvert({...convert,quantity:e.target.value})}/></label>
        <label><span style={labelStyle}>Customer Reference</span><input style={fieldStyle} value={convert.customerReference} onChange={e=>setConvert({...convert,customerReference:e.target.value})}/></label>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
        <button className="btn" onClick={()=>setConvert(null)}>Cancel</button>
        <button className="btn" disabled={busy} onClick={convertQuote}>{busy?'Creating…':'Create Booking'}</button>
      </div>
    </div>}

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>New ANC NVOCC tariff / quote</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Quote No.</span><input style={fieldStyle} value={form.quoteNo} onChange={e=>setForm({...form,quoteNo:e.target.value})} placeholder="Auto if blank"/></label>
        <label><span style={labelStyle}>Customer *</span><select style={fieldStyle} value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}</select></label>
        <label><span style={labelStyle}>Trade / Lane *</span><input style={fieldStyle} value={form.trade} onChange={e=>setForm({...form,trade:e.target.value})} placeholder="CNSHA-AEJEA"/></label>
        <label><span style={labelStyle}>Equipment</span><select style={fieldStyle} value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})}>{['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Buy Rate</span><input type="number" min="0" style={fieldStyle} value={form.buyRate} onChange={e=>setForm({...form,buyRate:e.target.value})}/></label>
        <label><span style={labelStyle}>Sell Rate</span><input type="number" min="0" style={fieldStyle} value={form.sellRate} onChange={e=>setForm({...form,sellRate:e.target.value})}/></label>
        <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Valid From</span><input type="date" style={fieldStyle} value={form.validFrom} onChange={e=>setForm({...form,validFrom:e.target.value})}/></label>
        <label><span style={labelStyle}>Valid To *</span><input type="date" style={fieldStyle} value={form.validTo} onChange={e=>setForm({...form,validTo:e.target.value})}/></label>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}>
        <button className="btn" disabled={busy} onClick={createRate}>{busy?'Saving…':'Create Quote'}</button>
      </div>
    </div>

    <div className="card">
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        <input style={{...fieldStyle,maxWidth:380}} placeholder="Search quote, customer, lane, equipment or status" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select style={{...fieldStyle,maxWidth:210}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="Rate Approved">Rate Approved</option>
          <option value="Quote Sent">Quote Sent</option>
          <option value="Customer Accepted">Customer Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="EXPIRED">Expired / overdue</option>
        </select>
      </div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr>
        <th>Quote</th><th>Customer</th><th>Trade</th><th>Equipment</th><th>Buy</th><th>Sell</th>
        <th>GP</th><th>GP %</th><th>Validity</th><th>Status</th><th>Actions</th>
      </tr></thead><tbody>
        {visible.map(r=><tr key={r.id}>
          <td><b>{r.quoteNo}</b><div className="sub">{r.source||'MANUAL'}</div></td>
          <td>{customerName(r.customerId)}</td>
          <td>{r.trade}</td>
          <td>{r.equipment}</td>
          <td>{fmtMoney(r.buyRate,r.currency)}</td>
          <td>{fmtMoney(r.sellRate,r.currency)}</td>
          <td>{fmtMoney(gross(r),r.currency)}</td>
          <td><b>{margin(r).toFixed(1)}%</b></td>
          <td>{fmtDate(r.validFrom)} – {fmtDate(r.validTo)}{r.expired&&<div style={{fontWeight:800}}>Expired</div>}</td>
          <td><span className="status">{r.status}</span>{Number(r._count?.bookings||0)>0&&<div className="sub">Booking linked</div>}</td>
          <td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {r.status==='DRAFT'&&<><button className="btn" onClick={()=>void action(r.id,'approve')}>Approve</button><button className="btn" onClick={()=>void action(r.id,'reject')}>Reject</button></>}
            {r.status==='Rate Approved'&&<><button className="btn" onClick={()=>void action(r.id,'send')}>Send</button><button className="btn" onClick={()=>void action(r.id,'reject')}>Reject</button></>}
            {r.status==='Quote Sent'&&<><button className="btn" onClick={()=>void action(r.id,'accept')}>Accept</button><button className="btn" onClick={()=>void action(r.id,'reject')}>Reject</button></>}
            {r.status==='Customer Accepted'&&Number(r._count?.bookings||0)===0&&<button className="btn" onClick={()=>beginConvert(r)}>Convert</button>}
            {r.status==='Customer Accepted'&&Number(r._count?.bookings||0)>0&&<span className="sub">Converted</span>}
            {r.expired&&<span className="sub">Extend validity before advancing</span>}
          </div></td>
        </tr>)}
        {visible.length===0&&<tr><td colSpan={11}>No commercial quotes found.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
