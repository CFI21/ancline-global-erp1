'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Provider={providerCode:string;name:string;carrier?:string;authMode:string;username?:string|null;secretEnv?:string|null;endpoint?:string|null;defaultMarginPct?:number;active?:boolean};
type Offer={offerId:string;bookingId:string;source:string;providerCode:string;carrier:string;serviceName?:string|null;vessel?:string|null;voyage?:string|null;origin:string;destination:string;equipment:string;quantity:number;etd?:string|null;eta?:string|null;buyRate:number;currency:string;validTo?:string|null;externalQuoteRef?:string|null;freeTimeOrigin?:number|null;freeTimeDestination?:number|null;surcharges?:any[]};
type Booking={id:string;bookingNo:string;status:string;origin:string;destination:string;portOfLoading?:string|null;portOfDischarge?:string|null;equipment?:string|null;quantity?:number|null;commodity?:string|null;specialCargo?:string|null;etd?:string|null;currency:string;carrier?:string|null;rateQuote?:{quoteNo:string;buyRate:any;sellRate:any;currency:string;status:string}|null;customer?:{name:string}};
type Context={booking:Booking;providers:Provider[];offers:Offer[]};

export default function CarrierRatesPage(){
  const [token,setToken]=useState('');
  const [bookingId,setBookingId]=useState('');
  const [ctx,setCtx]=useState<Context|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [marginPct,setMarginPct]=useState('15');
  const [provider,setProvider]=useState({providerCode:'',name:'',carrier:'',authMode:'BASIC',username:'',secretEnv:'',apiKeyHeader:'x-api-key',endpoint:'',defaultMarginPct:'15',notes:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);const id=new URLSearchParams(window.location.search).get('bookingId')||'';setBookingId(id);if(id)void load(id,t);},[]);

  async function load(id=bookingId,t=token){
    if(!id)return;
    try{const data=await api(`/rate-procurement/booking/${id}`,t);setCtx(data);if(data?.providers?.length&&marginPct==='15')setMarginPct(String(data.providers[0]?.defaultMarginPct??15));}
    catch(e:any){setMessage(e?.message||'Unable to load carrier rate procurement');}
  }

  async function searchRates(){
    if(!bookingId)return;
    setBusy(true);setMessage('');
    try{
      const result=await api(`/rate-procurement/booking/${bookingId}/search`,token,{method:'POST'});
      const errors=(result?.providerErrors||[]).map((x:any)=>`${x.name||x.providerCode}: ${x.error}`).join(' | ');
      setMessage(`${result?.offers?.length||0} carrier/contract buy offer(s) received.${errors?' Provider warnings: '+errors:''}`);
      await load();
    }catch(e:any){setMessage(e?.message||'Carrier rate search failed');}
    finally{setBusy(false);}
  }

  async function selectOffer(offer:Offer){
    setBusy(true);setMessage('');
    try{
      const result=await api(`/rate-procurement/booking/${bookingId}/select/${offer.offerId}`,token,{method:'POST',body:JSON.stringify({marginPct:Number(marginPct||0)})});
      setMessage(`Selected ${offer.carrier}. Buy ${fmtMoney(result.quote.buyRate,result.quote.currency)} → Sell ${fmtMoney(result.quote.sellRate,result.quote.currency)}. Quote ${result.quote.quoteNo} linked to booking.`);
      await load();
    }catch(e:any){setMessage(e?.message||'Could not apply carrier rate');}
    finally{setBusy(false);}
  }

  async function saveProvider(){
    if(!provider.providerCode.trim()||!provider.name.trim()){setMessage('Provider code and name are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/rate-procurement/providers',token,{method:'POST',body:JSON.stringify({...provider,providerCode:provider.providerCode.trim().toUpperCase(),defaultMarginPct:Number(provider.defaultMarginPct||0)})});
      setMessage(`${provider.name} carrier rate account profile saved.`);
      setProvider({providerCode:'',name:'',carrier:'',authMode:'BASIC',username:'',secretEnv:'',apiKeyHeader:'x-api-key',endpoint:'',defaultMarginPct:'15',notes:''});
      await load();
    }catch(e:any){setMessage(e?.message||'Could not save provider profile');}
    finally{setBusy(false);}
  }

  const offers=useMemo(()=>ctx?.offers||[],[ctx]);
  const booking=ctx?.booking;
  const selectedQuote=booking?.rateQuote;

  return <WorkspaceShell
    title="Carrier Buy Rates"
    subtitle="Contract filing + authenticated online carrier rate shopping → controlled customer selling rate"
    active="/rates"
    actions={<>{bookingId&&<a className="btn" href={`/bookings/${bookingId}`} style={{textDecoration:'none'}}>Back to Booking</a>}<button className="btn" disabled={busy||!bookingId} onClick={searchRates}>{busy?'Working...':'Fetch Carrier Rates'}</button></>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {!bookingId&&<div className="card">Open this workspace from a booking so ANCLINE can use the booking lane, equipment, dates and cargo details.</div>}
    {booking&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Booking rate request</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
          <div><div className="sub">Booking</div><b>{booking.bookingNo}</b><div className="sub">{booking.customer?.name||'-'}</div></div>
          <div><div className="sub">Lane</div><b>{booking.portOfLoading||booking.origin} → {booking.portOfDischarge||booking.destination}</b></div>
          <div><div className="sub">Equipment</div><b>{booking.quantity||1} × {booking.equipment||'-'}</b></div>
          <div><div className="sub">Requested ETD</div><b>{fmtDate(booking.etd)}</b></div>
          <div><div className="sub">Cargo</div><b>{booking.commodity||'General Cargo'}</b><div className="sub">{booking.specialCargo||'Standard'}</div></div>
          <div><div className="sub">Workflow</div><span className="status">{booking.status}</span></div>
        </div>
        {selectedQuote&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #e2e8ee'}}><b>Linked quote {selectedQuote.quoteNo}</b> — Buy {fmtMoney(selectedQuote.buyRate,selectedQuote.currency)} / Sell {fmtMoney(selectedQuote.sellRate,selectedQuote.currency)} — <span className="status">{selectedQuote.status}</span></div>}
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'end',flexWrap:'wrap'}}>
          <div><h3 style={{...sectionTitle,marginBottom:4}}>Carrier offer comparison</h3><div className="sub">Buy rates remain internal. Margin is applied only when an offer is selected for the customer quote.</div></div>
          <label style={{minWidth:180}}><span style={labelStyle}>Selling margin %</span><input type="number" min="0" max="500" value={marginPct} onChange={e=>setMarginPct(e.target.value)} style={fieldStyle}/></label>
        </div>
        <div style={{overflowX:'auto',marginTop:12}}>
          <table className="table"><thead><tr><th>Source / Carrier</th><th>Service</th><th>Schedule</th><th>Equipment</th><th>Buy</th><th>Est. Sell</th><th>Free Time</th><th>Validity / Ref.</th><th></th></tr></thead>
          <tbody>{offers.length===0?<tr><td colSpan={9}>No rate offers yet. Click Fetch Carrier Rates to search filed contracts and configured online carrier accounts.</td></tr>:offers.map(o=>{
            const sell=Number(o.buyRate||0)*(1+Number(marginPct||0)/100);
            return <tr key={o.offerId}>
              <td><b>{o.carrier}</b><div className="sub">{o.source} · {o.providerCode}</div></td>
              <td>{o.serviceName||'-'}<div className="sub">{[o.vessel,o.voyage].filter(Boolean).join(' / ')||'-'}</div></td>
              <td>ETD {fmtDate(o.etd||undefined)}<div className="sub">ETA {fmtDate(o.eta||undefined)}</div></td>
              <td>{o.quantity||1} × {o.equipment}</td>
              <td><b>{fmtMoney(o.buyRate,o.currency)}</b><div className="sub">per unit</div></td>
              <td><b>{fmtMoney(sell,o.currency)}</b><div className="sub">{marginPct||0}% margin</div></td>
              <td>ORG {o.freeTimeOrigin??'-'}d<div className="sub">DST {o.freeTimeDestination??'-'}d</div></td>
              <td>{fmtDate(o.validTo||undefined)}<div className="sub">{o.externalQuoteRef||'No external ref'}</div></td>
              <td><button className="btn" disabled={busy} onClick={()=>selectOffer(o)}>Use Rate</button></td>
            </tr>;
          })}</tbody></table>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Configured carrier rate accounts</h3>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Provider</th><th>Auth</th><th>Username</th><th>Endpoint</th><th>Default Margin</th><th>Status</th></tr></thead><tbody>{!ctx?.providers?.length?<tr><td colSpan={6}>No online carrier accounts configured yet. Filed service-contract rates are still searched.</td></tr>:ctx.providers.map(p=><tr key={p.providerCode}><td><b>{p.name}</b><div className="sub">{p.providerCode}</div></td><td>{p.authMode}<div className="sub">{p.secretEnv||'No secret'}</div></td><td>{p.username||'-'}</td><td style={{maxWidth:300,whiteSpace:'normal'}}>{p.endpoint||'Contract/manual only'}</td><td>{Number(p.defaultMarginPct||0).toFixed(1)}%</td><td><span className="status">{p.active===false?'INACTIVE':'ACTIVE'}</span></td></tr>)}</tbody></table></div>
      </div>

      <div className="card">
        <h3 style={sectionTitle}>Add / update carrier online-rate account</h3>
        <div className="sub" style={{marginBottom:12}}>ANCLINE stores the carrier username and a secret reference. The password/API token itself must remain in the secure deployment secret store and is never written to GitHub or the ANCLINE database.</div>
        <div style={formGrid}>
          <label><span style={labelStyle}>Provider Code *</span><input style={fieldStyle} value={provider.providerCode} onChange={e=>setProvider({...provider,providerCode:e.target.value})} placeholder="MAERSK"/></label>
          <label><span style={labelStyle}>Provider Name *</span><input style={fieldStyle} value={provider.name} onChange={e=>setProvider({...provider,name:e.target.value})} placeholder="Maersk"/></label>
          <label><span style={labelStyle}>Carrier Name</span><input style={fieldStyle} value={provider.carrier} onChange={e=>setProvider({...provider,carrier:e.target.value})} placeholder="Same as provider if blank"/></label>
          <label><span style={labelStyle}>Authentication</span><select style={fieldStyle} value={provider.authMode} onChange={e=>setProvider({...provider,authMode:e.target.value})}><option>BASIC</option><option>BEARER</option><option>API_KEY</option><option>NONE</option></select></label>
          <label><span style={labelStyle}>Carrier Username</span><input style={fieldStyle} value={provider.username} onChange={e=>setProvider({...provider,username:e.target.value})}/></label>
          <label><span style={labelStyle}>Secret Environment Key</span><input style={fieldStyle} value={provider.secretEnv} onChange={e=>setProvider({...provider,secretEnv:e.target.value})} placeholder="MAERSK_RATE_PASSWORD"/></label>
          {provider.authMode==='API_KEY'&&<label><span style={labelStyle}>API Key Header</span><input style={fieldStyle} value={provider.apiKeyHeader} onChange={e=>setProvider({...provider,apiKeyHeader:e.target.value})}/></label>}
          <label><span style={labelStyle}>HTTPS Rate Endpoint</span><input style={fieldStyle} value={provider.endpoint} onChange={e=>setProvider({...provider,endpoint:e.target.value})} placeholder="https://carrier-api.example/rates"/></label>
          <label><span style={labelStyle}>Default Selling Margin %</span><input type="number" style={fieldStyle} value={provider.defaultMarginPct} onChange={e=>setProvider({...provider,defaultMarginPct:e.target.value})}/></label>
          <label><span style={labelStyle}>Notes</span><input style={fieldStyle} value={provider.notes} onChange={e=>setProvider({...provider,notes:e.target.value})}/></label>
        </div>
        <div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy} onClick={saveProvider}>Save Carrier Account Profile</button></div>
      </div>
    </>}
  </WorkspaceShell>;
}
