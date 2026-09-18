'use client';

import {useEffect,useMemo,useState} from 'react';
import {api,currentUser,fmtDate,fmtMoney,requireToken,signOut} from '../../lib/api';

type Party={id:string;code:string;name:string;roles?:string[]};
type Booking={id:string;bookingNo:string;businessModel:string;bookingChannel:string;status:string;origin:string;destination:string;carrier?:string;vesselVoyage?:string;etd?:string;eta?:string;houseBL?:string;masterBL?:string;customer?:Party;producingAgent?:Party;rateQuote?:any;documents?:any[];containers?:any[];creditStatus?:string;slotStatus?:string;equipmentStatus?:string};
type Offer={offerId:string;carrier:string;serviceName?:string;equipment:string;quantity:number;currency:string;sellRate?:number;buyRate?:number;allInBuyRate?:number;etd?:string;eta?:string;validTo?:string;vessel?:string;voyage?:string};
type Doc={id:string;documentNo?:string;type:string;status:string;releaseControl?:string;version?:number;updatedAt?:string;booking?:any};

const emptyForm={partyId:'',origin:'',destination:'',equipment:'40HC',quantity:'1',commodity:'',grossWeight:'',volumeCbm:'',etd:'',freightTerms:'PREPAID',currency:'USD',customerReference:'',shipper:'',consignee:''};

