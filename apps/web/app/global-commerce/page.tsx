'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

type Country={countryCode:string;countryName:string;serviceEnabled:boolean;customerRegistrationEnabled:boolean;forwardingEnabled:boolean;nvoccEnabled:boolean;customsEnabled:boolean;haulageEnabled:boolean;carrierPayerAllowed:boolean;localCurrency:string;timezone:string;defaultLanguage:string;supportedLanguages:string[];customerPaymentMethods:string[];taxRegime:string;eInvoiceMode:string;dataRegion:string;active:boolean};
type Office={officeId:string;officeCode:string;officeName:string;legalEntityName:string;countryCode:string;address:string;city:string;postalCode?:string;timezone:string;currency:string;registrationNo?:string;taxRegistrationNo?:string;registeredOffice:boolean;carrierPayerEligible:boolean;customerBillingEnabled:boolean;forwardingEnabled:boolean;nvoccEnabled:boolean;active:boolean};
type Location={locationCode:string;name:string;type:string;countryCode:string;unLocode?:string;timezone:string;portCode?:string;terminalCode?:string;active:boolean};

const countryBlank={countryCode:'',countryName:'',serviceEnabled:true,customerRegistrationEnabled:true,forwardingEnabled:true,nvoccEnabled:false,customsEnabled:false,haulageEnabled:false,carrierPayerAllowed:false,localCurrency:'EUR',timezone:'Europe/Amsterdam',defaultLanguage:'en',supportedLanguages:'en',customerPaymentMethods:'BANK_TRANSFER',taxRegime:'CONFIG_REQUIRED',eInvoiceMode:'CONFIG_REQUIRED',dataRegion:'EU',active:true};
const officeBlank={officeCode:'',officeName:'',legalEntityName:'',countryCode:'',address:'',city:'',postalCode:'',timezone:'',currency:'',registrationNo:'',taxRegistrationNo:'',registeredOffice:true,carrierPayerEligible:false,customerBillingEnabled:true,forwardingEnabled:true,nvoccEnabled:false,active:true};
const locationBlank={locationCode:'',name:'',type:'PORT',countryCode:'',unLocode:'',timezone:'',portCode:'',terminalCode:'',active:true};

