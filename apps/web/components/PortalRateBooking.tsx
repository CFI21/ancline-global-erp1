'use client';

import {useEffect,useMemo,useState} from 'react';
import {api,fmtDate,fmtMoney} from '../lib/api';

type Customer={id:string;code:string;name:string;customerRef?:string|null;costCenterCode?:string|null;kycStatus?:string;roles?:string[]};
type Offer={offerId:string;source:string;carrier:string;serviceName?:string|null;vessel?:string|null;voyage?:string|null;origin:string;destination:string;equipment:string;quantity:number;etd?:string|null;eta?:string|null;sellRate?:number;currency:string;validTo?:string|null;freeTimeOrigin?:number|null;freeTimeDestination?:number|null};
type Quote={id:string;quoteNo:string;customerRef?:string;costCenterCode?:string;carrierCode?:string;carrierQuoteRef?:string;sellRate:number;currency:string;validTo?:string;status:string;termsVersion?:string;termsAcceptedAt?:string;trade?:string;equipment?:string};

export default function PortalRateBooking({token,role,onBooked}:{token:string;role:'CUSTOMER'|'SHIPPER'|'CONSIGNEE'|'AGENT'|'GLOBAL_ADMIN';onBooked?:()=>void}){
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [quotes,setQuotes]=useState<Quote[]>([]);
  const [requestId,setRequestId]=useState('');
  const [offers,setOffers]=useState<Offer[]>([]);
  const [selectedQuote,setSelectedQuote]=useState<Quote|null>(null);
  const [termsAccepted,setTermsAccepted]=useState(false);
  const [security,setSecurity]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [form,setForm]=useState({customerId:'',forwardingTradeType:role==='AGENT'?'CROSS_TRADE':'STANDARD',origin:'',destination:'',equipment:'40HC',quantity:'1',commodity:'',grossWeight:'',volumeCbm:'',etd:'',freightTerms:'PREPAID',currency:'USD',customerReference:'',shipper:'',consignee:''});

  useEffect(()=>{if(!token)return;void loadBase();},[token,role]);
  async function loadBase(){
    try{
      const [c,q]=await Promise.all([api('/portal/customers',token),api('/portal/forwarding/quotes',token).catch(()=>[])]);
      const rows=Array.isArray(c)?c:[];setCustomers(rows);setQuotes(Array.isArray(q)?q:[]);
      if(role!=='GLOBAL_ADMIN'&&rows.length===1)setForm(f=>({...f,customerId:rows[0].id}));
    }catch{}
  }

  const currentCustomer=useMemo(()=>customers.find(c=>c.id===form.customerId)||customers[0],[customers,form.customerId]);
  const kycReady=Boolean(currentCustomer?.customerRef&&currentCustomer?.kycStatus==='APPROVED'&&currentCustomer?.costCenterCode);

  async function searchRates(){
    setBusy(true);setMessage('');setOffers([]);setSelectedQuote(null);setTermsAccepted(false);setSecurity(null);setRequestId('');
    try{
      const result=await api('/rate-procurement/forwarding/search',token,{method:'POST',body:JSON.stringify({
        ...form,quantity:Number(form.quantity||1),grossWeight:form.grossWeight===''?null:Number(form.grossWeight),volumeCbm:form.volumeCbm===''?null:Number(form.volumeCbm),
        etd:form.etd?new Date(form.etd+'T00:00:00Z').toISOString():null
      })});
      setRequestId(result.requestId);setOffers(Array.isArray(result?.offers)?result.offers:[]);
      setMessage((result?.offers?.length||0)+' carrier rate option(s) found. No booking exists yet; first select a rate to create the ANC quote.');
    }catch(e:any){setMessage(e?.message||'Could not search Forwarding rates');}
    finally{setBusy(false);}
  }

  async function useRate(o:Offer){
    setBusy(true);setMessage('');
    try{
      const result=await api('/rate-procurement/forwarding/select/'+requestId+'/'+o.offerId,token,{method:'POST',body:'{}'});
      setSelectedQuote(result.quote);setTermsAccepted(false);
      setMessage('ANC quote '+result.quote.quoteNo+' issued. Accept the ANC quoted terms before ANCLINE creates the ANC booking.'+(role==='GLOBAL_ADMIN'&&result.quote.carrierCode?' Internal carrier match: '+result.quote.carrierCode+' / '+result.quote.carrierQuoteRef+'.':''));
      await loadBase();
    }catch(e:any){setMessage(e?.message||'Could not issue ANC Forwarding quote');}
    finally{setBusy(false);}
  }

  async function accept(){
    if(!selectedQuote)return;
    setBusy(true);setMessage('');
    try{
      const result=await api('/portal/forwarding/quotes/'+selectedQuote.id+'/accept',token,{method:'POST',body:JSON.stringify({termsAccepted:true,termsVersion:selectedQuote.termsVersion})});
      const s=await api('/portal/bookings/'+result.booking.id+'/release-security',token).catch(()=>null);
      setSecurity(s);setSelectedQuote(result.quote);
      const autoStatus=String(result?.automation?.status||'');
      const auto=role==='GLOBAL_ADMIN'&&autoStatus?(' Internal carrier workflow: '+autoStatus+'.'):autoStatus==='PENDING_PAYMENT_CONTROL'?' ANC internal payment/payer control is being completed before carrier submission.':'';
      setMessage('ANC quote '+result.quote.quoteNo+' accepted. ANC booking '+result.booking.bookingNo+' has now been created.'+auto);
      setRequestId('');setOffers([]);setTermsAccepted(false);await loadBase();onBooked?.();
    }catch(e:any){setMessage(e?.message||'Could not accept ANC quote and start booking');}
    finally{setBusy(false);}
  }

  const input={width:'100%',padding:8,border:'1px solid #cfd9e2',borderRadius:6,background:'#fff'} as React.CSSProperties;
  const label={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5} as React.CSSProperties;

  return <div className="card" style={{marginBottom:12}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}>
      <div><div className="sub">GLOBAL ANCLINE FORWARDING</div><h2 style={{margin:'2px 0'}}>Carrier Rate → ANC Quote → Booking</h2><div className="sub">Approved ANC customer only · accepted ANC quote required before any booking is created</div></div>
      {currentCustomer?.customerRef&&<span className="status">{currentCustomer.customerRef}</span>}
    </div>
    {message&&<div style={{margin:'12px 0',padding:10,border:'1px solid #dce5ec',borderRadius:7}}>{message}</div>}

    {currentCustomer&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:12}}>
      <div><span className="sub">ANC CUSTOMER REF</span><div><b>{currentCustomer.customerRef||'Pending KYC approval'}</b></div></div>
      <div><span className="sub">KYC</span><div><span className="status">{currentCustomer.kycStatus||'NOT STARTED'}</span></div></div>
      <div><span className="sub">FORWARDING COST CENTER</span><div><b>{currentCustomer.costCenterCode||'Not assigned'}</b></div></div>
      {role==='AGENT'&&<div><span className="sub">AGENT MODE</span><div><b>LINER AGENCY + authorized Forwarding exception</b></div></div>}
    </div>}

    {!requestId&&!selectedQuote&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,marginTop:14}}>
        {role==='GLOBAL_ADMIN'&&<label><span style={label}>ANC Registered Customer *</span><select style={input} value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Select approved customer</option>{customers.filter(c=>c.kycStatus==='APPROVED'&&c.customerRef).map(c=><option key={c.id} value={c.id}>{c.customerRef} · {c.name}</option>)}</select></label>}
        {(role==='AGENT'||role==='GLOBAL_ADMIN')&&<label><span style={label}>Forwarding Trade Type *</span><select style={input} value={form.forwardingTradeType} onChange={e=>setForm({...form,forwardingTradeType:e.target.value})}>{role!=='AGENT'&&<option value="STANDARD">Standard Forwarding</option>}<option value="DIRECT_COLOAD">Direct Co-load</option><option value="CROSS_TRADE">Cross Trade</option></select></label>}
        <label><span style={label}>Origin *</span><input style={input} value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="NLRTM"/></label>
        <label><span style={label}>Destination *</span><input style={input} value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})} placeholder="AEJEA"/></label>
        <label><span style={label}>Equipment *</span><select style={input} value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})}><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option></select></label>
        <label><span style={label}>Quantity</span><input type="number" min="1" style={input} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label><span style={label}>Commodity</span><input style={input} value={form.commodity} onChange={e=>setForm({...form,commodity:e.target.value})}/></label>
        <label><span style={label}>Gross Weight kg</span><input type="number" style={input} value={form.grossWeight} onChange={e=>setForm({...form,grossWeight:e.target.value})}/></label>
        <label><span style={label}>Volume CBM</span><input type="number" style={input} value={form.volumeCbm} onChange={e=>setForm({...form,volumeCbm:e.target.value})}/></label>
        <label><span style={label}>Requested ETD</span><input type="date" style={input} value={form.etd} onChange={e=>setForm({...form,etd:e.target.value})}/></label>
        <label><span style={label}>Shipper</span><input style={input} value={form.shipper} onChange={e=>setForm({...form,shipper:e.target.value})}/></label>
        <label><span style={label}>Consignee</span><input style={input} value={form.consignee} onChange={e=>setForm({...form,consignee:e.target.value})}/></label>
        <label><span style={label}>Freight Terms</span><select style={input} value={form.freightTerms} onChange={e=>setForm({...form,freightTerms:e.target.value})}><option>PREPAID</option><option>COLLECT</option></select></label>
        <label><span style={label}>Currency</span><select style={input} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></label>
        <label><span style={label}>Your Reference</span><input style={input} value={form.customerReference} onChange={e=>setForm({...form,customerReference:e.target.value})}/></label>
      </div>
      {!kycReady&&role!=='GLOBAL_ADMIN'&&<div style={{marginTop:10}}><b>Forwarding locked:</b> KYC approval, ANC customer reference and cost center are required.</div>}
      <div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy||!kycReady||!form.origin.trim()||!form.destination.trim()} onClick={searchRates}>{busy?'Searching...':'Get Carrier Rates'}</button></div>
    </>}

    {requestId&&offers.length>0&&<div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Carrier / Service</th><th>Schedule</th><th>Equipment</th><th>ANC Sell Rate</th><th>Free Time</th><th>Validity</th><th></th></tr></thead><tbody>{offers.map(o=><tr key={o.offerId}><td><b>{o.carrier}</b><div className="sub">{o.serviceName||o.source}</div></td><td>ETD {fmtDate(o.etd||undefined)}<div className="sub">ETA {fmtDate(o.eta||undefined)} · {[o.vessel,o.voyage].filter(Boolean).join(' / ')||'-'}</div></td><td>{o.quantity||1} × {o.equipment}</td><td><b>{fmtMoney(Number(o.sellRate||0),o.currency)}</b></td><td>ORG {o.freeTimeOrigin??'-'}d<div className="sub">DST {o.freeTimeDestination??'-'}d</div></td><td>{fmtDate(o.validTo||undefined)}</td><td><button className="btn" disabled={busy||!!selectedQuote} onClick={()=>useRate(o)}>Create ANC Quote</button></td></tr>)}</tbody></table></div>}
    {requestId&&offers.length===0&&!busy&&<div style={{marginTop:12}}>No approved carrier offers are currently available for this quote request.</div>}

    {selectedQuote&&selectedQuote.status!=='Customer Accepted'&&<div style={{marginTop:12,padding:12,border:'1px solid #dce5ec',borderRadius:8}}>
      <div><b>ANC Quote {selectedQuote.quoteNo}</b> · {fmtMoney(selectedQuote.sellRate,selectedQuote.currency)} <span className="status">{selectedQuote.status}</span></div>
      <div className="sub" style={{marginTop:5}}>{role==='GLOBAL_ADMIN'&&selectedQuote.carrierCode?<>Internal carrier match: {selectedQuote.carrierCode} / {selectedQuote.carrierQuoteRef} · </>:null}Terms: {selectedQuote.termsVersion} · Valid to {fmtDate(selectedQuote.validTo)}</div>
      <label style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:12}}><input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/><span>I accept the ANC Forwarding quote and all booking terms for quote {selectedQuote.quoteNo}. I understand that booking starts only after this acceptance.</span></label>
      <button className="btn" style={{marginTop:10}} disabled={busy||!termsAccepted} onClick={accept}>{busy?'Starting booking...':'Accept ANC Quote & Start Booking'}</button>
    </div>}

    {security&&<div style={{marginTop:10}}><b>Release security:</b> <span className="status">{security.clear?'CLEAR':'HOLD'}</span> · {security.mode}{!security.clear&&<span> · {security.blockers?.join('; ')}</span>}</div>}

    {quotes.length>0&&<div style={{marginTop:16}}><h3 style={{marginBottom:8}}>My ANC Forwarding Quotes</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>ANC Quote</th>{role==='GLOBAL_ADMIN'&&<th>Internal Carrier Ref</th>}<th>Trade</th><th>Equipment</th><th>Sell</th><th>Validity</th><th>Status</th></tr></thead><tbody>{quotes.slice(0,20).map(q=><tr key={q.id}><td><b>{q.quoteNo}</b><div className="sub">{q.customerRef}</div></td>{role==='GLOBAL_ADMIN'&&<td>{q.carrierCode||'-'} / {q.carrierQuoteRef||'-'}</td>}<td>{q.trade||'-'}</td><td>{q.equipment||'-'}</td><td>{fmtMoney(q.sellRate,q.currency)}</td><td>{fmtDate(q.validTo)}</td><td><span className="status">{q.status}</span></td></tr>)}</tbody></table></div></div>}
  </div>;
}
