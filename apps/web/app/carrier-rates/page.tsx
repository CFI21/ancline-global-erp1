'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Provider={providerCode:string;name:string;carrier?:string;carrierOrgId?:string|null;authMode:string;endpoint?:string|null;rateBasis?:string;buyIncludesSurcharges?:boolean;defaultPricingMethod?:string;defaultPricingValue?:number;minimumMarkupPct?:number;paymentTermsDays?:number;paymentMethod?:string;prepaidPct?:number;creditLimit?:number|null;creditCurrency?:string;active?:boolean;secretConfigured?:boolean;connectionReady?:boolean};
type Offer={offerId:string;source:string;providerCode:string;carrier:string;serviceName?:string|null;vessel?:string|null;voyage?:string|null;equipment:string;quantity:number;etd?:string|null;eta?:string|null;baseBuyRate?:number;surchargeTotal?:number;allInBuyRate?:number;buyRate:number;currency:string;validTo?:string|null;externalQuoteRef?:string|null;freeTimeOrigin?:number|null;freeTimeDestination?:number|null;costLines?:any[]};
type Carrier={id:string;code:string;name:string};
type Context={booking:any;providers:Provider[];offers:Offer[];carriers:Carrier[];selection?:any;lastSearch?:any};

const blankProvider=()=>({providerCode:'',name:'',carrier:'',carrierOrgId:'',authMode:'BASIC',username:'',secretEnv:'',apiKeyHeader:'x-api-key',endpoint:'',rateBasis:'PER_UNIT',buyIncludesSurcharges:false,defaultPricingMethod:'MARKUP_PCT',defaultPricingValue:'15',minimumMarkupPct:'0',paymentTermsDays:'30',paymentMethod:'BANK_TRANSFER',prepaidPct:'0',creditLimit:'',creditCurrency:'USD',responseArrayPath:'',buyRatePath:'',currencyPath:'',surchargesPath:'',surchargeChargeCodePath:'',surchargeAmountPath:'',externalQuoteRefPath:'',notes:''});