export default function GlobalCommercePage(){
  const [token,setToken]=useState(''),[tab,setTab]=useState<'demo'|'countries'|'offices'|'locations'>('demo');
  const [countries,setCountries]=useState<Country[]>([]),[offices,setOffices]=useState<Office[]>([]),[locations,setLocations]=useState<Location[]>([]);
  const [readiness,setReadiness]=useState<any>(null),[demo,setDemo]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [country,setCountry]=useState<any>({...countryBlank}),[office,setOffice]=useState<any>({...officeBlank}),[location,setLocation]=useState<any>({...locationBlank});
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const [r,c,o,l,d]=await Promise.all([
        api('/global-commerce/readiness',t),api('/global-commerce/countries',t),api('/global-commerce/offices',t),api('/global-commerce/locations',t),api('/global-commerce/demo',t)
      ]);
      setReadiness(r);setCountries(Array.isArray(c)?c:[]);setOffices(Array.isArray(o)?o:[]);setLocations(Array.isArray(l)?l:[]);setDemo(d);
    }catch(e:any){setMessage(e.message||'Unable to load Global Commerce Master.');}finally{setBusy(false);}
  }
  async function saveCountry(){
    if(!country.countryCode){setMessage('Country code is required.');return;}setBusy(true);setMessage('');
    try{await api('/global-commerce/countries/'+country.countryCode.toUpperCase(),token,{method:'POST',body:JSON.stringify({...country,supportedLanguages:String(country.supportedLanguages).split(',').map((x:string)=>x.trim()).filter(Boolean),customerPaymentMethods:String(country.customerPaymentMethods).split(',').map((x:string)=>x.trim().toUpperCase()).filter(Boolean)})});setCountry({...countryBlank});setMessage('Country operating profile saved.');await load();setTab('countries');}catch(e:any){setMessage(e.message||'Country could not be saved.');}finally{setBusy(false);}
  }
  async function saveOffice(){
    setBusy(true);setMessage('');try{await api('/global-commerce/offices',token,{method:'POST',body:JSON.stringify(office)});setOffice({...officeBlank});setMessage('ANC office profile saved.');await load();setTab('offices');}catch(e:any){setMessage(e.message||'Office could not be saved.');}finally{setBusy(false);}
  }
  async function saveLocation(){
    setBusy(true);setMessage('');try{await api('/global-commerce/locations',token,{method:'POST',body:JSON.stringify(location)});setLocation({...locationBlank});setMessage('Controlled location saved.');await load();setTab('locations');}catch(e:any){setMessage(e.message||'Location could not be saved.');}finally{setBusy(false);}
  }
  const bool=(label:string,value:boolean,set:(v:boolean)=>void)=><label style={{display:'flex',gap:7,alignItems:'center',fontSize:12,fontWeight:700,color:'#4c6072'}}><input type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/>{label}</label>;
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10};
  const card:React.CSSProperties={padding:12,border:'1px solid #dce5ec',borderRadius:8,background:'#fff'};

  return <WorkspaceShell title="Global Commerce Master / Demo" subtitle="Worldwide e-commerce operating rules · ANC offices · controlled locations · synthetic customer journey" active="/global-commerce" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">GLOBAL COMMERCE READINESS</div><div className="kpi">{readiness?.ready?'READY':'CONFIGURE'}</div><div className="sub">{readiness?.blockers?.length?readiness.blockers.join(' · '):'Worldwide e-commerce controls ready'}</div></div>
      <div className="card"><div className="sub">SERVICE COUNTRIES</div><div className="kpi">{readiness?.summary?.countries||0}</div></div>
      <div className="card"><div className="sub">REGISTERED ANC OFFICES</div><div className="kpi">{readiness?.summary?.registeredOffices||0}</div></div>
      <div className="card"><div className="sub">CARRIER PAYER OFFICES</div><div className="kpi">{readiness?.summary?.carrierPayerOffices||0}</div></div>
      <div className="card"><div className="sub">CONTROLLED LOCATIONS</div><div className="kpi">{readiness?.summary?.locations||0}</div></div>
    </div>

    {readiness?.infrastructure&&<div className="card" style={{marginBottom:12}}>
      <div className="sub">INFRASTRUCTURE READINESS</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:8}}>
        {Object.entries(readiness.infrastructure).map(([key,value]:any)=><div key={key} style={{padding:10,border:'1px solid #dce5ec',borderRadius:7}}>
          <b>{key.replaceAll('_',' ').toUpperCase()}</b>
          <div style={{marginTop:5}}><span className="status">{typeof value==='object'&&value?.ready?'READY':'NOT READY'}</span></div>
          {typeof value==='object'&&<div className="sub" style={{marginTop:5}}>{Object.entries(value).filter(([k])=>k!=='ready').map(([k,v])=>k+'='+String(v??'-')).join(' · ')}</div>}
        </div>)}
      </div>
    </div>}

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <button className="btn" disabled={tab==='demo'} onClick={()=>setTab('demo')}>E-commerce Demo</button>
      <button className="btn" disabled={tab==='countries'} onClick={()=>setTab('countries')}>Country Rules</button>
      <button className="btn" disabled={tab==='offices'} onClick={()=>setTab('offices')}>ANC Offices</button>
      <button className="btn" disabled={tab==='locations'} onClick={()=>setTab('locations')}>Locations / UN-LOCODE</button>
    </div>

    {tab==='demo'&&demo&&<>
      <div className="card" style={{marginBottom:12,border:'2px solid #b8c7d6'}}>
        <div className="sub">SYNTHETIC DEMO — NO REAL CUSTOMER / PAYMENT / CARRIER ACTION</div>
        <h2 style={{margin:'4px 0'}}>Netherlands → UAE Global Forwarding Example</h2>
        <div style={grid}>
          <div><div className="sub">CUSTOMER</div><b>{demo.scenario.customer}</b><div className="sub">{demo.scenario.ancCustomerRef}</div></div>
          <div><div className="sub">ROUTE</div><b>{demo.scenario.origin.code} → {demo.scenario.destination.code}</b><div className="sub">{demo.scenario.origin.name} → {demo.scenario.destination.name}</div></div>
          <div><div className="sub">EQUIPMENT</div><b>{demo.scenario.equipment}</b></div>
          <div><div className="sub">CARRIER BUY</div><b>{demo.scenario.carrierBuy.currency} {demo.scenario.carrierBuy.amount.toLocaleString()}</b></div>
          <div><div className="sub">ANC SELL</div><b>{demo.scenario.ancSell.currency} {demo.scenario.ancSell.amount.toLocaleString()}</b></div>
          <div><div className="sub">ANC MARGIN</div><b>{demo.scenario.margin.currency} {demo.scenario.margin.amount.toLocaleString()} · {demo.scenario.margin.pct}%</b></div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>Reference ownership</h3>
        <div style={grid}>
          <div style={card}><div className="sub">CUSTOMER REF</div><b>{demo.references.customer}</b></div>
          <div style={card}><div className="sub">ANC QUOTE</div><b>{demo.references.quote}</b></div>
          <div style={card}><div className="sub">ANC BOOKING</div><b>{demo.references.booking}</b></div>
          <div style={card}><div className="sub">CARRIER REFS</div><b>Internal only</b><div className="sub">{demo.references.carrierQuote} / {demo.references.carrierBooking}</div></div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>Money separation</h3>
        <div style={grid}>
          <div style={card}><div className="sub">CUSTOMER → ANC</div><b>{demo.scenario.customerPayment.mode} {demo.scenario.customerPayment.requiredPct}%</b><div>Required: {demo.scenario.customerPayment.currency} {demo.scenario.customerPayment.requiredAmount.toLocaleString()}</div><div className="sub">Driven by ANC customer credit/payment profile only.</div></div>
          <div style={card}><div className="sub">ANC → CARRIER</div><b>Separate payer control</b><div>Origin: {demo.scenario.ancCarrierPayment.originPort}</div><div>Sea: {demo.scenario.ancCarrierPayment.seaFreight}</div><div>Destination: {demo.scenario.ancCarrierPayment.destinationPort}</div><div className="sub">Only ANC registered payer offices are allowed.</div></div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>Privacy firewall</h3>
        <div style={grid}>{Object.entries(demo.privacy).map(([k,v])=><div style={card} key={k}><div className="sub">{k.replaceAll('_',' ').toUpperCase()}</div><b>{String(v)}</b></div>)}</div>
      </div>

      <div className="card">
        <h3 style={{marginTop:0}}>Zero-touch journey</h3>
        <div style={{display:'grid',gap:8}}>{demo.stages.map((s:any)=><div key={s.step} style={{...card,display:'grid',gridTemplateColumns:'60px minmax(180px,260px) 140px 1fr',gap:10,alignItems:'center'}}>
          <div style={{fontWeight:900,fontSize:20}}>#{s.step}</div><div><b>{s.title}</b><div className="sub">{s.code}</div></div><div><span className="status">{s.status}</span></div><div>{s.detail}</div>
        </div>)}</div>
      </div>
    </>}

    {tab==='countries'&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>Add / Update Country Operating Profile</h3>
        <div style={grid}>
          <label><span style={labelStyle}>ISO Country Code</span><input style={fieldStyle} maxLength={2} value={country.countryCode} onChange={e=>setCountry({...country,countryCode:e.target.value.toUpperCase()})} placeholder="NL"/></label>
          <label><span style={labelStyle}>Country Name</span><input style={fieldStyle} value={country.countryName} onChange={e=>setCountry({...country,countryName:e.target.value})}/></label>
          <label><span style={labelStyle}>Local Currency</span><input style={fieldStyle} value={country.localCurrency} onChange={e=>setCountry({...country,localCurrency:e.target.value.toUpperCase()})} placeholder="EUR"/></label>
          <label><span style={labelStyle}>IANA Timezone</span><input style={fieldStyle} value={country.timezone} onChange={e=>setCountry({...country,timezone:e.target.value})} placeholder="Europe/Amsterdam"/></label>
          <label><span style={labelStyle}>Default Language</span><input style={fieldStyle} value={country.defaultLanguage} onChange={e=>setCountry({...country,defaultLanguage:e.target.value})}/></label>
          <label><span style={labelStyle}>Languages CSV</span><input style={fieldStyle} value={country.supportedLanguages} onChange={e=>setCountry({...country,supportedLanguages:e.target.value})} placeholder="en,nl"/></label>
          <label><span style={labelStyle}>Customer Payment Methods CSV</span><input style={fieldStyle} value={country.customerPaymentMethods} onChange={e=>setCountry({...country,customerPaymentMethods:e.target.value})} placeholder="BANK_TRANSFER,CARD"/></label>
          <label><span style={labelStyle}>Tax Regime</span><input style={fieldStyle} value={country.taxRegime} onChange={e=>setCountry({...country,taxRegime:e.target.value.toUpperCase()})}/></label>
          <label><span style={labelStyle}>E-invoice Mode</span><input style={fieldStyle} value={country.eInvoiceMode} onChange={e=>setCountry({...country,eInvoiceMode:e.target.value.toUpperCase()})}/></label>
          <label><span style={labelStyle}>Data Region</span><input style={fieldStyle} value={country.dataRegion} onChange={e=>setCountry({...country,dataRegion:e.target.value.toUpperCase()})}/></label>
        </div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',margin:'12px 0'}}>{bool('Service Enabled',country.serviceEnabled,v=>setCountry({...country,serviceEnabled:v}))}{bool('Customer Registration',country.customerRegistrationEnabled,v=>setCountry({...country,customerRegistrationEnabled:v}))}{bool('Forwarding',country.forwardingEnabled,v=>setCountry({...country,forwardingEnabled:v}))}{bool('NVOCC',country.nvoccEnabled,v=>setCountry({...country,nvoccEnabled:v}))}{bool('Customs',country.customsEnabled,v=>setCountry({...country,customsEnabled:v}))}{bool('Haulage',country.haulageEnabled,v=>setCountry({...country,haulageEnabled:v}))}{bool('Carrier Payer Country',country.carrierPayerAllowed,v=>setCountry({...country,carrierPayerAllowed:v}))}</div>
        <div style={{textAlign:'right'}}><button className="btn" disabled={busy} onClick={saveCountry}>Save Country</button></div>
      </div>
      <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Country</th><th>Currency / Timezone</th><th>Forwarding</th><th>Carrier Payer</th><th>Tax / E-Invoice</th><th>Payments</th></tr></thead><tbody>{countries.map(c=><tr key={c.countryCode}><td><b>{c.countryCode}</b> · {c.countryName}</td><td>{c.localCurrency}<div className="sub">{c.timezone}</div></td><td>{String(c.forwardingEnabled)}</td><td>{String(c.carrierPayerAllowed)}</td><td>{c.taxRegime}<div className="sub">{c.eInvoiceMode}</div></td><td>{(c.customerPaymentMethods||[]).join(', ')||'-'}</td></tr>)}{!countries.length&&<tr><td colSpan={6}>No country profiles configured yet.</td></tr>}</tbody></table></div></div>
    </>}

    {tab==='offices'&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>Register ANC Office</h3>
        <div style={grid}>
          <label><span style={labelStyle}>Office Code</span><input style={fieldStyle} value={office.officeCode} onChange={e=>setOffice({...office,officeCode:e.target.value.toUpperCase()})} placeholder="ANC-NL-RTM"/></label>
          <label><span style={labelStyle}>Office Name</span><input style={fieldStyle} value={office.officeName} onChange={e=>setOffice({...office,officeName:e.target.value})}/></label>
          <label><span style={labelStyle}>Legal Entity Name</span><input style={fieldStyle} value={office.legalEntityName} onChange={e=>setOffice({...office,legalEntityName:e.target.value})}/></label>
          <label><span style={labelStyle}>Country</span><select style={fieldStyle} value={office.countryCode} onChange={e=>{const cc=e.target.value,ct=countries.find(x=>x.countryCode===cc);setOffice({...office,countryCode:cc,timezone:office.timezone||ct?.timezone||'',currency:office.currency||ct?.localCurrency||''});}}><option value="">Select</option>{countries.map(c=><option key={c.countryCode}>{c.countryCode}</option>)}</select></label>
          <label><span style={labelStyle}>Address</span><input style={fieldStyle} value={office.address} onChange={e=>setOffice({...office,address:e.target.value})}/></label>
          <label><span style={labelStyle}>City</span><input style={fieldStyle} value={office.city} onChange={e=>setOffice({...office,city:e.target.value})}/></label>
          <label><span style={labelStyle}>Postal Code</span><input style={fieldStyle} value={office.postalCode} onChange={e=>setOffice({...office,postalCode:e.target.value})}/></label>
          <label><span style={labelStyle}>Timezone</span><input style={fieldStyle} value={office.timezone} onChange={e=>setOffice({...office,timezone:e.target.value})}/></label>
          <label><span style={labelStyle}>Currency</span><input style={fieldStyle} value={office.currency} onChange={e=>setOffice({...office,currency:e.target.value.toUpperCase()})}/></label>
          <label><span style={labelStyle}>Company Registration</span><input style={fieldStyle} value={office.registrationNo} onChange={e=>setOffice({...office,registrationNo:e.target.value})}/></label>
          <label><span style={labelStyle}>Tax Registration</span><input style={fieldStyle} value={office.taxRegistrationNo} onChange={e=>setOffice({...office,taxRegistrationNo:e.target.value})}/></label>
        </div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',margin:'12px 0'}}>{bool('Registered Office',office.registeredOffice,v=>setOffice({...office,registeredOffice:v}))}{bool('Carrier Payer Eligible',office.carrierPayerEligible,v=>setOffice({...office,carrierPayerEligible:v}))}{bool('Customer Billing',office.customerBillingEnabled,v=>setOffice({...office,customerBillingEnabled:v}))}{bool('Forwarding',office.forwardingEnabled,v=>setOffice({...office,forwardingEnabled:v}))}{bool('NVOCC',office.nvoccEnabled,v=>setOffice({...office,nvoccEnabled:v}))}</div>
        <div style={{textAlign:'right'}}><button className="btn" disabled={busy} onClick={saveOffice}>Save ANC Office</button></div>
      </div>
      <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Office</th><th>Legal Entity</th><th>Country</th><th>Address</th><th>Carrier Payer</th><th>Forwarding / NVOCC</th></tr></thead><tbody>{offices.map(o=><tr key={o.officeId}><td><b>{o.officeCode}</b><div>{o.officeName}</div></td><td>{o.legalEntityName}</td><td>{o.countryCode}<div className="sub">{o.currency} · {o.timezone}</div></td><td>{o.address}, {o.city}</td><td>{String(o.carrierPayerEligible)}</td><td>{String(o.forwardingEnabled)} / {String(o.nvoccEnabled)}</td></tr>)}{!offices.length&&<tr><td colSpan={6}>No registered ANC offices configured yet.</td></tr>}</tbody></table></div></div>
    </>}

    {tab==='locations'&&<>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>Add Controlled Location</h3>
        <div style={grid}>
          <label><span style={labelStyle}>Location Code</span><input style={fieldStyle} value={location.locationCode} onChange={e=>setLocation({...location,locationCode:e.target.value.toUpperCase()})} placeholder="NLRTM"/></label>
          <label><span style={labelStyle}>UN/LOCODE</span><input style={fieldStyle} maxLength={5} value={location.unLocode} onChange={e=>setLocation({...location,unLocode:e.target.value.toUpperCase()})} placeholder="NLRTM"/></label>
          <label><span style={labelStyle}>Name</span><input style={fieldStyle} value={location.name} onChange={e=>setLocation({...location,name:e.target.value})} placeholder="Rotterdam"/></label>
          <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={location.type} onChange={e=>setLocation({...location,type:e.target.value})}>{['PORT','TERMINAL','DEPOT','CITY','AIRPORT','RAIL_RAMP','WAREHOUSE'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label><span style={labelStyle}>Country</span><select style={fieldStyle} value={location.countryCode} onChange={e=>{const cc=e.target.value,ct=countries.find(x=>x.countryCode===cc);setLocation({...location,countryCode:cc,timezone:location.timezone||ct?.timezone||''});}}><option value="">Select</option>{countries.map(c=><option key={c.countryCode}>{c.countryCode}</option>)}</select></label>
          <label><span style={labelStyle}>Timezone</span><input style={fieldStyle} value={location.timezone} onChange={e=>setLocation({...location,timezone:e.target.value})}/></label>
          <label><span style={labelStyle}>Port Code</span><input style={fieldStyle} value={location.portCode} onChange={e=>setLocation({...location,portCode:e.target.value.toUpperCase()})}/></label>
          <label><span style={labelStyle}>Terminal Code</span><input style={fieldStyle} value={location.terminalCode} onChange={e=>setLocation({...location,terminalCode:e.target.value.toUpperCase()})}/></label>
        </div>
        <div style={{margin:'12px 0'}}>{bool('Active',location.active,v=>setLocation({...location,active:v}))}</div>
        <div style={{textAlign:'right'}}><button className="btn" disabled={busy} onClick={saveLocation}>Save Location</button></div>
      </div>
      <div className="card"><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Country</th><th>Timezone</th><th>Port / Terminal</th></tr></thead><tbody>{locations.map(l=><tr key={l.locationCode}><td><b>{l.locationCode}</b><div className="sub">{l.unLocode||'-'}</div></td><td>{l.name}</td><td>{l.type}</td><td>{l.countryCode}</td><td>{l.timezone}</td><td>{l.portCode||'-'} / {l.terminalCode||'-'}</td></tr>)}{!locations.length&&<tr><td colSpan={6}>No controlled locations configured yet.</td></tr>}</tbody></table></div></div>
    </>}
  </WorkspaceShell>;
}
