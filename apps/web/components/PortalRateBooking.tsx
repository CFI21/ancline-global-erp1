'use client';

import {useEffect,useState} from 'react';
import {api,fmtDate,fmtMoney} from '../lib/api';

type Customer={id:string;code:string;name:string};
type Offer={offerId:string;source:string;carrier:string;serviceName?:string|null;vessel?:string|null;voyage?:string|null;origin:string;destination:string;equipment:string;quantity:number;etd?:string|null;eta?:string|null;sellRate:number;currency:string;validTo?:string|null;externalQuoteRef?:string|null;freeTimeOrigin?:number|null;freeTimeDestination?:number|null};

export default function PortalRateBooking({token,role,onBooked}:{token:string;role:'CUSTOMER'|'AGENT';onBooked?:()=>void}){
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [bookingId,setBookingId]=useState('');
  const [bookingNo,setBookingNo]=useState('');
  const [offers,setOffers]=useState<Offer[]>([]);
  const [selectedQuote,setSelectedQuote]=useState<any>(null);
  const [security,setSecurity]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [form,setForm]=useState({customerId:'',origin:'',destination:'',equipment:'40HC',quantity:'1',commodity:'',grossWeight:'',volumeCbm:'',etd:'',freightTerms:'PREPAID',currency:'USD',customerReference:''});

  useEffect(()=>{if(!token)return;api('/portal/customers',token).then((x:any)=>{const rows=Array.isArray(x)?x:[];setCustomers(rows);if(role==='AGENT'&&rows.length===1)setForm(f=>({...f,customerId:rows[0].id}));}).catch(()=>{});},[token,role]);

  async function createAndSearch(){
    setBusy(true);setMessage('');setOffers([]);setSelectedQuote(null);setSecurity(null);
    try{
      const booking=await api('/portal/bookings',token,{method:'POST',body:JSON.stringify({...form,quantity:Number(form.quantity||1),grossWeight:form.grossWeight===''?null:Number(form.grossWeight),volumeCbm:form.volumeCbm===''?null:Number(form.volumeCbm),etd:form.etd?new Date(form.etd+'T00:00:00Z').toISOString():null})});
      setBookingId(booking.id);setBookingNo(booking.bookingNo);
      const result=await api('/rate-procurement/booking/'+booking.id+'/search',token,{method:'POST'});
      setOffers(Array.isArray(result?.offers)?result.offers:[]);
      setMessage((result?.offers?.length||0)+' online / filed forwarding rate option(s) found for '+booking.bookingNo+'.');
    }catch(e:any){setMessage(e?.message||'Could not create booking request or search rates');}
    finally{setBusy(false);}
  }

  async function useRate(o:Offer){
    setBusy(true);setMessage('');
    try{
      const result=await api('/rate-procurement/booking/'+bookingId+'/select/'+o.offerId,token,{method:'POST',body:'{}'});
      setSelectedQuote(result.quote);
      setMessage('Sell offer '+fmtMoney(result.quote.sellRate,result.quote.currency)+' selected. Confirm the booking request to continue.');
    }catch(e:any){setMessage(e?.message||'Could not select rate');}
    finally{setBusy(false);}
  }

  async function accept(){
    setBusy(true);setMessage('');
    try{
      const result=await api('/portal/bookings/'+bookingId+'/accept-quote',token,{method:'POST'});
      const s=await api('/portal/bookings/'+bookingId+'/release-security',token);
      setSecurity(s);setSelectedQuote(result.quote);
      setMessage('Booking '+result.booking.bookingNo+' submitted to ANCLINE operations. Payment / credit security will control release.');
      onBooked?.();
    }catch(e:any){setMessage(e?.message||'Could not submit booking');}
    finally{setBusy(false);}
  }

  const input={width:'100%',padding:8,border:'1px solid #cfd9e2',borderRadius:6,background:'#fff'} as React.CSSProperties;
  const label={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5} as React.CSSProperties;
  return <div className="card" style={{marginBottom:12}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><div><div className="sub">ONLINE FORWARDING</div><h2 style={{margin:'2px 0'}}>Global Rates & Direct Booking</h2><div className="sub">Live/filed carrier sell offers · direct booking · payment/credit release control</div></div>{bookingNo&&<span className="status">{bookingNo}</span>}</div>
    {message&&<div style={{margin:'12px 0',padding:10,border:'1px solid #dce5ec',borderRadius:7}}>{message}</div>}
    {!bookingId&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,marginTop:12}}>
        {role==='AGENT'&&<label><span style={label}>Customer *</span><select style={input} value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}</select></label>}
        <label><span style={label}>Origin *</span><input style={input} value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="NLRTM"/></label>
        <label><span style={label}>Destination *</span><input style={input} value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})} placeholder="AEJEA"/></label>
        <label><span style={label}>Equipment *</span><select style={input} value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})}><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option></select></label>
        <label><span style={label}>Quantity</span><input type="number" min="1" style={input} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label><span style={label}>Commodity</span><input style={input} value={form.commodity} onChange={e=>setForm({...form,commodity:e.target.value})}/></label>
        <label><span style={label}>Gross Weight kg</span><input type="number" style={input} value={form.grossWeight} onChange={e=>setForm({...form,grossWeight:e.target.value})}/></label>
        <label><span style={label}>Volume CBM</span><input type="number" style={input} value={form.volumeCbm} onChange={e=>setForm({...form,volumeCbm:e.target.value})}/></label>
        <label><span style={label}>Requested ETD</span><input type="date" style={input} value={form.etd} onChange={e=>setForm({...form,etd:e.target.value})}/></label>
        <label><span style={label}>Freight Terms</span><select style={input} value={form.freightTerms} onChange={e=>setForm({...form,freightTerms:e.target.value})}><option>PREPAID</option><option>COLLECT</option></select></label>
        <label><span style={label}>Currency</span><select style={input} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></label>
        <label><span style={label}>Your Reference</span><input style={input} value={form.customerReference} onChange={e=>setForm({...form,customerReference:e.target.value})}/></label>
      </div>
      <div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy||role==='AGENT'&&!form.customerId||!form.origin.trim()||!form.destination.trim()} onClick={createAndSearch}>{busy?'Searching...':'Get Global Rates'}</button></div>
    </>}

    {bookingId&&offers.length>0&&<div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Carrier / Service</th><th>Schedule</th><th>Equipment</th><th>Your Rate</th><th>Free Time</th><th>Validity</th><th></th></tr></thead><tbody>{offers.map(o=><tr key={o.offerId}><td><b>{o.carrier}</b><div className="sub">{o.serviceName||o.source}</div></td><td>ETD {fmtDate(o.etd||undefined)}<div className="sub">ETA {fmtDate(o.eta||undefined)} · {[o.vessel,o.voyage].filter(Boolean).join(' / ')||'-'}</div></td><td>{o.quantity||1} × {o.equipment}</td><td><b>{fmtMoney(o.sellRate,o.currency)}</b><div className="sub">Sell rate</div></td><td>ORG {o.freeTimeOrigin??'-'}d<div className="sub">DST {o.freeTimeDestination??'-'}d</div></td><td>{fmtDate(o.validTo||undefined)}<div className="sub">{o.externalQuoteRef||''}</div></td><td><button className="btn" disabled={busy||!!selectedQuote} onClick={()=>useRate(o)}>Select Rate</button></td></tr>)}</tbody></table></div>}
    {bookingId&&offers.length===0&&!busy&&<div style={{marginTop:12}}>No rate offers are currently available for this request.</div>}
    {selectedQuote&&<div style={{marginTop:12,padding:12,border:'1px solid #dce5ec',borderRadius:8}}><b>Selected quote {selectedQuote.quoteNo}</b> · {fmtMoney(selectedQuote.sellRate,selectedQuote.currency)} <span className="status">{selectedQuote.status}</span>{selectedQuote.status!=='Customer Accepted'&&<button className="btn" style={{marginLeft:10}} disabled={busy} onClick={accept}>Confirm & Book</button>}</div>}
    {security&&<div style={{marginTop:10}}><b>Release security:</b> <span className="status">{security.clear?'CLEAR':'HOLD'}</span> · {security.mode}{!security.clear&&<span> · {security.blockers?.join('; ')}</span>}</div>}
  </div>;
}
