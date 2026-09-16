'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtMoney,requireToken} from '../../lib/api';

export default function TreasuryPage(){
  const [token,setToken]=useState('');
  const [dashboard,setDashboard]=useState<any>({});
  const [entities,setEntities]=useState<any[]>([]);
  const [accounts,setAccounts]=useState<any[]>([]);
  const [eligible,setEligible]=useState<any[]>([]);
  const [runs,setRuns]=useState<any[]>([]);
  const [forecast,setForecast]=useState<any>({currencies:[]});
  const [forecastItems,setForecastItems]=useState<any[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [bankForm,setBankForm]=useState<any>({entityId:'',bankName:'',accountName:'',accountReference:'',iban:'',swiftCode:'',currency:'USD',glAccount:'1000-BANK',openingBalance:0,overdraftLimit:0,minimumCash:0});
  const [runForm,setRunForm]=useState<any>({bankAccountId:'',paymentDate:new Date().toISOString().slice(0,10),notes:''});
  const [forecastForm,setForecastForm]=useState<any>({forecastDate:new Date().toISOString().slice(0,10),direction:'OUTFLOW',amount:'',currency:'USD',category:'OTHER',description:'',probability:100});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){if(!t)return;setBusy(true);setMessage('');try{const [d,e,a,ap,r,f,fi]=await Promise.all([api('/treasury/dashboard',t),api('/treasury/legal-entities',t),api('/treasury/bank-accounts',t),api('/treasury/ap-eligible',t),api('/treasury/payment-runs',t),api('/treasury/cash-forecast?days=56',t),api('/treasury/forecast-items',t)]);setDashboard(d||{});setEntities(Array.isArray(e)?e:[]);setAccounts(Array.isArray(a)?a:[]);setEligible(Array.isArray(ap)?ap:[]);setRuns(Array.isArray(r)?r:[]);setForecast(f||{currencies:[]});setForecastItems(Array.isArray(fi)?fi:[]);}catch(err:any){setMessage(err.message||'Unable to load treasury.');}finally{setBusy(false);}}
  async function post(path:string,body:any,ok:string){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body)});setMessage(ok);await load();}catch(err:any){setMessage(err.message||'Treasury action failed.');}finally{setBusy(false);}}

  async function saveBank(){await post('/treasury/bank-accounts',{...bankForm,openingBalance:Number(bankForm.openingBalance),overdraftLimit:Number(bankForm.overdraftLimit),minimumCash:Number(bankForm.minimumCash)},'Bank account saved.');setBankForm({...bankForm,bankName:'',accountName:'',accountReference:'',iban:'',swiftCode:'',openingBalance:0,overdraftLimit:0,minimumCash:0});}
  async function createRun(){if(!selected.length){setMessage('Select at least one AP invoice.');return;}await post('/treasury/payment-runs',{...runForm,invoiceNos:selected},'Payment run created.');setSelected([]);}
  async function addForecast(){await post('/treasury/forecast-items',{...forecastForm,amount:Number(forecastForm.amount),probability:Number(forecastForm.probability)},'Forecast item saved.');setForecastForm({...forecastForm,amount:'',description:''});}
  const selectedTotal=useMemo(()=>eligible.filter((x:any)=>selected.includes(x.invoiceNo)).reduce((s:number,x:any)=>s+Number(x.balanceAmount||0),0),[eligible,selected]);
  const forecastRows=useMemo(()=>{const rows:any[]=[];for(const c of forecast?.currencies||[])for(const b of c.buckets||[])rows.push({currency:c.currency,...b});return rows.slice(0,112);},[forecast]);

  return <WorkspaceShell title="Treasury / Liquidity" subtitle="Bank accounts, supplier payment runs, cash forecasting and liquidity control" active="/treasury" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">BANK ACCOUNTS</div><div className="kpi">{dashboard.bankAccountCount||0}</div></div>
      <div className="card"><div className="sub">LIQUIDITY ALERTS</div><div className="kpi">{dashboard.liquidityAlerts||0}</div></div>
      <div className="card"><div className="sub">DRAFT / APPROVED RUNS</div><div className="kpi">{dashboard.draftRuns||0} / {dashboard.approvedRuns||0}</div></div>
      <div className="card"><div className="sub">ELIGIBLE AP</div><div className="kpi">{dashboard.eligibleAPCount||0}</div></div>
      <div className="card"><div className="sub">FORECAST ITEMS</div><div className="kpi">{dashboard.activeForecastItems||0}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Bank Account Master</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Legal Entity</span><select style={fieldStyle} value={bankForm.entityId} onChange={e=>setBankForm({...bankForm,entityId:e.target.value})}><option value="">Select</option>{entities.map((e:any)=><option key={e.entityId} value={e.entityId}>{e.entityCode} · {e.entityName}</option>)}</select></label>
        <label><span style={labelStyle}>Bank Name</span><input style={fieldStyle} value={bankForm.bankName} onChange={e=>setBankForm({...bankForm,bankName:e.target.value})}/></label>
        <label><span style={labelStyle}>Account Name</span><input style={fieldStyle} value={bankForm.accountName} onChange={e=>setBankForm({...bankForm,accountName:e.target.value})}/></label>
        <label><span style={labelStyle}>Account Reference</span><input style={fieldStyle} value={bankForm.accountReference} onChange={e=>setBankForm({...bankForm,accountReference:e.target.value})}/></label>
        <label><span style={labelStyle}>IBAN</span><input style={fieldStyle} value={bankForm.iban} onChange={e=>setBankForm({...bankForm,iban:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>SWIFT / BIC</span><input style={fieldStyle} value={bankForm.swiftCode} onChange={e=>setBankForm({...bankForm,swiftCode:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Currency</span><input style={fieldStyle} maxLength={3} value={bankForm.currency} onChange={e=>setBankForm({...bankForm,currency:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>GL Bank Account</span><input style={fieldStyle} value={bankForm.glAccount} onChange={e=>setBankForm({...bankForm,glAccount:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Opening Balance</span><input type="number" step="0.01" style={fieldStyle} value={bankForm.openingBalance} onChange={e=>setBankForm({...bankForm,openingBalance:e.target.value})}/></label>
        <label><span style={labelStyle}>Overdraft Limit</span><input type="number" step="0.01" style={fieldStyle} value={bankForm.overdraftLimit} onChange={e=>setBankForm({...bankForm,overdraftLimit:e.target.value})}/></label>
        <label><span style={labelStyle}>Minimum Cash</span><input type="number" step="0.01" style={fieldStyle} value={bankForm.minimumCash} onChange={e=>setBankForm({...bankForm,minimumCash:e.target.value})}/></label>
      </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void saveBank()}>Save Bank Account</button>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Account</th><th>Entity</th><th>Currency</th><th>Statement Balance</th><th>Committed</th><th>Available Liquidity</th><th>Minimum Cash</th><th>Status</th></tr></thead><tbody>{accounts.map((a:any)=><tr key={a.accountId}><td><b>{a.bankName}</b><div className="sub">{a.accountName} · {a.accountReference}</div></td><td>{a.entity?.entityCode||a.entityId}</td><td>{a.currency}</td><td>{fmtMoney(a.statementBalance,a.currency)}</td><td>{fmtMoney(a.committedPayments,a.currency)}</td><td>{fmtMoney(a.availableLiquidity,a.currency)}</td><td>{fmtMoney(a.minimumCash,a.currency)}</td><td><span className="status">{a.liquidityStatus}</span></td></tr>)}{!accounts.length&&<tr><td colSpan={8}>No treasury bank accounts configured.</td></tr>}</tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Supplier Payment Run</h3>
      <div style={formGrid}><label><span style={labelStyle}>Pay From</span><select style={fieldStyle} value={runForm.bankAccountId} onChange={e=>setRunForm({...runForm,bankAccountId:e.target.value})}><option value="">Select bank account</option>{accounts.filter((a:any)=>a.active!==false).map((a:any)=><option key={a.accountId} value={a.accountId}>{a.bankName} · {a.accountName} · {a.currency} · {fmtMoney(a.availableLiquidity,a.currency)}</option>)}</select></label><label><span style={labelStyle}>Payment Date</span><input type="date" style={fieldStyle} value={runForm.paymentDate} onChange={e=>setRunForm({...runForm,paymentDate:e.target.value})}/></label><label><span style={labelStyle}>Notes</span><input style={fieldStyle} value={runForm.notes} onChange={e=>setRunForm({...runForm,notes:e.target.value})}/></label></div>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th></th><th>Invoice</th><th>Supplier</th><th>Due</th><th>Currency</th><th>Outstanding</th></tr></thead><tbody>{eligible.map((i:any)=><tr key={i.invoiceNo}><td><input type="checkbox" checked={selected.includes(i.invoiceNo)} onChange={e=>setSelected(e.target.checked?[...selected,i.invoiceNo]:selected.filter(x=>x!==i.invoiceNo))}/></td><td>{i.invoiceNo}</td><td>{i.partyName||'-'}</td><td>{i.dueDate?new Date(i.dueDate).toLocaleDateString():'-'}</td><td>{i.currency}</td><td>{fmtMoney(i.balanceAmount,i.currency)}</td></tr>)}{!eligible.length&&<tr><td colSpan={6}>No eligible AP invoices.</td></tr>}</tbody></table></div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginTop:10,flexWrap:'wrap'}}><button className="btn" disabled={busy||!runForm.bankAccountId||!selected.length} onClick={()=>void createRun()}>Create Payment Run</button><b>Selected: {selected.length}</b><span>{selected.length?fmtMoney(selectedTotal,eligible.find((x:any)=>selected.includes(x.invoiceNo))?.currency||'USD'):'-'}</span></div>
      <div style={{overflowX:'auto',marginTop:14}}><table className="table"><thead><tr><th>Run</th><th>Payment Date</th><th>Bank</th><th>Invoices</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{runs.map((r:any)=><tr key={r.runNo}><td>{r.runNo}</td><td>{new Date(r.paymentDate).toLocaleDateString()}</td><td>{accounts.find((a:any)=>a.accountId===r.bankAccountId)?.accountName||r.bankAccountId}</td><td>{r.invoiceCount}</td><td>{fmtMoney(r.totalAmount,r.currency)}</td><td><span className="status">{r.status}</span></td><td style={{display:'flex',gap:6,flexWrap:'wrap'}}>{r.status==='DRAFT'&&<button className="btn" disabled={busy} onClick={()=>void post(`/treasury/payment-runs/${encodeURIComponent(r.runNo)}/approve`,{},`${r.runNo} approved.`)}>Approve</button>}{r.status==='APPROVED'&&<button className="btn" disabled={busy} onClick={()=>void post(`/treasury/payment-runs/${encodeURIComponent(r.runNo)}/post`,{},`${r.runNo} posted to accounting.`)}>Post</button>}{['DRAFT','APPROVED'].includes(r.status)&&<button className="btn" disabled={busy} onClick={()=>void post(`/treasury/payment-runs/${encodeURIComponent(r.runNo)}/cancel`,{reason:'Cancelled in Treasury workspace'},`${r.runNo} cancelled.`)}>Cancel</button>}</td></tr>)}{!runs.length&&<tr><td colSpan={7}>No payment runs.</td></tr>}</tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Cash Forecast Inputs</h3><div style={formGrid}>
      <label><span style={labelStyle}>Date</span><input type="date" style={fieldStyle} value={forecastForm.forecastDate} onChange={e=>setForecastForm({...forecastForm,forecastDate:e.target.value})}/></label>
      <label><span style={labelStyle}>Direction</span><select style={fieldStyle} value={forecastForm.direction} onChange={e=>setForecastForm({...forecastForm,direction:e.target.value})}><option>INFLOW</option><option>OUTFLOW</option></select></label>
      <label><span style={labelStyle}>Amount</span><input type="number" step="0.01" style={fieldStyle} value={forecastForm.amount} onChange={e=>setForecastForm({...forecastForm,amount:e.target.value})}/></label>
      <label><span style={labelStyle}>Currency</span><input style={fieldStyle} maxLength={3} value={forecastForm.currency} onChange={e=>setForecastForm({...forecastForm,currency:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Category</span><input style={fieldStyle} value={forecastForm.category} onChange={e=>setForecastForm({...forecastForm,category:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Probability %</span><input type="number" min={0} max={100} style={fieldStyle} value={forecastForm.probability} onChange={e=>setForecastForm({...forecastForm,probability:e.target.value})}/></label>
      <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={forecastForm.description} onChange={e=>setForecastForm({...forecastForm,description:e.target.value})}/></label>
    </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void addForecast()}>Add Forecast Item</button>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Date</th><th>Direction</th><th>Description</th><th>Category</th><th>Amount</th><th>Probability</th><th>Status</th><th></th></tr></thead><tbody>{forecastItems.map((x:any)=><tr key={x.forecastId}><td>{new Date(x.forecastDate).toLocaleDateString()}</td><td>{x.direction}</td><td>{x.description}</td><td>{x.category}</td><td>{fmtMoney(x.amount,x.currency)}</td><td>{x.probability}%</td><td>{x.status}</td><td>{x.status==='ACTIVE'&&<button className="btn" onClick={()=>void post(`/treasury/forecast-items/${encodeURIComponent(x.forecastId)}/cancel`,{},'Forecast item cancelled.')}>Cancel</button>}</td></tr>)}{!forecastItems.length&&<tr><td colSpan={8}>No manual forecast items.</td></tr>}</tbody></table></div>
    </div>

    <div className="card"><h3 style={sectionTitle}>56-Day Liquidity Forecast</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Date</th><th>Currency</th><th>Opening</th><th>AR Inflow</th><th>Manual Inflow</th><th>AP Outflow</th><th>Payment Runs</th><th>Manual Outflow</th><th>Net</th><th>Closing</th><th>Liquidity</th><th>Status</th></tr></thead><tbody>{forecastRows.map((b:any)=><tr key={`${b.currency}-${b.date}`}><td>{b.date}</td><td>{b.currency}</td><td>{fmtMoney(b.opening,b.currency)}</td><td>{fmtMoney(b.arInflow,b.currency)}</td><td>{fmtMoney(b.manualInflow,b.currency)}</td><td>{fmtMoney(b.apOutflow,b.currency)}</td><td>{fmtMoney(b.paymentRuns,b.currency)}</td><td>{fmtMoney(b.manualOutflow,b.currency)}</td><td>{fmtMoney(b.net,b.currency)}</td><td>{fmtMoney(b.closing,b.currency)}</td><td>{fmtMoney(b.availableLiquidity,b.currency)}</td><td><span className="status">{b.status}</span></td></tr>)}{!forecastRows.length&&<tr><td colSpan={12}>Configure bank accounts to activate the cash forecast.</td></tr>}</tbody></table></div></div>
  </WorkspaceShell>;
}
