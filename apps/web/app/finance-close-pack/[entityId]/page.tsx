'use client';

import {useEffect,useState} from 'react';
import {useParams,useSearchParams} from 'next/navigation';
import WorkspaceShell,{fieldStyle,sectionTitle} from '../../../components/WorkspaceShell';
import {api,fmtMoney,requireToken} from '../../../lib/api';

export default function EntityClosePackPage(){
  const params=useParams(),search=useSearchParams(),entityId=String(params.entityId||''),period=search.get('period')||new Date().toISOString().slice(0,7);
  const [token,setToken]=useState('');const [data,setData]=useState<any>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[entityId,period]);
  async function load(t=token){if(!t)return;setBusy(true);try{setData(await api(`/finance-close-pack/entity/${encodeURIComponent(entityId)}/${period}`,t));}catch(e:any){setMessage(e.message||'Unable to load entity close pack.');}finally{setBusy(false);}}
  async function post(path:string,body:any){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body)});await load();}catch(e:any){setMessage(e.message||'Action failed.');}finally{setBusy(false);}}
  if(!data)return <WorkspaceShell title="Entity Close Pack" subtitle={message||'Loading...'} active="/finance-close-pack"><div className="card">{busy?'Loading...':message}</div></WorkspaceShell>;
  return <WorkspaceShell title={`${data.entityCode} Close Pack · ${period}`} subtitle="Balance-sheet reconciliation and close evidence" active="/finance-close-pack" actions={<a className="btn" href="/finance-close-pack">Back</a>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">READY</div><div className="kpi">{data.ready?'YES':'NO'}</div></div><div className="card"><div className="sub">BLOCKERS</div><div className="kpi">{data.blockers.length}</div></div><div className="card"><div className="sub">SIGN-OFF</div><div className="kpi">{data.signoff.status}</div></div></div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Balance Sheet Reconciliation</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Account</th><th>Class</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.reconciliations.map((x:any)=><tr key={`${x.currency}-${x.account}`}><td>{x.account}</td><td>{x.class}</td><td>{fmtMoney(x.balance,x.currency)}</td><td><span className="status">{x.status}</span></td><td>{x.status!=='RECONCILED'&&<button className="btn" disabled={busy} onClick={()=>void post(`/finance-close-pack/reconciliations/${entityId}/${period}`,{account:x.account,status:'RECONCILED',sourceReference:'Close pack review'})}>Mark Reconciled</button>}</td></tr>)}{!data.reconciliations.length&&<tr><td colSpan={5}>No balance-sheet accounts for this period.</td></tr>}</tbody></table></div></div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Suspense / Unallocated Balances</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Account</th><th>Balance</th><th>Resolved</th><th></th></tr></thead><tbody>{data.suspense.map((x:any)=><tr key={x.account}><td>{x.account}</td><td>{fmtMoney(x.balance,x.currency)}</td><td>{x.resolved?'YES':'NO'}</td><td>{!x.resolved&&<button className="btn" disabled={busy} onClick={()=>{const reason=window.prompt('Resolution reason','Cleared during close review');if(reason)void post(`/finance-close-pack/suspense/${entityId}/${period}/resolve`,{account:x.account,reason});}}>Resolve</button>}</td></tr>)}{!data.suspense.length&&<tr><td colSpan={4}>No suspense balances.</td></tr>}</tbody></table></div></div>
    <div className="card"><h3 style={sectionTitle}>Aged AP Exceptions</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Invoice</th><th>Vendor</th><th>Days</th><th>Balance</th></tr></thead><tbody>{data.agedAP.map((x:any)=><tr key={x.invoiceNo}><td>{x.invoiceNo}</td><td>{x.partyName||'-'}</td><td>{x.daysOverdue}</td><td>{fmtMoney(x.balance,x.currency)}</td></tr>)}{!data.agedAP.length&&<tr><td colSpan={4}>No aged AP exceptions.</td></tr>}</tbody></table></div></div>
  </WorkspaceShell>;
}
