'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

const currentPeriod=()=>new Date().toISOString().slice(0,7);

export default function StatutoryFinancePage(){
  const [token,setToken]=useState('');
  const [period,setPeriod]=useState(currentPeriod());
  const [groupCurrency,setGroupCurrency]=useState('USD');
  const [entities,setEntities]=useState<any[]>([]);
  const [branches,setBranches]=useState<any[]>([]);
  const [preview,setPreview]=useState<any[]>([]);
  const [intercompany,setIntercompany]=useState<any[]>([]);
  const [cashFlow,setCashFlow]=useState<any>(null);
  const [closes,setCloses]=useState<any[]>([]);
  const [dashboard,setDashboard]=useState<any>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [entityForm,setEntityForm]=useState<any>({entityId:'',entityCode:'',entityName:'',countryCode:'AE',registrationNo:'',taxRegistrationNo:'',localCurrency:'AED',groupCurrency:'USD',fiscalYearStartMonth:1,ownershipPct:100,branchIds:[]});
  const [exposureForm,setExposureForm]=useState<any>({legalEntityId:'',account:'1100-ACCOUNTS-RECEIVABLE',monetaryType:'ASSET',foreignCurrency:'USD',foreignAmount:'',carryingAmountLocal:'',description:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,currentPeriod(),'USD');},[]);

  async function load(t=token,p=period,g=groupCurrency){
    if(!t)return;setBusy(true);setMessage('');
    try{
      const [e,b,r,i,c,cl,d]=await Promise.all([
        api('/statutory-finance/legal-entities',t),api('/statutory-finance/branches',t),api(`/statutory-finance/fx-revaluation-preview?period=${encodeURIComponent(p)}`,t),api(`/statutory-finance/intercompany-reconciliation?period=${encodeURIComponent(p)}`,t),api(`/statutory-finance/cash-flow?period=${encodeURIComponent(p)}&groupCurrency=${encodeURIComponent(g)}`,t),api(`/statutory-finance/closes?period=${encodeURIComponent(p)}`,t),api(`/statutory-finance/dashboard?period=${encodeURIComponent(p)}&groupCurrency=${encodeURIComponent(g)}`,t)
      ]);
      setEntities(Array.isArray(e)?e:[]);setBranches(Array.isArray(b)?b:[]);setPreview(Array.isArray(r)?r:[]);setIntercompany(Array.isArray(i)?i:[]);setCashFlow(c||null);setCloses(Array.isArray(cl)?cl:[]);setDashboard(d||null);
    }catch(err:any){setMessage(err.message||'Unable to load statutory finance.');}finally{setBusy(false);}
  }

  async function post(path:string,body:any,success:string){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body)});setMessage(success);await load();}catch(err:any){setMessage(err.message||'Finance action failed.');}finally{setBusy(false);}}

  async function saveEntity(){
    if(!entityForm.entityCode||!entityForm.entityName||!entityForm.branchIds.length){setMessage('Entity code, name and at least one branch are required.');return;}
    const path=entityForm.entityId?`/statutory-finance/legal-entities/${encodeURIComponent(entityForm.entityId)}`:'/statutory-finance/legal-entities';
    await post(path,entityForm,entityForm.entityId?'Legal entity updated.':'Legal entity created.');
    setEntityForm({entityId:'',entityCode:'',entityName:'',countryCode:'AE',registrationNo:'',taxRegistrationNo:'',localCurrency:'AED',groupCurrency:'USD',fiscalYearStartMonth:1,ownershipPct:100,branchIds:[]});
  }

  function editEntity(row:any){setEntityForm({entityId:row.entityId,entityCode:row.entityCode,entityName:row.entityName,countryCode:row.countryCode||'',registrationNo:row.registrationNo||'',taxRegistrationNo:row.taxRegistrationNo||'',localCurrency:row.localCurrency||'USD',groupCurrency:row.groupCurrency||'USD',fiscalYearStartMonth:row.fiscalYearStartMonth||1,ownershipPct:row.ownershipPct||100,branchIds:Array.isArray(row.branchIds)?row.branchIds:[]});window.scrollTo({top:0,behavior:'smooth'});}

  async function saveExposure(){if(!exposureForm.legalEntityId||!exposureForm.account||!exposureForm.foreignCurrency){setMessage('Legal entity, account and foreign currency are required.');return;}await post('/statutory-finance/fx-exposures',{...exposureForm,period,foreignAmount:Number(exposureForm.foreignAmount),carryingAmountLocal:Number(exposureForm.carryingAmountLocal)},'FX exposure saved.');setExposureForm({...exposureForm,foreignAmount:'',carryingAmountLocal:'',description:''});}

  async function settle(row:any){const amount=window.prompt(`Settlement amount for ${row.transactionNo} (${row.currency})`,String(row.remainingAmount||0));if(amount===null)return;const bankReference=window.prompt('Bank/reference number','')||'';await post(`/statutory-finance/intercompany/${encodeURIComponent(row.transactionNo)}/settlements`,{amount:Number(amount),bankReference,settlementDate:new Date().toISOString()},`Settlement recorded for ${row.transactionNo}.`);}

  async function setClose(row:any,status:string){const note=window.prompt(`${status} note for ${row.entityCode}`,'')||'';await post(`/statutory-finance/closes/${encodeURIComponent(row.entityId)}/${encodeURIComponent(period)}`,{status,note},`${row.entityCode} close status set to ${status}.`);}

  const availableBranches=useMemo(()=>branches.filter((b:any)=>!b.legalEntityId||b.legalEntityId===entityForm.entityId),[branches,entityForm.entityId]);
  const cf=cashFlow?.total||{};

  return <WorkspaceShell title="Statutory Finance / Entity Close" subtitle="Legal entities, FX revaluation, intercompany settlement, cash flow and statutory close certification" active="/statutory-finance" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
      <label style={{minWidth:180}}><span style={labelStyle}>Reporting Period</span><input type="month" style={fieldStyle} value={period} onChange={e=>{setPeriod(e.target.value);void load(token,e.target.value,groupCurrency);}}/></label>
      <label style={{minWidth:150}}><span style={labelStyle}>Group Currency</span><input style={fieldStyle} maxLength={3} value={groupCurrency} onChange={e=>setGroupCurrency(e.target.value.toUpperCase())} onBlur={()=>void load(token,period,groupCurrency)}/></label>
    </div></div>

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">LEGAL ENTITIES</div><div className="kpi">{dashboard?.legalEntityCount||0}</div></div>
      <div className="card"><div className="sub">PENDING FX REVALUATIONS</div><div className="kpi">{dashboard?.pendingRevaluations||0}</div></div>
      <div className="card"><div className="sub">OPEN INTERCOMPANY</div><div className="kpi">{dashboard?.openIntercompany||0}</div></div>
      <div className="card"><div className="sub">CLOSE READY / CERTIFIED</div><div className="kpi">{dashboard?.closeReadyEntities||0} / {dashboard?.certifiedEntities||0}</div></div>
      <div className="card"><div className="sub">CLOSING CASH</div><div className="kpi">{fmtMoney(dashboard?.closingCash||0,groupCurrency)}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Legal Entity Master</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Entity Code</span><input style={fieldStyle} value={entityForm.entityCode} onChange={e=>setEntityForm({...entityForm,entityCode:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Entity Name</span><input style={fieldStyle} value={entityForm.entityName} onChange={e=>setEntityForm({...entityForm,entityName:e.target.value})}/></label>
        <label><span style={labelStyle}>Country</span><input style={fieldStyle} maxLength={2} value={entityForm.countryCode} onChange={e=>setEntityForm({...entityForm,countryCode:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Registration No.</span><input style={fieldStyle} value={entityForm.registrationNo} onChange={e=>setEntityForm({...entityForm,registrationNo:e.target.value})}/></label>
        <label><span style={labelStyle}>Tax Registration No.</span><input style={fieldStyle} value={entityForm.taxRegistrationNo} onChange={e=>setEntityForm({...entityForm,taxRegistrationNo:e.target.value})}/></label>
        <label><span style={labelStyle}>Local Currency</span><input style={fieldStyle} maxLength={3} value={entityForm.localCurrency} onChange={e=>setEntityForm({...entityForm,localCurrency:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Group Currency</span><input style={fieldStyle} maxLength={3} value={entityForm.groupCurrency} onChange={e=>setEntityForm({...entityForm,groupCurrency:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Fiscal Year Start Month</span><input type="number" min={1} max={12} style={fieldStyle} value={entityForm.fiscalYearStartMonth} onChange={e=>setEntityForm({...entityForm,fiscalYearStartMonth:Number(e.target.value)})}/></label>
        <label><span style={labelStyle}>Ownership %</span><input type="number" min={0.01} max={100} step="0.01" style={fieldStyle} value={entityForm.ownershipPct} onChange={e=>setEntityForm({...entityForm,ownershipPct:Number(e.target.value)})}/></label>
        <label style={{gridColumn:'1 / -1'}}><span style={labelStyle}>Assigned Branches</span><select multiple style={{...fieldStyle,minHeight:110}} value={entityForm.branchIds} onChange={e=>setEntityForm({...entityForm,branchIds:Array.from(e.target.selectedOptions).map(o=>o.value)})}>{availableBranches.map((b:any)=><option key={b.id} value={b.id}>{b.code} · {b.name} · {b.countryCode}</option>)}</select></label>
      </div>
      <div style={{display:'flex',gap:8,marginTop:10}}><button className="btn" disabled={busy} onClick={()=>void saveEntity()}>{entityForm.entityId?'Update Entity':'Create Entity'}</button>{entityForm.entityId&&<button className="btn" onClick={()=>setEntityForm({entityId:'',entityCode:'',entityName:'',countryCode:'AE',registrationNo:'',taxRegistrationNo:'',localCurrency:'AED',groupCurrency:'USD',fiscalYearStartMonth:1,ownershipPct:100,branchIds:[]})}>Cancel Edit</button>}</div>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Entity</th><th>Country</th><th>Registration</th><th>Tax No.</th><th>Currency</th><th>Branches</th><th>FY Start</th><th>Ownership</th><th></th></tr></thead><tbody>{entities.map((e:any)=><tr key={e.entityId}><td><b>{e.entityCode}</b><div className="sub">{e.entityName}</div></td><td>{e.countryCode}</td><td>{e.registrationNo||'-'}</td><td>{e.taxRegistrationNo||'-'}</td><td>{e.localCurrency} → {e.groupCurrency}</td><td>{(e.branches||[]).map((b:any)=>b.code).join(', ')||'-'}</td><td>{e.fiscalYearStartMonth}</td><td>{e.ownershipPct}%</td><td><button className="btn" onClick={()=>editEntity(e)}>Edit</button></td></tr>)}{entities.length===0&&<tr><td colSpan={9}>No legal entities configured.</td></tr>}</tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>FX Revaluation Workbench</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Legal Entity</span><select style={fieldStyle} value={exposureForm.legalEntityId} onChange={e=>setExposureForm({...exposureForm,legalEntityId:e.target.value})}><option value="">Select</option>{entities.filter((x:any)=>x.active!==false).map((e:any)=><option key={e.entityId} value={e.entityId}>{e.entityCode} · {e.localCurrency}</option>)}</select></label>
        <label><span style={labelStyle}>Monetary Account</span><input style={fieldStyle} value={exposureForm.account} onChange={e=>setExposureForm({...exposureForm,account:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={exposureForm.monetaryType} onChange={e=>setExposureForm({...exposureForm,monetaryType:e.target.value})}><option>ASSET</option><option>LIABILITY</option></select></label>
        <label><span style={labelStyle}>Foreign Currency</span><input style={fieldStyle} maxLength={3} value={exposureForm.foreignCurrency} onChange={e=>setExposureForm({...exposureForm,foreignCurrency:e.target.value.toUpperCase()})}/></label>
        <label><span style={labelStyle}>Foreign Amount</span><input type="number" step="0.01" style={fieldStyle} value={exposureForm.foreignAmount} onChange={e=>setExposureForm({...exposureForm,foreignAmount:e.target.value})}/></label>
        <label><span style={labelStyle}>Carrying Amount · Local</span><input type="number" step="0.01" style={fieldStyle} value={exposureForm.carryingAmountLocal} onChange={e=>setExposureForm({...exposureForm,carryingAmountLocal:e.target.value})}/></label>
        <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={exposureForm.description} onChange={e=>setExposureForm({...exposureForm,description:e.target.value})}/></label>
      </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void saveExposure()}>Add FX Exposure</button>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Exposure</th><th>Entity</th><th>Account</th><th>Foreign</th><th>Carrying</th><th>Closing Rate</th><th>Target</th><th>Adjustment</th><th>Status</th><th></th></tr></thead><tbody>{preview.map((r:any)=><tr key={r.exposureId}><td>{r.exposureId}</td><td>{r.entityCode}</td><td>{r.account}<div className="sub">{r.monetaryType}</div></td><td>{fmtMoney(r.foreignAmount,r.foreignCurrency)}</td><td>{fmtMoney(r.carryingAmountLocal,r.localCurrency)}</td><td>{r.closingRate==null?'-':Number(r.closingRate).toFixed(6)}</td><td>{r.targetLocal==null?'-':fmtMoney(r.targetLocal,r.localCurrency)}</td><td>{r.adjustment==null?'-':fmtMoney(r.adjustment,r.localCurrency)}</td><td><span className="status">{r.status}</span></td><td>{r.status==='PENDING'?<button className="btn" disabled={busy} onClick={()=>void post(`/statutory-finance/fx-exposures/${encodeURIComponent(r.exposureId)}/revalue`,{},`FX revaluation posted for ${r.exposureId}.`)}>Post Revaluation</button>:'-'}</td></tr>)}{preview.length===0&&<tr><td colSpan={10}>No FX exposures for {period}.</td></tr>}</tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Intercompany Settlement / Reconciliation</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Transaction</th><th>From / To</th><th>Amount</th><th>Settled</th><th>Remaining</th><th>Status</th><th></th></tr></thead><tbody>{intercompany.map((r:any)=><tr key={r.transactionNo}><td><b>{r.transactionNo}</b><div className="sub">{fmtDate(r.transactionDate)}</div></td><td>{r.fromEntityCode} → {r.toEntityCode}</td><td>{fmtMoney(r.amount,r.currency)}</td><td>{fmtMoney(r.settledAmount,r.currency)}</td><td>{fmtMoney(r.remainingAmount,r.currency)}</td><td><span className="status">{r.reconciliationStatus}</span></td><td>{r.remainingAmount>0?<button className="btn" disabled={busy} onClick={()=>void settle(r)}>Record Settlement</button>:'-'}</td></tr>)}{intercompany.length===0&&<tr><td colSpan={7}>No posted intercompany transactions for {period}.</td></tr>}</tbody></table></div></div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Consolidated Cash Flow · {groupCurrency}</h3>
      <div className="grid" style={{marginBottom:10}}><div className="card"><div className="sub">OPERATING</div><div className="kpi">{fmtMoney(cf.operating||0,groupCurrency)}</div></div><div className="card"><div className="sub">INVESTING</div><div className="kpi">{fmtMoney(cf.investing||0,groupCurrency)}</div></div><div className="card"><div className="sub">FINANCING</div><div className="kpi">{fmtMoney(cf.financing||0,groupCurrency)}</div></div><div className="card"><div className="sub">FX EFFECT</div><div className="kpi">{fmtMoney(cf.fxEffect||0,groupCurrency)}</div></div><div className="card"><div className="sub">CLOSING CASH</div><div className="kpi">{fmtMoney(cf.closingCash||0,groupCurrency)}</div></div></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Entity</th><th>Opening</th><th>Operating</th><th>Investing</th><th>Financing</th><th>FX Effect</th><th>Closing</th></tr></thead><tbody>{(cashFlow?.perEntity||[]).map((r:any)=><tr key={r.legalEntityId}><td><b>{r.entityCode}</b><div className="sub">{r.entityName}</div></td><td>{fmtMoney(r.openingCash,groupCurrency)}</td><td>{fmtMoney(r.operating,groupCurrency)}</td><td>{fmtMoney(r.investing,groupCurrency)}</td><td>{fmtMoney(r.financing,groupCurrency)}</td><td>{fmtMoney(r.fxEffect,groupCurrency)}</td><td>{fmtMoney(r.closingCash,groupCurrency)}</td></tr>)}{(!cashFlow?.perEntity||cashFlow.perEntity.length===0)&&<tr><td colSpan={7}>No cash-flow activity available for {period}.</td></tr>}</tbody></table></div>
      {(cashFlow?.exceptions||[]).length>0&&<div className="sub" style={{marginTop:8}}>{cashFlow.exceptions.length} cash-flow translation exception(s) require FX-rate review.</div>}
    </div>

    <div className="card"><h3 style={sectionTitle}>Statutory Entity Close Certification</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Entity</th><th>Global Period</th><th>Readiness</th><th>Blockers</th><th>Close Status</th><th>Actions</th></tr></thead><tbody>{closes.map((r:any)=><tr key={r.entityId}><td><b>{r.entityCode}</b><div className="sub">{r.entityName}</div></td><td>{period}</td><td><span className="status">{r.ready?'READY':'BLOCKED'}</span></td><td>{(r.blockers||[]).length?(r.blockers||[]).map((b:any)=>b.type).join(', '):'-'}</td><td><span className="status">{r.status}</span></td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{r.status!=='REVIEW'&&<button className="btn" disabled={busy} onClick={()=>void setClose(r,'REVIEW')}>Review</button>}{r.status!=='CERTIFIED'&&<button className="btn" disabled={busy||!r.ready} onClick={()=>void setClose(r,'CERTIFIED')}>Certify</button>}{r.status!=='OPEN'&&<button className="btn" disabled={busy} onClick={()=>void setClose(r,'OPEN')}>Reopen</button>}</div></td></tr>)}{closes.length===0&&<tr><td colSpan={6}>Configure legal entities to start statutory close control.</td></tr>}</tbody></table></div></div>
  </WorkspaceShell>;
}