export default function CarrierRatesPage(){
  const [token,setToken]=useState(''),[bookingId,setBookingId]=useState(''),[ctx,setCtx]=useState<Context|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [pricingMethod,setPricingMethod]=useState('MARKUP_PCT'),[pricingValue,setPricingValue]=useState('15'),[provider,setProvider]=useState<any>(blankProvider());

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);const id=new URLSearchParams(window.location.search).get('bookingId')||'';setBookingId(id);if(id)void load(id,t);},[]);

  async function load(id=bookingId,t=token){
    if(!id)return;
    try{
      const data=await api('/rate-procurement/booking/'+id,t);
      setCtx(data);
      if(data?.providers?.length&&pricingValue==='15'){setPricingMethod(data.providers[0]?.defaultPricingMethod||'MARKUP_PCT');setPricingValue(String(data.providers[0]?.defaultPricingValue??15));}
    }catch(e:any){setMessage(e?.message||'Unable to load carrier rate procurement');}
  }

  async function searchRates(){
    if(!bookingId)return;setBusy(true);setMessage('');
    try{
      const result=await api('/rate-procurement/booking/'+bookingId+'/search',token,{method:'POST'});
      const errors=(result?.providerErrors||[]).map((x:any)=>(x.name||x.providerCode)+': '+x.error).join(' | ');
      setMessage(String(result?.offers?.length||0)+' normalized carrier/contract offer(s) received.'+(errors?' Provider warnings: '+errors:''));
      await load();
    }catch(e:any){setMessage(e?.message||'Carrier rate search failed');}
    finally{setBusy(false);}
  }

  function estimatedSell(buy:number){
    const v=Number(pricingValue||0);
    if(pricingMethod==='GROSS_MARGIN_PCT'&&v<100)return buy/(1-v/100);
    if(pricingMethod==='FIXED_AMOUNT')return buy+v;
    return buy*(1+v/100);
  }

  async function selectOffer(offer:Offer){
    setBusy(true);setMessage('');
    try{
      const result=await api('/rate-procurement/booking/'+bookingId+'/select/'+offer.offerId,token,{method:'POST',body:JSON.stringify({pricingMethod,pricingValue:Number(pricingValue||0)})});
      setMessage('Selected '+offer.carrier+'. All-in buy '+fmtMoney(result.quote.buyRate,result.quote.currency)+' → sell '+fmtMoney(result.quote.sellRate,result.quote.currency)+'. '+String(result.costLines?.length||1)+' carrier cost line(s) retained for finance. Quote '+result.quote.quoteNo+' linked to booking.');
      await load();
    }catch(e:any){setMessage(e?.message||'Could not apply carrier rate');}
    finally{setBusy(false);}
  }

  async function saveProvider(){
    if(!provider.providerCode.trim()||!provider.name.trim()){setMessage('Provider code and name are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/rate-procurement/providers',token,{method:'POST',body:JSON.stringify({...provider,providerCode:provider.providerCode.trim().toUpperCase(),defaultPricingValue:Number(provider.defaultPricingValue||0),minimumMarkupPct:Number(provider.minimumMarkupPct||0),paymentTermsDays:Number(provider.paymentTermsDays||0),prepaidPct:Number(provider.prepaidPct||0),creditLimit:provider.creditLimit===''?null:Number(provider.creditLimit)})});
      setMessage(provider.name+' carrier rate account and commercial terms saved.');
      setProvider(blankProvider());
      await load();
    }catch(e:any){setMessage(e?.message||'Could not save provider profile');}
    finally{setBusy(false);}
  }

  const offers=useMemo(()=>ctx?.offers||[],[ctx]),booking=ctx?.booking,selectedQuote=booking?.rateQuote,selection=ctx?.selection,lastSearch=ctx?.lastSearch;

  return <WorkspaceShell title="Forwarding Global Carrier Rates" subtitle="FORWARDING ONLY · global carrier procurement, controlled sell pricing and payment/security terms" active="/carrier-rates" actions={<>{bookingId&&<a className="btn" href={'/bookings/'+bookingId} style={{textDecoration:'none'}}>Back to Booking</a>}<button className="btn" disabled={busy||!bookingId} onClick={searchRates}>{busy?'Working...':'Fetch Carrier Rates'}</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {!bookingId&&<div className="card">Open this workspace from a FORWARDING booking. NVOCC pricing and space control are maintained separately.</div>}
    {booking&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Booking rate request</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
          <div><div className="sub">Booking</div><b>{booking.bookingNo}</b><div className="sub">{booking.customer?.name||'-'}</div></div>
          <div><div className="sub">Lane</div><b>{booking.portOfLoading||booking.origin} → {booking.portOfDischarge||booking.destination}</b></div>
          <div><div className="sub">Equipment</div><b>{booking.quantity||1} × {booking.equipment||'-'}</b></div>
          <div><div className="sub">Requested ETD</div><b>{fmtDate(booking.etd)}</b></div>
          <div><div className="sub">Workflow</div><span className="status">{booking.status}</span></div>
          <div><div className="sub">Last rate search</div><b>{lastSearch?.searchedAt?fmtDate(lastSearch.searchedAt):'—'}</b><div className="sub">{lastSearch?String(lastSearch.totalOffers||0)+' offers / '+String(lastSearch.providerErrors?.length||0)+' warnings':''}</div></div>
        </div>
        {selectedQuote&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #e2e8ee'}}>
          <b>Linked quote {selectedQuote.quoteNo}</b> — Buy {fmtMoney(selectedQuote.buyRate,selectedQuote.currency)} / Sell {fmtMoney(selectedQuote.sellRate,selectedQuote.currency)} — <span className="status">{selectedQuote.status}</span>
          {selection&&<div className="sub" style={{marginTop:5}}>Carrier {selection.carrier||'-'} · {selection.pricingMethod} {selection.pricingValue} · markup {Number(selection.markupPct||0).toFixed(1)}% · payment {selection.commercialTerms?.paymentTermsDays??30} days / {selection.commercialTerms?.paymentMethod||'BANK_TRANSFER'}</div>}
        </div>}
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'end',flexWrap:'wrap'}}>
          <div><h3 style={{...sectionTitle,marginBottom:4}}>Carrier offer comparison</h3><div className="sub">Base freight and carrier surcharges are normalized into the all-in internal buy rate before the selling price is calculated.</div></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <label style={{minWidth:190}}><span style={labelStyle}>Pricing method</span><select style={fieldStyle} value={pricingMethod} onChange={e=>setPricingMethod(e.target.value)}><option value="MARKUP_PCT">Markup % on buy</option><option value="GROSS_MARGIN_PCT">Gross margin % on sell</option><option value="FIXED_AMOUNT">Fixed amount per unit</option></select></label>
            <label style={{minWidth:150}}><span style={labelStyle}>Pricing value</span><input type="number" min="0" value={pricingValue} onChange={e=>setPricingValue(e.target.value)} style={fieldStyle}/></label>
          </div>
        </div>
        <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Source / Carrier</th><th>Service</th><th>Equipment</th><th>Base Buy</th><th>Surcharges</th><th>All-in Buy</th><th>Booking Buy</th><th>Est. Sell / Unit</th><th>Free Time</th><th>Validity / Ref.</th><th></th></tr></thead>
          <tbody>{offers.length===0?<tr><td colSpan={11}>No offers yet. Fetch rates to search filed contracts and configured carrier accounts.</td></tr>:offers.map(o=>{
            const allIn=Number((o.allInBuyRate??o.buyRate)||0),sell=estimatedSell(allIn);
            return <tr key={o.offerId}>
              <td><b>{o.carrier}</b><div className="sub">{o.source} · {o.providerCode}</div></td>
              <td>{o.serviceName||'-'}<div className="sub">{[o.vessel,o.voyage].filter(Boolean).join(' / ')||'-'}</div></td>
              <td>{o.quantity||1} × {o.equipment}</td>
              <td>{fmtMoney(o.baseBuyRate??allIn,o.currency)}</td>
              <td>{fmtMoney(o.surchargeTotal||0,o.currency)}<div className="sub">{o.costLines?.length||1} cost lines</div></td>
              <td><b>{fmtMoney(allIn,o.currency)}</b><div className="sub">per unit</div></td>
              <td><b>{fmtMoney(allIn*(o.quantity||1),o.currency)}</b></td>
              <td><b>{fmtMoney(sell,o.currency)}</b><div className="sub">{pricingMethod}</div></td>
              <td>ORG {o.freeTimeOrigin??'-'}d<div className="sub">DST {o.freeTimeDestination??'-'}d</div></td>
              <td>{fmtDate(o.validTo||undefined)}<div className="sub">{o.externalQuoteRef||'No external ref'}</div></td>
              <td><button className="btn" disabled={busy} onClick={()=>selectOffer(o)}>Use Rate</button></td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <h3 style={sectionTitle}>Configured carrier rate accounts</h3>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Provider</th><th>Connection</th><th>Rate Basis</th><th>Pricing Control</th><th>Payment Terms</th><th>Credit</th><th>Status</th></tr></thead>
          <tbody>{!ctx?.providers?.length?<tr><td colSpan={7}>No online carrier accounts configured yet. Filed service-contract rates are still searched.</td></tr>:ctx.providers.map(p=><tr key={p.providerCode}>
            <td><b>{p.name}</b><div className="sub">{p.providerCode} · {p.authMode}</div></td>
            <td>{p.endpoint?'ENDPOINT SET':'NO ENDPOINT'}<div className="sub">{p.authMode==='NONE'?'No secret required':p.secretConfigured?'Secret configured':'Secret missing'}</div></td>
            <td>{p.rateBasis||'PER_UNIT'}<div className="sub">{p.buyIncludesSurcharges?'Buy includes surcharges':'Add surcharges'}</div></td>
            <td>{p.defaultPricingMethod||'MARKUP_PCT'} {Number(p.defaultPricingValue||0).toFixed(1)}<div className="sub">Min markup {Number(p.minimumMarkupPct||0).toFixed(1)}%</div></td>
            <td>{p.paymentTermsDays??30} days<div className="sub">{p.paymentMethod||'BANK_TRANSFER'} · prepaid {Number(p.prepaidPct||0).toFixed(0)}%</div></td>
            <td>{p.creditLimit==null?'—':fmtMoney(p.creditLimit,p.creditCurrency||'USD')}</td>
            <td><span className="status">{p.active===false?'INACTIVE':p.connectionReady?'READY':'CONFIG CHECK'}</span></td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h3 style={sectionTitle}>Add / update carrier online-rate account</h3>
        <div className="sub" style={{marginBottom:12}}>Passwords and API tokens are never stored here. Enter only the secure environment-variable name; the actual secret remains in the deployment secret store.</div>
        <div style={formGrid}>
          <label><span style={labelStyle}>Provider Code *</span><input style={fieldStyle} value={provider.providerCode} onChange={e=>setProvider({...provider,providerCode:e.target.value})} placeholder="MAERSK"/></label>
          <label><span style={labelStyle}>Provider Name *</span><input style={fieldStyle} value={provider.name} onChange={e=>setProvider({...provider,name:e.target.value})} placeholder="Maersk"/></label>
          <label><span style={labelStyle}>Carrier Organization</span><select style={fieldStyle} value={provider.carrierOrgId} onChange={e=>setProvider({...provider,carrierOrgId:e.target.value})}><option value="">Not linked</option>{(ctx?.carriers||[]).map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
          <label><span style={labelStyle}>Carrier Display Name</span><input style={fieldStyle} value={provider.carrier} onChange={e=>setProvider({...provider,carrier:e.target.value})}/></label>
          <label><span style={labelStyle}>Authentication</span><select style={fieldStyle} value={provider.authMode} onChange={e=>setProvider({...provider,authMode:e.target.value})}><option>BASIC</option><option>BEARER</option><option>API_KEY</option><option>NONE</option></select></label>
          <label><span style={labelStyle}>Carrier Username</span><input style={fieldStyle} value={provider.username} onChange={e=>setProvider({...provider,username:e.target.value})}/></label>
          <label><span style={labelStyle}>Secret Environment Key</span><input style={fieldStyle} value={provider.secretEnv} onChange={e=>setProvider({...provider,secretEnv:e.target.value})} placeholder="MAERSK_RATE_PASSWORD"/></label>
          <label><span style={labelStyle}>HTTPS Rate Endpoint</span><input style={fieldStyle} value={provider.endpoint} onChange={e=>setProvider({...provider,endpoint:e.target.value})} placeholder="https://carrier-api.example/rates"/></label>
          <label><span style={labelStyle}>Rate Basis</span><select style={fieldStyle} value={provider.rateBasis} onChange={e=>setProvider({...provider,rateBasis:e.target.value})}><option value="PER_UNIT">Per container / unit</option><option value="TOTAL_BOOKING">Total booking amount</option></select></label>
          <label><span style={labelStyle}>Default Pricing</span><select style={fieldStyle} value={provider.defaultPricingMethod} onChange={e=>setProvider({...provider,defaultPricingMethod:e.target.value})}><option value="MARKUP_PCT">Markup %</option><option value="GROSS_MARGIN_PCT">Gross margin %</option><option value="FIXED_AMOUNT">Fixed amount</option></select></label>
          <label><span style={labelStyle}>Default Pricing Value</span><input type="number" style={fieldStyle} value={provider.defaultPricingValue} onChange={e=>setProvider({...provider,defaultPricingValue:e.target.value})}/></label>
          <label><span style={labelStyle}>Minimum Markup %</span><input type="number" style={fieldStyle} value={provider.minimumMarkupPct} onChange={e=>setProvider({...provider,minimumMarkupPct:e.target.value})}/></label>
          <label><span style={labelStyle}>Payment Terms Days</span><input type="number" style={fieldStyle} value={provider.paymentTermsDays} onChange={e=>setProvider({...provider,paymentTermsDays:e.target.value})}/></label>
          <label><span style={labelStyle}>Payment Method</span><input style={fieldStyle} value={provider.paymentMethod} onChange={e=>setProvider({...provider,paymentMethod:e.target.value})}/></label>
          <label><span style={labelStyle}>Prepaid %</span><input type="number" style={fieldStyle} value={provider.prepaidPct} onChange={e=>setProvider({...provider,prepaidPct:e.target.value})}/></label>
          <label><span style={labelStyle}>Carrier Credit Limit</span><input type="number" style={fieldStyle} value={provider.creditLimit} onChange={e=>setProvider({...provider,creditLimit:e.target.value})}/></label>
          <label><span style={labelStyle}>Credit Currency</span><input style={fieldStyle} value={provider.creditCurrency} onChange={e=>setProvider({...provider,creditCurrency:e.target.value.toUpperCase()})}/></label>
          <label><span style={labelStyle}>Response Array Path</span><input style={fieldStyle} value={provider.responseArrayPath} onChange={e=>setProvider({...provider,responseArrayPath:e.target.value})} placeholder="data.rates"/></label>
          <label><span style={labelStyle}>Buy Rate Path</span><input style={fieldStyle} value={provider.buyRatePath} onChange={e=>setProvider({...provider,buyRatePath:e.target.value})} placeholder="price.amount"/></label>
          <label><span style={labelStyle}>Currency Path</span><input style={fieldStyle} value={provider.currencyPath} onChange={e=>setProvider({...provider,currencyPath:e.target.value})} placeholder="price.currency"/></label>
          <label><span style={labelStyle}>Surcharges Array Path</span><input style={fieldStyle} value={provider.surchargesPath} onChange={e=>setProvider({...provider,surchargesPath:e.target.value})} placeholder="charges"/></label>
          <label><span style={labelStyle}>Surcharge Code Path</span><input style={fieldStyle} value={provider.surchargeChargeCodePath} onChange={e=>setProvider({...provider,surchargeChargeCodePath:e.target.value})} placeholder="code"/></label>
          <label><span style={labelStyle}>Surcharge Amount Path</span><input style={fieldStyle} value={provider.surchargeAmountPath} onChange={e=>setProvider({...provider,surchargeAmountPath:e.target.value})} placeholder="amount"/></label>
          <label><span style={labelStyle}>External Quote Ref Path</span><input style={fieldStyle} value={provider.externalQuoteRefPath} onChange={e=>setProvider({...provider,externalQuoteRefPath:e.target.value})} placeholder="quoteId"/></label>
          <label><span style={labelStyle}>Buy Includes Surcharges</span><input type="checkbox" checked={provider.buyIncludesSurcharges} onChange={e=>setProvider({...provider,buyIncludesSurcharges:e.target.checked})}/></label>
          <label><span style={labelStyle}>Notes</span><input style={fieldStyle} value={provider.notes} onChange={e=>setProvider({...provider,notes:e.target.value})}/></label>
        </div>
        <div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy} onClick={saveProvider}>Save Carrier Account & Terms</button></div>
      </div>
    </>}
  </WorkspaceShell>;
}
