'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

const monthNow=()=>new Date().toISOString().slice(0,7);
const nice=(value:any)=>String(value||'').split('_').join(' ');

export default function FinanceReportingPage(){
  const [token,setToken]=useState('');
  const [period,setPeriod]=useState(monthNow());
  const [candidates,setCandidates]=useState<any[]>([]);
  const [statements,setStatements]=useState<any[]>([]);
  const [close,setClose]=useState<any>(null);
  const [journals,setJournals]=useState<any[]>([]);
  const [account,setAccount]=useState('1100-ACCOUNTS-RECEIVABLE');
  const [ledger,setLedger]=useState<any[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,monthNow());},[]);

  async function load(t:string,p:string){
    setBusy(true);setMessage('');
    try{
      const results=await Promise.all([
        api('/finance-reporting/posting-candidates',t),
        api(`/finance-reporting/statements?period=${encodeURIComponent(p)}`,t),
        api(`/finance-reporting/close-readiness/${encodeURIComponent(p)}`,t),
        api(`/finance-reporting/journals?period=${encodeURIComponent(p)}`,t)
      ]);
      setCandidates(Array.isArray(results[0])?results[0]:[]);
      setStatements(Array.isArray(results[1])?results[1]:[]);
      setClose(results[2]||null);
      setJournals(Array.isArray(results[3])?results[3]:[]);
    }catch(e:any){setMessage(e?.message||'Unable to load financial posting and reporting.');}
    finally{setBusy(false);}
  }

  async function run(path:string,body?:any){
    setBusy(true);setMessage('');
    try{
      await api(path,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});
      setMessage('Finance control updated successfully.');
      await load(token,period);
    }catch(e:any){setMessage(e?.message||'Finance action failed.');}
    finally{setBusy(false);}
  }

  async function reverse(row:any){
    const reason=window.prompt(`Reason for reversing ${row.journalNo}:`,'Correction');
    if(reason===null)return;
    await run(`/finance-reporting/journals/${encodeURIComponent(row.journalNo)}/reverse`,{reason,reversalDate:new Date().toISOString()});
  }

  async function loadLedger(){
    if(!account.trim())return;setBusy(true);setMessage('');
    try{
      const rows=await api(`/finance-reporting/account-ledger?account=${encodeURIComponent(account.trim())}&period=${encodeURIComponent(period)}`,token);
      setLedger(Array.isArray(rows)?rows:[]);
    }catch(e:any){setMessage(e?.message||'Unable to load account ledger.');}
    finally{setBusy(false);}
  }

  const periodCandidates=candidates.filter((x:any)=>x.period===period);

  return <WorkspaceShell title="Financial Posting / Reporting" subtitle="Subledger-to-GL posting, statements, reversals and month-end close readiness" active="/finance-reporting" actions={<button className="btn" disabled={busy} onClick={()=>void load(token,period)}>{busy?'Working…':'Refresh'}</button>}>
    {message?<div className="card" style={{marginBottom:12}}>{message}</div>:null}

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
        <label style={{minWidth:190}}><span style={labelStyle}>Reporting Period</span><input type="month" style={fieldStyle} value={period} onChange={e=>{const p=e.target.value;setPeriod(p);void load(token,p);}}/></label>
        <span className="status">Period: {close?.status||'OPEN'}</span>
        <span className="status">{close?.ready?'CLOSE READY':'CLOSE BLOCKED'}</span>
      </div>
    </div>

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">UNPOSTED SUBLEDGER</div><div className="kpi">{close?.unpostedSubledgerCount||0}</div></div>
      <div className="card"><div className="sub">DRAFT JOURNALS</div><div className="kpi">{close?.draftJournalCount||0}</div></div>
      <div className="card"><div className="sub">UNMATCHED BANK</div><div className="kpi">{close?.unmatchedBankCount||0}</div></div>
      <div className="card"><div className="sub">PERIOD JOURNALS</div><div className="kpi">{journals.length}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Subledger → GL Posting Queue</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Date</th><th>Invoice</th><th>Party</th><th>Amount</th><th>Action</th></tr></thead><tbody>
        {periodCandidates.map((row:any)=><tr key={row.reference}><td><b>{nice(row.kind)}</b></td><td>{fmtDate(row.date)}</td><td>{row.invoiceNo}</td><td>{row.partyName||'-'}</td><td>{fmtMoney(row.amount,row.currency)}</td><td><button className="btn" disabled={busy} onClick={()=>void run(row.actionPath)}>Post to GL</button></td></tr>)}
        {periodCandidates.length===0?<tr><td colSpan={6}>No unposted accounting transactions for {period}.</td></tr>:null}
      </tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Financial Statements</h3>
      {statements.map((row:any)=><div key={row.currency} style={{marginBottom:18}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}><span className="status"><b>{row.currency}</b></span><span className="status">Balance check: {fmtMoney(row.balanceCheck,row.currency)}</span></div>
        <div className="grid" style={{marginBottom:10}}>
          <div className="card"><div className="sub">REVENUE</div><div className="kpi">{fmtMoney(row.revenue,row.currency)}</div></div>
          <div className="card"><div className="sub">EXPENSES</div><div className="kpi">{fmtMoney(row.expenses,row.currency)}</div></div>
          <div className="card"><div className="sub">NET PROFIT</div><div className="kpi">{fmtMoney(row.netProfit,row.currency)}</div></div>
          <div className="card"><div className="sub">ASSETS</div><div className="kpi">{fmtMoney(row.assets,row.currency)}</div></div>
          <div className="card"><div className="sub">LIABILITIES</div><div className="kpi">{fmtMoney(row.liabilities,row.currency)}</div></div>
          <div className="card"><div className="sub">EQUITY + PROFIT</div><div className="kpi">{fmtMoney(row.equityWithCurrentProfit,row.currency)}</div></div>
        </div>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
          {(row.accounts||[]).map((a:any)=><tr key={a.account}><td><b>{a.account}</b></td><td>{fmtMoney(a.debit,row.currency)}</td><td>{fmtMoney(a.credit,row.currency)}</td><td>{fmtMoney(a.balance,row.currency)}</td></tr>)}
        </tbody></table></div>
      </div>)}
      {statements.length===0?<div className="sub">No posted GL activity for {period}.</div>:null}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Month-End Close Readiness</h3>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}><span className="status">{close?.draftJournalCount||0} draft journals</span><span className="status">{close?.unpostedSubledgerCount||0} unposted subledger</span><span className="status">{close?.unmatchedBankCount||0} unmatched bank</span></div>
      {Array.isArray(close?.unmatchedBank)&&close.unmatchedBank.length>0?<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Bank Ref</th><th>Date</th><th>Amount</th><th>Remaining</th></tr></thead><tbody>{close.unmatchedBank.map((b:any)=><tr key={b.transactionId}><td>{b.bankReference}</td><td>{fmtDate(b.bookedAt)}</td><td>{fmtMoney(b.amount,b.currency)}</td><td>{fmtMoney(b.remainingAmount,b.currency)}</td></tr>)}</tbody></table></div>:null}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>Journal Register / Reversal Control</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Journal</th><th>Date</th><th>Description</th><th>Reference</th><th>Amount</th><th>Action</th></tr></thead><tbody>
        {journals.map((row:any)=><tr key={row.journalNo}><td><b>{row.journalNo}</b></td><td>{fmtDate(row.journalDate)}</td><td>{row.description||'-'}</td><td>{row.reference||'-'}</td><td>{fmtMoney(row.totalDebit,row.currency)}</td><td>{row.reversalJournalNo?<span className="status">Reversed by {row.reversalJournalNo}</span>:row.status==='POSTED'&&row.source!=='REVERSAL'?<button className="btn" disabled={busy||close?.status==='CLOSED'} onClick={()=>void reverse(row)}>Reverse</button>:<span className="status">{row.status}</span>}</td></tr>)}
        {journals.length===0?<tr><td colSpan={6}>No journals in {period}.</td></tr>:null}
      </tbody></table></div>
    </div>

    <div className="card">
      <h3 style={sectionTitle}>Account Ledger</h3>
      <div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap',marginBottom:10}}><label style={{minWidth:280,flex:'1 1 280px'}}><span style={labelStyle}>GL Account</span><input style={fieldStyle} value={account} onChange={e=>setAccount(e.target.value)}/></label><button className="btn" disabled={busy||!account.trim()} onClick={()=>void loadLedger()}>Load Ledger</button></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Date</th><th>Journal</th><th>Description</th><th>Debit</th><th>Credit</th><th>Running Balance</th></tr></thead><tbody>
        {ledger.map((row:any,index:number)=><tr key={`${row.journalNo}-${index}`}><td>{fmtDate(row.journalDate)}</td><td>{row.journalNo}</td><td>{row.description||'-'}</td><td>{fmtMoney(row.debit,row.currency)}</td><td>{fmtMoney(row.credit,row.currency)}</td><td>{fmtMoney(row.runningBalance,row.currency)}</td></tr>)}
        {ledger.length===0?<tr><td colSpan={6}>Load an account to view its ledger for {period}.</td></tr>:null}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