export default function NvoccPortal(){
  const user=currentUser();
  const role=String(user?.role||'').toUpperCase();
  const internalRateView=role==='GLOBAL_ADMIN';
  const [token,setToken]=useState(''),[parties,setParties]=useState<Party[]>([]),[rows,setRows]=useState<Booking[]>([]),[docs,setDocs]=useState<Doc[]>([]);
  const [form,setForm]=useState(emptyForm),[bookingId,setBookingId]=useState(''),[bookingNo,setBookingNo]=useState(''),[offers,setOffers]=useState<Offer[]>([]);
  const [pricingValue,setPricingValue]=useState('15'),[selected,setSelected]=useState<any>(null),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

  useEffect(()=>{const t=requireToken();if(!t)return;if(!['AGENT','BRANCH_OPS','GLOBAL_ADMIN'].includes(role)){location.replace('/');return;}setToken(t);void load(t);},[role]);

  async function load(t=token){
    try{
      const [p,b,d]=await Promise.all([api('/portal/nvocc/parties',t),api('/portal/nvocc/bookings',t),api('/portal/nvocc/documents',t)]);
      const pp=Array.isArray(p)?p:[];setParties(pp);setRows(Array.isArray(b)?b:[]);setDocs(Array.isArray(d)?d:[]);
      if(role==='AGENT'&&pp[0])setForm(x=>({...x,partyId:pp[0].id}));
    }catch(e:any){setMessage(e?.message||'Unable to load NVOCC Portal');}
  }

  async function createAndSearch(){
    setBusy(true);setMessage('');setOffers([]);setSelected(null);
    try{
      const body={...form,customerId:form.partyId||undefined,quantity:Number(form.quantity||1),grossWeight:form.grossWeight===''?null:Number(form.grossWeight),volumeCbm:form.volumeCbm===''?null:Number(form.volumeCbm),etd:form.etd?new Date(form.etd+'T00:00:00Z').toISOString():null};
      const booking=await api('/portal/nvocc/bookings',token,{method:'POST',body:JSON.stringify(body)});
      setBookingId(booking.id);setBookingNo(booking.bookingNo);
      const result=await api('/rate-procurement/booking/'+booking.id+'/search',token,{method:'POST'});
      setOffers(Array.isArray(result?.offers)?result.offers:[]);
      setMessage((result?.offers?.length||0)+' NVOCC online / filed rate option(s) found.');
      await load();
    }catch(e:any){setMessage(e?.message||'Could not create NVOCC rate request');}
    finally{setBusy(false);}
  }

  async function selectRate(o:Offer){
    setBusy(true);setMessage('');
    try{
      const body=internalRateView?{pricingMethod:'MARKUP_PCT',pricingValue:Number(pricingValue||0)}:{};
      const result=await api('/rate-procurement/booking/'+bookingId+'/select/'+o.offerId,token,{method:'POST',body:JSON.stringify(body)});
      setSelected(result.quote);setMessage('NVOCC rate selected. Quote '+result.quote.quoteNo+' is ready for acceptance.');
    }catch(e:any){setMessage(e?.message||'Could not select NVOCC rate');}
    finally{setBusy(false);}
  }

  async function accept(){
    setBusy(true);setMessage('');
    try{
      const result=await api('/portal/nvocc/bookings/'+bookingId+'/accept-quote',token,{method:'POST'});
      setSelected(result.quote);setMessage('NVOCC booking '+result.booking.bookingNo+' submitted into NVOCC operations.');
      setBookingId('');setBookingNo('');setOffers([]);setForm(x=>({...emptyForm,partyId:role==='AGENT'?(parties[0]?.id||''):''}));await load();
    }catch(e:any){setMessage(e?.message||'Could not submit NVOCC booking');}
    finally{setBusy(false);}
  }

  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(b=>!q||[b.bookingNo,b.customer?.name,b.producingAgent?.name,b.origin,b.destination,b.carrier,b.vesselVoyage,b.status,b.houseBL,b.masterBL].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);
  const active=rows.filter(b=>!['CANCELLED','FINANCIALLY_CLOSED'].includes(String(b.status).toUpperCase())).length;
  const pendingDocs=docs.filter(d=>String(d.status).toUpperCase()!=='RELEASED').length;
  const field:React.CSSProperties={width:'100%',padding:8,border:'1px solid #cfd9e2',borderRadius:6,background:'#fff'};
  const label:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};

  return <main style={{padding:18,maxWidth:1380,margin:'0 auto'}}>
    <div className="top"><div><div className="sub">ANCLINE NVOCC PORTAL</div><h1 style={{margin:'2px 0'}}>NVOCC Rates, Bookings & Documents</h1><div className="sub">Agent · Branch Office · Global Admin only · {user?.email||''}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{role==='GLOBAL_ADMIN'&&<><a className="btn" href="/" style={{textDecoration:'none'}}>Admin ERP</a><a className="btn" href="/customer-portal" style={{textDecoration:'none'}}>Global Forwarding</a></>}<button className="btn" onClick={()=>void load()}>Refresh</button><button className="btn" onClick={signOut}>Sign out</button></div></div>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">NVOCC JOBS</div><div className="kpi">{rows.length}</div></div>
      <div className="card"><div className="sub">ACTIVE</div><div className="kpi">{active}</div></div>
      <div className="card"><div className="sub">ALL DOCUMENTS</div><div className="kpi">{docs.length}</div></div>
      <div className="card"><div className="sub">DOCS NOT RELEASED</div><div className="kpi">{pendingDocs}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div className="top"><div><div className="sub">NVOCC ONLINE RATE</div><h2 style={{margin:'2px 0'}}>Rate Search & Booking</h2><div className="sub">NVOCC rate access stays inside this portal only.</div></div>{bookingNo&&<span className="status">{bookingNo}</span>}</div>
      {!bookingId&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:10,marginTop:12}}>
        {role!=='AGENT'&&<label><span style={label}>Contracting Party *</span><select style={field} value={form.partyId} onChange={e=>setForm({...form,partyId:e.target.value})}><option value="">Select agent / party</option>{parties.map(p=><option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}</select></label>}
        <label><span style={label}>Origin *</span><input style={field} value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="NLRTM"/></label>
        <label><span style={label}>Destination *</span><input style={field} value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})} placeholder="AEJEA"/></label>
        <label><span style={label}>Equipment</span><select style={field} value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})}><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option></select></label>
        <label><span style={label}>Quantity</span><input type="number" min="1" style={field} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label><span style={label}>Commodity</span><input style={field} value={form.commodity} onChange={e=>setForm({...form,commodity:e.target.value})}/></label>
        <label><span style={label}>Requested ETD</span><input type="date" style={field} value={form.etd} onChange={e=>setForm({...form,etd:e.target.value})}/></label>
        <label><span style={label}>Reference</span><input style={field} value={form.customerReference} onChange={e=>setForm({...form,customerReference:e.target.value})}/></label>
      </div><div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy||!form.partyId||!form.origin.trim()||!form.destination.trim()} onClick={createAndSearch}>{busy?'Searching...':'Get NVOCC Rates'}</button></div></>}

      {bookingId&&internalRateView&&<div style={{marginTop:10,maxWidth:220}}><label><span style={label}>Sell Markup %</span><input type="number" style={field} value={pricingValue} onChange={e=>setPricingValue(e.target.value)}/></label></div>}
      {bookingId&&offers.length>0&&<div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Carrier / Service</th><th>Schedule</th><th>Equipment</th>{internalRateView&&<th>Internal Buy</th>}<th>{internalRateView?'Estimated Sell':'NVOCC Rate'}</th><th>Validity</th><th></th></tr></thead><tbody>{offers.map(o=>{const buy=Number(o.allInBuyRate??o.buyRate??0),shown=internalRateView?buy*(1+Number(pricingValue||0)/100):Number(o.sellRate||0);return <tr key={o.offerId}><td><b>{o.carrier}</b><div className="sub">{o.serviceName||''}</div></td><td>ETD {fmtDate(o.etd)}<div className="sub">ETA {fmtDate(o.eta)} · {[o.vessel,o.voyage].filter(Boolean).join(' / ')||'-'}</div></td><td>{o.quantity||1} × {o.equipment}</td>{internalRateView&&<td>{fmtMoney(buy,o.currency)}</td>}<td><b>{fmtMoney(shown,o.currency)}</b></td><td>{fmtDate(o.validTo)}</td><td><button className="btn" disabled={busy||!!selected} onClick={()=>selectRate(o)}>Use Rate</button></td></tr>})}</tbody></table></div>}
      {bookingId&&offers.length===0&&!busy&&<div style={{marginTop:12}}>No NVOCC rate options are currently available.</div>}
      {selected&&<div style={{marginTop:12,padding:12,border:'1px solid #dce5ec',borderRadius:8}}><b>Selected quote {selected.quoteNo}</b> · {fmtMoney(selected.sellRate,selected.currency)} <span className="status">{selected.status}</span><button className="btn" style={{marginLeft:10}} disabled={busy} onClick={accept}>Accept & Submit NVOCC Booking</button></div>}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}><div><h3 style={{margin:0}}>NVOCC Booking Register</h3><div className="sub">Only NVOCC jobs visible here.</div></div><input style={{...field,maxWidth:420}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search booking, party, route, B/L, carrier"/></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Party / Agent</th><th>Route</th><th>Carrier</th><th>ETD</th><th>Controls</th><th>Documents</th><th>Status</th></tr></thead><tbody>{visible.map(b=><tr key={b.id}><td><b>{b.bookingNo}</b><div className="sub">{b.bookingChannel}</div></td><td>{b.producingAgent?.name||b.customer?.name||'-'}</td><td>{b.origin} → {b.destination}</td><td>{b.carrier||'-'}<div className="sub">{b.vesselVoyage||''}</div></td><td>{fmtDate(b.etd)}</td><td><div className="sub">Credit {b.creditStatus||'-'} · Slot {b.slotStatus||'-'} · Equipment {b.equipmentStatus||'-'}</div></td><td>{b.documents?.length||0}</td><td><span className="status">{b.status}</span></td></tr>)}{visible.length===0&&<tr><td colSpan={8}>No NVOCC bookings found.</td></tr>}</tbody></table></div>
    </div>

    <div className="card">
      <h3 style={{marginTop:0}}>All NVOCC Documents</h3><div className="sub" style={{marginBottom:10}}>Full NVOCC document visibility for authorized Agent, Branch Office and Global Admin users.</div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Document No.</th><th>Type</th><th>Version</th><th>Release Control</th><th>Status</th><th>Updated</th></tr></thead><tbody>{docs.map(d=><tr key={d.id}><td><b>{d.booking?.bookingNo||'-'}</b><div className="sub">{d.booking?.origin||''} → {d.booking?.destination||''}</div></td><td>{d.documentNo||'-'}</td><td>{d.type}</td><td>{d.version||1}</td><td>{d.releaseControl||'-'}</td><td><span className="status">{d.status}</span></td><td>{fmtDate(d.updatedAt)}</td></tr>)}{docs.length===0&&<tr><td colSpan={7}>No NVOCC documents found.</td></tr>}</tbody></table></div>
    </div>
  </main>;
}
