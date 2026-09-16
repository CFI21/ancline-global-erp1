'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

const nowPeriod=()=>new Date().toISOString().slice(0,7);
const diff=(a:string,b:string)=>{const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return (by-ay)*12+(bm-am);};

export default function MonthEndPage(){
  const [token,setToken]=useState('');const [period,setPeriod]=useState(nowPeriod());const [scenario,setScenario]=useState('BUDGET');const [scopeId,setScopeId]=useState('GROUP');const [currency,setCurrency]=useState('USD');const [data,setData]=useState<any>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const [accrual,setAccrual]=useState<any>({legalEntityId:'',currency:'',amount:'',description:'',expenseAccount:'6000-OPERATING-EXPENSE',accrualAccount:'2200-ACCRUALS',autoReverse:true});
  const [prepay,setPrepay]=useState<any>({legalEntityId:'',currency:'',totalAmount:'',startPeriod:nowPeriod(),periods:12,description:'',prepaidAccount:'1300-PREPAYMENTS',expenseAccount:'6000-OPERATING-EXPENSE'});
  const [asset,setAsset]=useState<any>({legalEntityId:'',assetCode:'',assetName:'',currency:'',inServiceDate:new Date().toISOString().slice(0,10),acquisitionCost:'',salvageValue:0,usefulLifeMonths:60,assetAccount:'1500-FIXED-ASSETS',accumulatedDepreciationAccount:'1590-ACCUM-DEPRECIATION',depreciationExpenseAccount:'6100-DEPRECIATION-EXPENSE'});
  const [budget,setBudget]=useState<any>({scopeId:'GROUP',account:'4000-FREIGHT-REVENUE',amount:'',description:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,nowPeriod(),'BUDGET','GROUP','USD');},[]);
  async function load(t=token,p=period,s=scenario,sc=scopeId,c=currency){if(!t)return;setBusy(true);setMessage('');try{setData(await api(`/month-end/dashboard?period=${encodeURIComponent(p)}&scenario=${encodeURIComponent(s)}&scopeId=${encodeURIComponent(sc)}&currency=${encodeURIComponent(c)}`,t));}catch(e:any){setMessage(e.message||'Unable to load month-end control.');}finally{setBusy(false);}}
  async function post(path:string,body:any,success:string){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body||{})});setMessage(success);await load();}catch(e:any){setMessage(e.message||'Month-end action failed.');}finally{setBusy(false);}}
  const entities=data?.entities||[],accruals=data?.accruals||[],prepayments=data?.prepayments||[],assets=data?.assets||[],variance=data?.variance||[],readiness=data?.readiness||{blockers:[]},kpi=data?.kpis||{};
  function entityCurrency(id:string){return entities.find((x:any)=>x.entityId===id)?.localCurrency||currency;}
  async function saveAccrual(){if(!accrual.legalEntityId||!accrual.amount){setMessage('Legal entity and amount are required.');return;}await post('/month-end/accruals',{...accrual,period,currency:accrual.currency||entityCurrency(accrual.legalEntityId),amount:Number(accrual.amount)},'Accrual created.');setAccrual({...accrual,amount:'',description:''});}
  async function savePrepay(){if(!prepay.legalEntityId||!prepay.totalAmount){setMessage('Legal entity and total amount are required.');return;}await post('/month-end/prepayments',{...prepay,currency:prepay.currency||entityCurrency(prepay.legalEntityId),totalAmount:Number(prepay.totalAmount),periods:Number(prepay.periods)},'Prepayment schedule created.');setPrepay({...prepay,totalAmount:'',description:''});}
  async function saveAsset(){if(!asset.legalEntityId||!asset.assetName||!asset.acquisitionCost){setMessage('Legal entity, asset name and acquisition cost are required.');return;}await post('/month-end/fixed-assets',{...asset,currency:asset.currency||entityCurrency(asset.legalEntityId),acquisitionCost:Number(asset.acquisitionCost),salvageValue:Number(asset.salvageValue||0),usefulLifeMonths:Number(asset.usefulLifeMonths)},'Fixed asset created.');setAsset({...asset,assetCode:'',assetName:'',acquisitionCost:'',salvageValue:0});}
  async function saveBudget(){if(!budget.account||budget.amount===''){setMessage('Account and amount are required.');return;}await post('/month-end/budget-lines',{...budget,scopeId,period,scenario,currency,amount:Number(budget.amount)},`${scenario} line saved.`);setBudget({...budget,amount:'',description:''});}
  const duePrepay=(x:any)=>{const i=diff(x.startPeriod,period);return i>=0&&i<Number(x.periods)&&!(x.recognitions||[]).some((v:any)=>v.period===period);};
  const dueAsset=(x:any)=>{const start=String(x.inServiceDate||'').slice(0,7),i=start?diff(start,period):-1;return i>=0&&i<Number(x.usefulLifeMonths)&&!(x.depreciation||[]).some((v:any)=>v.period===period);};

  return <WorkspaceShell title="Month-End Control Center" subtitle="Accruals, prepayments, fixed assets, budget control and period-close automation" active="/month-end" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
      <label style={{minWidth:170}}><span style={labelStyle}>Period</span><input type="month" style={fieldStyle} value={period} onChange={e=>{setPeriod(e.target.value);void load(token,e.target.value,scenario,scopeId,currency);}}/></label>
      <label style={{minWidth:150}}><span style={labelStyle}>Scenario</span><select style={fieldStyle} value={scenario} onChange={e=>{setScenario(e.target.value);void load(token,period,e.target.value,scopeId,currency);}}><option>BUDGET</option><option>FORECAST</option></select></label>
      <label style={{minWidth:210}}><span style={labelStyle}>Budget Scope</span><select style={fieldStyle} value={scopeId} onChange={e=>{setScopeId(e.target.value);void load(token,period,scenario,e.target.value,currency);}}><option value="GROUP">GROUP</option>{entities.map((x:any)=><option key={x.entityId} value={x.entityId}>{x.entityCode} · {x.entityName}</option>)}</select></label>
      <label style={{minWidth:120}}><span style={labelStyle}>Currency</span><input style={fieldStyle} maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} onBlur={()=>void load(token,period,scenario,scopeId,currency)}/></label>
    </div></div>

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">PERIOD STATUS</div><div className="kpi">{readiness.status||'OPEN'}</div></div>
      <div className="card"><div className="sub">CLOSE BLOCKERS</div><div className="kpi">{kpi.closeBlockers||0}</div></div>
      <div className="card"><div className="sub">PENDING ACCRUALS</div><div className="kpi">{kpi.pendingAccruals||0}</div></div>
      <div className="card"><div className="sub">PREPAYMENTS DUE</div><div className="kpi">{kpi.duePrepayments||0}</div></div>
      <div className="card"><div className="sub">DEPRECIATION DUE</div><div className="kpi">{kpi.dueDepreciation||0}</div></div>
      <div className="card"><div className="sub">UNBUDGETED ACTUALS</div><div className="kpi">{kpi.unbudgetedActuals||0}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Period Close Automation</h3><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button className="btn" disabled={busy||readiness.status==='CLOSED'} onClick={()=>void post(`/month-end/close/${period}/run-due`,{},'Due accrual, prepayment and depreciation postings processed.')}>Run Due Items</button>
      <button className="btn" disabled={busy||readiness.status==='CLOSED'} onClick={()=>void post(`/month-end/close/${period}/soft-close`,{},'Period soft-closed.')}>Soft Close</button>
      <button className="btn" disabled={busy||!readiness.ready||readiness.status==='CLOSED'} onClick={()=>{if(window.confirm(`Close ${period}? New postings will be blocked until reopened.`))void post(`/month-end/close/${period}/close`,{},'Period closed.');}}>Hard Close</button>
      <button className="btn" disabled={busy||readiness.status==='OPEN'} onClick={()=>void post(`/month-end/close/${period}/reopen`,{},'Period reopened.')}>Reopen</button>
    </div><div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Blocker</th><th>Object</th><th>Message</th></tr></thead><tbody>{(readiness.blockers||[]).map((b:any,i:number)=><tr key={`${b.type}-${b.objectId||i}`}><td><span className="status">{b.type}</span></td><td>{b.objectId||'-'}</td><td>{b.message}</td></tr>)}{(!readiness.blockers||readiness.blockers.length===0)&&<tr><td colSpan={3}>No blockers. Period is ready to close.</td></tr>}</tbody></table></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Accruals</h3><div style={formGrid}>
      <label><span style={labelStyle}>Legal Entity</span><select style={fieldStyle} value={accrual.legalEntityId} onChange={e=>setAccrual({...accrual,legalEntityId:e.target.value,currency:entityCurrency(e.target.value)})}><option value="">Select</option>{entities.map((x:any)=><option key={x.entityId} value={x.entityId}>{x.entityCode}</option>)}</select></label>
      <label><span style={labelStyle}>Amount</span><input type="number" step="0.01" style={fieldStyle} value={accrual.amount} onChange={e=>setAccrual({...accrual,amount:e.target.value})}/></label>
      <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={accrual.description} onChange={e=>setAccrual({...accrual,description:e.target.value})}/></label>
      <label><span style={labelStyle}>Expense Account</span><input style={fieldStyle} value={accrual.expenseAccount} onChange={e=>setAccrual({...accrual,expenseAccount:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Accrual Account</span><input style={fieldStyle} value={accrual.accrualAccount} onChange={e=>setAccrual({...accrual,accrualAccount:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Auto Reverse Next Month</span><select style={fieldStyle} value={accrual.autoReverse?'YES':'NO'} onChange={e=>setAccrual({...accrual,autoReverse:e.target.value==='YES'})}><option>YES</option><option>NO</option></select></label>
    </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void saveAccrual()}>Create Accrual</button>
    <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>ID</th><th>Entity</th><th>Description</th><th>Amount</th><th>Status</th><th>Reversal</th><th></th></tr></thead><tbody>{accruals.map((x:any)=><tr key={x.accrualId}><td>{x.accrualId}</td><td>{x.entityCode}</td><td>{x.description}</td><td>{fmtMoney(x.amount,x.currency)}</td><td><span className="status">{x.status}</span></td><td>{x.autoReverse?'Next month':'Manual'}</td><td>{x.status!=='POSTED'?<button className="btn" disabled={busy} onClick={()=>void post(`/month-end/accruals/${encodeURIComponent(x.accrualId)}/post`,{},`Accrual ${x.accrualId} posted.`)}>Post</button>:x.posting?.journalNo||'-'}</td></tr>)}{accruals.length===0&&<tr><td colSpan={7}>No accruals for {period}.</td></tr>}</tbody></table></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Prepayments</h3><div style={formGrid}>
      <label><span style={labelStyle}>Legal Entity</span><select style={fieldStyle} value={prepay.legalEntityId} onChange={e=>setPrepay({...prepay,legalEntityId:e.target.value,currency:entityCurrency(e.target.value)})}><option value="">Select</option>{entities.map((x:any)=><option key={x.entityId} value={x.entityId}>{x.entityCode}</option>)}</select></label>
      <label><span style={labelStyle}>Total Amount</span><input type="number" step="0.01" style={fieldStyle} value={prepay.totalAmount} onChange={e=>setPrepay({...prepay,totalAmount:e.target.value})}/></label>
      <label><span style={labelStyle}>Start Period</span><input type="month" style={fieldStyle} value={prepay.startPeriod} onChange={e=>setPrepay({...prepay,startPeriod:e.target.value})}/></label>
      <label><span style={labelStyle}>Months</span><input type="number" min={1} max={120} style={fieldStyle} value={prepay.periods} onChange={e=>setPrepay({...prepay,periods:Number(e.target.value)})}/></label>
      <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={prepay.description} onChange={e=>setPrepay({...prepay,description:e.target.value})}/></label>
      <label><span style={labelStyle}>Prepaid Account</span><input style={fieldStyle} value={prepay.prepaidAccount} onChange={e=>setPrepay({...prepay,prepaidAccount:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Expense Account</span><input style={fieldStyle} value={prepay.expenseAccount} onChange={e=>setPrepay({...prepay,expenseAccount:e.target.value.toUpperCase()})}/></label>
    </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void savePrepay()}>Create Prepayment Schedule</button>
    <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>ID</th><th>Entity</th><th>Description</th><th>Schedule</th><th>Recognized</th><th>Remaining</th><th></th></tr></thead><tbody>{prepayments.map((x:any)=><tr key={x.prepaymentId}><td>{x.prepaymentId}</td><td>{x.entityCode}</td><td>{x.description}</td><td>{x.startPeriod} · {x.periods} mo.</td><td>{fmtMoney(x.recognizedAmount,x.currency)}</td><td>{fmtMoney(x.remainingAmount,x.currency)}</td><td>{duePrepay(x)?<button className="btn" disabled={busy} onClick={()=>void post(`/month-end/prepayments/${encodeURIComponent(x.prepaymentId)}/recognize/${period}`,{},`Prepayment ${x.prepaymentId} recognized for ${period}.`)}>Recognize {period}</button>:'-'}</td></tr>)}{prepayments.length===0&&<tr><td colSpan={7}>No prepayment schedules.</td></tr>}</tbody></table></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Fixed Assets / Depreciation</h3><div style={formGrid}>
      <label><span style={labelStyle}>Legal Entity</span><select style={fieldStyle} value={asset.legalEntityId} onChange={e=>setAsset({...asset,legalEntityId:e.target.value,currency:entityCurrency(e.target.value)})}><option value="">Select</option>{entities.map((x:any)=><option key={x.entityId} value={x.entityId}>{x.entityCode}</option>)}</select></label>
      <label><span style={labelStyle}>Asset Code</span><input style={fieldStyle} value={asset.assetCode} onChange={e=>setAsset({...asset,assetCode:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Asset Name</span><input style={fieldStyle} value={asset.assetName} onChange={e=>setAsset({...asset,assetName:e.target.value})}/></label>
      <label><span style={labelStyle}>In Service</span><input type="date" style={fieldStyle} value={asset.inServiceDate} onChange={e=>setAsset({...asset,inServiceDate:e.target.value})}/></label>
      <label><span style={labelStyle}>Cost</span><input type="number" step="0.01" style={fieldStyle} value={asset.acquisitionCost} onChange={e=>setAsset({...asset,acquisitionCost:e.target.value})}/></label>
      <label><span style={labelStyle}>Salvage</span><input type="number" step="0.01" style={fieldStyle} value={asset.salvageValue} onChange={e=>setAsset({...asset,salvageValue:e.target.value})}/></label>
      <label><span style={labelStyle}>Useful Life · Months</span><input type="number" min={1} max={600} style={fieldStyle} value={asset.usefulLifeMonths} onChange={e=>setAsset({...asset,usefulLifeMonths:Number(e.target.value)})}/></label>
      <label><span style={labelStyle}>Asset Account</span><input style={fieldStyle} value={asset.assetAccount} onChange={e=>setAsset({...asset,assetAccount:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Accum. Depreciation</span><input style={fieldStyle} value={asset.accumulatedDepreciationAccount} onChange={e=>setAsset({...asset,accumulatedDepreciationAccount:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Depreciation Expense</span><input style={fieldStyle} value={asset.depreciationExpenseAccount} onChange={e=>setAsset({...asset,depreciationExpenseAccount:e.target.value.toUpperCase()})}/></label>
    </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void saveAsset()}>Create Fixed Asset</button>
    <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Asset</th><th>Entity</th><th>In Service</th><th>Cost</th><th>Accum. Dep.</th><th>NBV</th><th>Life</th><th></th></tr></thead><tbody>{assets.map((x:any)=><tr key={x.assetId}><td><b>{x.assetCode}</b><div className="sub">{x.assetName}</div></td><td>{x.entityCode}</td><td>{fmtDate(x.inServiceDate)}</td><td>{fmtMoney(x.acquisitionCost,x.currency)}</td><td>{fmtMoney(x.accumulatedDepreciation,x.currency)}</td><td>{fmtMoney(x.netBookValue,x.currency)}</td><td>{x.usefulLifeMonths} mo.</td><td>{dueAsset(x)?<button className="btn" disabled={busy} onClick={()=>void post(`/month-end/fixed-assets/${encodeURIComponent(x.assetId)}/depreciate/${period}`,{},`Depreciation posted for ${x.assetCode}.`)}>Depreciate {period}</button>:'-'}</td></tr>)}{assets.length===0&&<tr><td colSpan={8}>No fixed assets registered.</td></tr>}</tbody></table></div></div>

    <div className="card"><h3 style={sectionTitle}>{scenario} vs Actual</h3><div style={formGrid}>
      <label><span style={labelStyle}>Account</span><input style={fieldStyle} value={budget.account} onChange={e=>setBudget({...budget,account:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>{scenario} Amount</span><input type="number" step="0.01" style={fieldStyle} value={budget.amount} onChange={e=>setBudget({...budget,amount:e.target.value})}/></label>
      <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={budget.description} onChange={e=>setBudget({...budget,description:e.target.value})}/></label>
    </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void saveBudget()}>Save {scenario} Line</button>
    <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Account</th><th>{scenario}</th><th>Actual</th><th>Variance</th><th>Variance %</th><th>Status</th></tr></thead><tbody>{variance.map((x:any)=><tr key={x.account}><td>{x.account}</td><td>{fmtMoney(x.budget,x.currency)}</td><td>{fmtMoney(x.actual,x.currency)}</td><td>{fmtMoney(x.variance,x.currency)}</td><td>{x.variancePct==null?'-':`${Number(x.variancePct).toFixed(2)}%`}</td><td><span className="status">{x.status}</span></td></tr>)}{variance.length===0&&<tr><td colSpan={6}>No {scenario.toLowerCase()} or actual activity for this view.</td></tr>}</tbody></table></div></div>
  </WorkspaceShell>;
}
