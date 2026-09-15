'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[]};
type Tariff={
  id:string;origin:string;destination:string;equipment:string;chargeCode:string;
  buyRate:any;sellRate:any;currency:string;dgPremium?:any;reeferPremium?:any;
  freeTimeOrigin?:number|null;freeTimeDestination?:number|null;grossProfit?:number;marginPct?:number;
  contract?:{id:string;contractNo:string;partyId:string;partyType:string;contractType:string;validTo:string;status:string};
  daysToExpiry?:number;
};
type Contract={
  id:string;contractNo:string;partyId:string;partyType:string;contractType:string;trade?:string;
  currency:string;validFrom:string;validTo:string;minimumQuantity?:any;quantityUnit?:string;
  status:string;displayStatus:string;notes?:string;daysToExpiry:number;rateCount:number;rates:Tariff[];
};
type Dashboard={totalContracts:number;activeContracts:number;expiring30d:number;expiredContracts:number;suspendedContracts:number;activeTariffLanes:number};

const blankDashboard:Dashboard={totalContracts:0,activeContracts:0,expiring30d:0,expiredContracts:0,suspendedContracts:0,activeTariffLanes:0};
const today=()=>new Date().toISOString().slice(0,10);
const plusDays=(n:number)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

export default function CommercialPage(){
  const [token,setToken]=useState('');
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [contracts,setContracts]=useState<Contract[]>([]);
  const [dashboard,setDashboard]=useState<Dashboard>(blankDashboard);
  const [selectedId,setSelectedId]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [extendTo,setExtendTo]=useState('');
  const [matches,setMatches]=useState<Tariff[]>([]);
  const [contractForm,setContractForm]=useState({
    contractNo:'',partyId:'',partyType:'CUSTOMER',contractType:'CUSTOMER_TARIFF',trade:'',currency:'USD',
    validFrom:today(),validTo:plusDays(90),minimumQuantity:'',quantityUnit:'TEU',notes:''
  });
  const [rateForm,setRateForm]=useState({
    origin:'',destination:'',equipment:'40HC',chargeCode:'OCEAN_FREIGHT',buyRate:'',sellRate:'',currency:'USD',
    dgPremium:'',reeferPremium:'',oogRule:'',freeTimeOrigin:'',freeTimeDestination:''
  });
  const [matchForm,setMatchForm]=useState({
    partyId:'',customerId:'',origin:'',destination:'',equipment:'40HC',chargeCode:'OCEAN_FREIGHT',currency:'USD'
  });

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const [c,d,o]=await Promise.all([api('/commercial/contracts',t),api('/commercial/dashboard',t),api('/organizations',t)]);
      setContracts(Array.isArray(c)?c:[]);
      setDashboard({...blankDashboard,...d});
      setOrgs(Array.isArray(o)?o:[]);
    }catch(e:any){setMessage(e.message||'Unable to load commercial contracts and tariffs.');}
  }

  const selected=useMemo(()=>contracts.find(c=>c.id===selectedId)||null,[contracts,selectedId]);
  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')),[orgs]);
  const partyName=(id:string)=>{const o=orgs.find(x=>x.id===id);return o?`${o.code} - ${o.name}`:id;};

  async function createContract(){
    if(!contractForm.partyId||!contractForm.validTo){setMessage('Contract party and validity are required.');return;}
    setBusy(true);setMessage('');
    try{
      const contractNo=contractForm.contractNo.trim()||`CTR-${Date.now().toString().slice(-8)}`;
      const row=await api('/commercial/contracts',token,{method:'POST',body:JSON.stringify({
        ...contractForm,contractNo,
        validFrom:new Date(`${contractForm.validFrom}T00:00:00Z`).toISOString(),
        validTo:new Date(`${contractForm.validTo}T23:59:59Z`).toISOString(),
        minimumQuantity:contractForm.minimumQuantity===''?undefined:Number(contractForm.minimumQuantity)
      })});
      setMessage(`Contract ${contractNo} created in Draft. Add tariff lanes, then activate it.`);
      setSelectedId(row.id||'');
      setContractForm({...contractForm,contractNo:'',trade:'',minimumQuantity:'',notes:''});
      await load();
    }catch(e:any){setMessage(e.message||'Contract could not be created.');}
    finally{setBusy(false);}
  }

  async function contractAction(id:string,action:'activate'|'suspend'){
    setBusy(true);setMessage('');
    try{
      await api(`/commercial/contracts/${id}/${action}`,token,{method:'POST'});
      setMessage(`Contract ${action==='activate'?'activated':'suspended'}.`);
      await load();
    }catch(e:any){setMessage(e.message||'Contract action failed.');}
    finally{setBusy(false);}
  }

  async function extendContract(){
    if(!selected||!extendTo){setMessage('Choose a new valid-to date.');return;}
    setBusy(true);setMessage('');
    try{
      await api(`/commercial/contracts/${selected.id}/extend`,token,{method:'POST',body:JSON.stringify({validTo:new Date(`${extendTo}T23:59:59Z`).toISOString()})});
      setMessage(`Contract ${selected.contractNo} validity extended.`);setExtendTo('');await load();
    }catch(e:any){setMessage(e.message||'Contract could not be extended.');}
    finally{setBusy(false);}
  }

  async function addRate(){
    if(!selected){setMessage('Select a contract first.');return;}
    setBusy(true);setMessage('');
    try{
      await api(`/commercial/contracts/${selected.id}/rates`,token,{method:'POST',body:JSON.stringify({
        ...rateForm,
        buyRate:rateForm.buyRate===''?undefined:Number(rateForm.buyRate),
        sellRate:rateForm.sellRate===''?undefined:Number(rateForm.sellRate),
        dgPremium:rateForm.dgPremium===''?undefined:Number(rateForm.dgPremium),
        reeferPremium:rateForm.reeferPremium===''?undefined:Number(rateForm.reeferPremium),
        freeTimeOrigin:rateForm.freeTimeOrigin===''?undefined:Number(rateForm.freeTimeOrigin),
        freeTimeDestination:rateForm.freeTimeDestination===''?undefined:Number(rateForm.freeTimeDestination)
      })});
      setMessage(`Tariff lane added to ${selected.contractNo}.`);
      setRateForm({...rateForm,origin:'',destination:'',buyRate:'',sellRate:'',dgPremium:'',reeferPremium:'',oogRule:'',freeTimeOrigin:'',freeTimeDestination:''});
      await load();
    }catch(e:any){setMessage(e.message||'Tariff lane could not be added.');}
    finally{setBusy(false);}
  }

  async function matchTariffs(){
    if(!matchForm.partyId||!matchForm.origin.trim()||!matchForm.destination.trim()){setMessage('Tariff party, origin and destination are required.');return;}
    setBusy(true);setMessage('');
    try{
      const rows=await api('/commercial/tariffs/match',token,{method:'POST',body:JSON.stringify({
        ...matchForm,origin:matchForm.origin.trim().toUpperCase(),destination:matchForm.destination.trim().toUpperCase(),
        chargeCode:matchForm.chargeCode||undefined,currency:matchForm.currency||undefined
      })});
      setMatches(Array.isArray(rows)?rows:[]);
      setMessage(Array.isArray(rows)&&rows.length?`${rows.length} matching tariff lane(s) found.`:'No active tariff matched these criteria.');
    }catch(e:any){setMessage(e.message||'Tariff search failed.');}
    finally{setBusy(false);}
  }

  async function createQuote(rate:Tariff){
    const customerId=matchForm.customerId||matchForm.partyId;
    if(!customerId){setMessage('Select the quote customer first.');return;}
    setBusy(true);setMessage('');
    try{
      const q=await api(`/commercial/tariffs/${rate.id}/quote`,token,{method:'POST',body:JSON.stringify({customerId})});
      setMessage(`Quote ${q.quoteNo} created from contract ${q.contractNo}. Open Commercial / Quotes to approve and send it.`);
    }catch(e:any){setMessage(e.message||'Quote could not be created from this tariff.');}
    finally{setBusy(false);}
  }

  const kpis=[
    ['Active contracts',dashboard.activeContracts,'Currently usable commercial agreements'],
    ['Expiring ≤ 30d',dashboard.expiring30d,'Renewal attention required'],
    ['Active tariff lanes',dashboard.activeTariffLanes,'Rate lanes available for matching'],
    ['Expired',dashboard.expiredContracts,'Contracts no longer valid'],
    ['Suspended',dashboard.suspendedContracts,'Commercially blocked agreements']
  ];

  return <WorkspaceShell
    title="Commercial / Contracts & Tariffs"
    subtitle="Customer and agent agreements, lane tariffs, validity control and quote sourcing"
    active="/commercial"
    actions={<><a className="btn" href="/rates">Open Quotes</a><button className="btn" onClick={()=>void load()}>Refresh</button></>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,marginBottom:12}}>
      {kpis.map(([label,value,note])=><div className="card" key={label}>
        <div style={{fontSize:12,fontWeight:800,color:'#526778',textTransform:'uppercase'}}>{label}</div>
        <div style={{fontSize:24,fontWeight:900,color:'#153a5d',margin:'4px 0'}}>{value}</div>
        <div className="sub">{note}</div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>New service / tariff contract</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Contract No.</span><input style={fieldStyle} value={contractForm.contractNo} onChange={e=>setContractForm({...contractForm,contractNo:e.target.value})} placeholder="Auto if blank"/></label>
        <label><span style={labelStyle}>Contract Party *</span><select style={fieldStyle} value={contractForm.partyId} onChange={e=>setContractForm({...contractForm,partyId:e.target.value})}><option value="">Select organization</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
        <label><span style={labelStyle}>Party Type</span><select style={fieldStyle} value={contractForm.partyType} onChange={e=>setContractForm({...contractForm,partyType:e.target.value})}>{['CUSTOMER','AGENT','CARRIER','SLOT_PROVIDER','VENDOR'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Contract Type</span><select style={fieldStyle} value={contractForm.contractType} onChange={e=>setContractForm({...contractForm,contractType:e.target.value})}>{['CUSTOMER_TARIFF','AGENT_TARIFF','CARRIER_BUY','SLOT_AGREEMENT','SERVICE_CONTRACT'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Trade</span><input style={fieldStyle} value={contractForm.trade} onChange={e=>setContractForm({...contractForm,trade:e.target.value})} placeholder="ASIA-MIDDLE EAST"/></label>
        <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={contractForm.currency} onChange={e=>setContractForm({...contractForm,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Valid From</span><input type="date" style={fieldStyle} value={contractForm.validFrom} onChange={e=>setContractForm({...contractForm,validFrom:e.target.value})}/></label>
        <label><span style={labelStyle}>Valid To *</span><input type="date" style={fieldStyle} value={contractForm.validTo} onChange={e=>setContractForm({...contractForm,validTo:e.target.value})}/></label>
        <label><span style={labelStyle}>Minimum Qty</span><input type="number" min="0" style={fieldStyle} value={contractForm.minimumQuantity} onChange={e=>setContractForm({...contractForm,minimumQuantity:e.target.value})}/></label>
        <label><span style={labelStyle}>Qty Unit</span><select style={fieldStyle} value={contractForm.quantityUnit} onChange={e=>setContractForm({...contractForm,quantityUnit:e.target.value})}>{['TEU','FEU','CONTAINER','TON','CBM'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <label style={{display:'block',marginTop:10}}><span style={labelStyle}>Notes</span><input style={fieldStyle} value={contractForm.notes} onChange={e=>setContractForm({...contractForm,notes:e.target.value})}/></label>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createContract}>{busy?'Saving…':'Create Contract'}</button></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Contracts</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Contract</th><th>Party</th><th>Type</th><th>Trade</th><th>Validity</th><th>Tariffs</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {contracts.map(c=><tr key={c.id} style={selectedId===c.id?{background:'#f4f8fb'}:undefined}>
          <td><button className="btn" onClick={()=>{setSelectedId(c.id);setRateForm({...rateForm,currency:c.currency});setExtendTo('');}}>{c.contractNo}</button></td>
          <td>{partyName(c.partyId)}<div className="sub">{c.partyType}</div></td>
          <td>{c.contractType}</td><td>{c.trade||'-'}</td>
          <td>{fmtDate(c.validFrom)} – {fmtDate(c.validTo)}<div className="sub">{c.daysToExpiry} day(s)</div></td>
          <td><b>{c.rateCount}</b></td><td><span className="status">{c.displayStatus}</span></td>
          <td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {['DRAFT','SUSPENDED'].includes(c.displayStatus)&&<button className="btn" disabled={busy} onClick={()=>void contractAction(c.id,'activate')}>Activate</button>}
            {['ACTIVE','EXPIRING'].includes(c.displayStatus)&&<button className="btn" disabled={busy} onClick={()=>void contractAction(c.id,'suspend')}>Suspend</button>}
            <button className="btn" onClick={()=>setSelectedId(c.id)}>Open</button>
          </div></td>
        </tr>)}
        {!contracts.length&&<tr><td colSpan={8} className="sub">No commercial contracts yet.</td></tr>}
      </tbody></table></div>
    </div>

    {selected&&<div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>{selected.contractNo} — tariff lanes</h3>
      <div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap',marginBottom:12}}>
        <label><span style={labelStyle}>Extend validity to</span><input type="date" style={{...fieldStyle,minWidth:170}} value={extendTo} onChange={e=>setExtendTo(e.target.value)}/></label>
        <button className="btn" disabled={busy||!extendTo} onClick={extendContract}>Extend Contract</button>
      </div>
      <div style={formGrid}>
        <label><span style={labelStyle}>Origin *</span><input style={fieldStyle} value={rateForm.origin} onChange={e=>setRateForm({...rateForm,origin:e.target.value})} placeholder="CNSHA"/></label>
        <label><span style={labelStyle}>Destination *</span><input style={fieldStyle} value={rateForm.destination} onChange={e=>setRateForm({...rateForm,destination:e.target.value})} placeholder="AEJEA"/></label>
        <label><span style={labelStyle}>Equipment *</span><select style={fieldStyle} value={rateForm.equipment} onChange={e=>setRateForm({...rateForm,equipment:e.target.value})}>{['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Charge Code *</span><input style={fieldStyle} value={rateForm.chargeCode} onChange={e=>setRateForm({...rateForm,chargeCode:e.target.value})}/></label>
        <label><span style={labelStyle}>Buy Rate</span><input type="number" min="0" style={fieldStyle} value={rateForm.buyRate} onChange={e=>setRateForm({...rateForm,buyRate:e.target.value})}/></label>
        <label><span style={labelStyle}>Sell Rate</span><input type="number" min="0" style={fieldStyle} value={rateForm.sellRate} onChange={e=>setRateForm({...rateForm,sellRate:e.target.value})}/></label>
        <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={rateForm.currency} onChange={e=>setRateForm({...rateForm,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>DG Premium</span><input type="number" min="0" style={fieldStyle} value={rateForm.dgPremium} onChange={e=>setRateForm({...rateForm,dgPremium:e.target.value})}/></label>
        <label><span style={labelStyle}>Reefer Premium</span><input type="number" min="0" style={fieldStyle} value={rateForm.reeferPremium} onChange={e=>setRateForm({...rateForm,reeferPremium:e.target.value})}/></label>
        <label><span style={labelStyle}>Origin Free Days</span><input type="number" min="0" style={fieldStyle} value={rateForm.freeTimeOrigin} onChange={e=>setRateForm({...rateForm,freeTimeOrigin:e.target.value})}/></label>
        <label><span style={labelStyle}>Destination Free Days</span><input type="number" min="0" style={fieldStyle} value={rateForm.freeTimeDestination} onChange={e=>setRateForm({...rateForm,freeTimeDestination:e.target.value})}/></label>
        <label><span style={labelStyle}>OOG Rule</span><input style={fieldStyle} value={rateForm.oogRule} onChange={e=>setRateForm({...rateForm,oogRule:e.target.value})} placeholder="Optional rule / basis"/></label>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',margin:'12px 0'}}><button className="btn" disabled={busy} onClick={addRate}>Add Tariff Lane</button></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Lane</th><th>Equipment</th><th>Charge</th><th>Buy</th><th>Sell</th><th>GP</th><th>GP %</th><th>Free Time O/D</th></tr></thead><tbody>
        {(selected.rates||[]).map(r=><tr key={r.id}><td>{r.origin} → {r.destination}</td><td>{r.equipment}</td><td>{r.chargeCode}</td><td>{r.buyRate==null?'-':fmtMoney(r.buyRate,r.currency)}</td><td>{r.sellRate==null?'-':fmtMoney(r.sellRate,r.currency)}</td><td>{fmtMoney(Number(r.grossProfit||0),r.currency)}</td><td>{Number(r.marginPct||0).toFixed(1)}%</td><td>{r.freeTimeOrigin??'-'} / {r.freeTimeDestination??'-'}</td></tr>)}
        {!selected.rates?.length&&<tr><td colSpan={8} className="sub">Add at least one tariff lane before activating this contract.</td></tr>}
      </tbody></table></div>
    </div>}

    <div className="card">
      <h3 style={sectionTitle}>Tariff match → commercial quote</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Tariff Party *</span><select style={fieldStyle} value={matchForm.partyId} onChange={e=>setMatchForm({...matchForm,partyId:e.target.value})}><option value="">Select contract party</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
        <label><span style={labelStyle}>Quote Customer</span><select style={fieldStyle} value={matchForm.customerId} onChange={e=>setMatchForm({...matchForm,customerId:e.target.value})}><option value="">Use tariff party</option>{customers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
        <label><span style={labelStyle}>Origin *</span><input style={fieldStyle} value={matchForm.origin} onChange={e=>setMatchForm({...matchForm,origin:e.target.value})} placeholder="CNSHA"/></label>
        <label><span style={labelStyle}>Destination *</span><input style={fieldStyle} value={matchForm.destination} onChange={e=>setMatchForm({...matchForm,destination:e.target.value})} placeholder="AEJEA"/></label>
        <label><span style={labelStyle}>Equipment</span><select style={fieldStyle} value={matchForm.equipment} onChange={e=>setMatchForm({...matchForm,equipment:e.target.value})}>{['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span style={labelStyle}>Charge Code</span><input style={fieldStyle} value={matchForm.chargeCode} onChange={e=>setMatchForm({...matchForm,chargeCode:e.target.value})}/></label>
        <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={matchForm.currency} onChange={e=>setMatchForm({...matchForm,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',margin:'12px 0'}}><button className="btn" disabled={busy} onClick={matchTariffs}>Find Active Tariffs</button></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Contract</th><th>Lane</th><th>Equipment</th><th>Charge</th><th>Buy</th><th>Sell</th><th>GP %</th><th>Expires</th><th>Action</th></tr></thead><tbody>
        {matches.map(r=><tr key={r.id}><td><b>{r.contract?.contractNo}</b><div className="sub">{r.contract?.contractType}</div></td><td>{r.origin} → {r.destination}</td><td>{r.equipment}</td><td>{r.chargeCode}</td><td>{r.buyRate==null?'-':fmtMoney(r.buyRate,r.currency)}</td><td>{r.sellRate==null?'-':fmtMoney(r.sellRate,r.currency)}</td><td>{Number(r.marginPct||0).toFixed(1)}%</td><td>{fmtDate(r.contract?.validTo)}<div className="sub">{r.daysToExpiry} day(s)</div></td><td><button className="btn" disabled={busy||r.sellRate==null} onClick={()=>void createQuote(r)}>Create Quote</button></td></tr>)}
        {!matches.length&&<tr><td colSpan={9} className="sub">Search active contracts to compare tariff matches and create a controlled quote.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
