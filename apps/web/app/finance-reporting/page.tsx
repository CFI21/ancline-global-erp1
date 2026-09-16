'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Candidate={kind:string;reference:string;sourceEventId:string;invoiceNo:string;date:string;period:string;currency:string;amount:number;partyName?:string;actionPath:string};
type Statement={currency:string;revenue:number;expenses:number;netProfit:number;assets:number;liabilities:number;equity:number;equityWithCurrentProfit:number;balanceCheck:number;accounts:Array<{account:string;debit:number;credit:number;balance:number}>};
type Close={period:string;status:string;ready:boolean;draftJournalCount:number;unpostedSubledgerCount:number;unmatchedBankCount:number;unmatchedBank:any[]};
type Journal={journalNo:string;journalDate:string;period:string;currency:string;description?:string;reference?:string;source?:string;status:string;totalDebit:number;totalCredit:number;reversalJournalNo?:string};
type LedgerRow={journalNo:string;journalDate:string;period:string;currency:string;reference?:string;description?:string;debit:number;credit:number;runningBalance:number};

const currentPeriod=()=>new Date().toISOString().slice(0,7);

export default function FinanceReportingPage(){
  const [token,setToken]=useState('');
  const [period,setPeriod]=useState(currentPeriod());
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [statements,setStatements]=useState<Statement[]>([]);
  const [close,setClose]=useState<Close|null>(null);
  const [journals,setJournals]=useState<Journal[]>([]);
  const [account,setAccount]=useState('1100-ACCOUNTS-RECEIVABLE');
  const [ledger,setLedger]=useState<LedgerRow[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,currentPeriod());},[]);

  async function load(t=token,p=period){
    if(!t)return;setBusy(true);setMessage('');
    try{
      const [c,s,r,j]=await Promise.all([
        api('/finance-reporting/posting-candidates',t),
        api(`/finance-reporting/statements?period=${encodeURIComponent(p)}`,t),
        api(`/finance-reporting/close-readiness/${encodeURIComponent(p)}`,t),
        api(`/finance-reporting/journals?period=${encodeURIComponent(p)}`,t)
      ]);
      setCandidates(Array.isArray(c)?c:[]);setStatements(Array.isArray(s)?s:[]);setClose(r||null);setJournals(Array.isArray(j)?j:[]);
    }catch(e:any){setMessage(e.message||'Unable to load financial reporting.');}finally{setBusy(false);}
  }

  async function run(path:string,success:string,body?:any){
    setBusy(true);setMessage('');
    try{await api(path,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});setMessage(success);await load(token,period);}
    catch(e:any){setMessage(e.message||'Finance action failed.');}finally{setBusy(false);}
  }

  async function postCandidate(row:Candidate){await run(row.actionPath,`${row.kind.replaceAll('_',' ')} posted to GL.`);}
  async function reverseJournal(row:Journal){
    const reason=window.prompt(`Reason for reversing ${row.journalNo}:`,'Correction');if(reason===null)return;
    await run(`/finance-reporting/journals/${encodeURIComponent(row.journalNo)}/reverse`,`Reversal posted for ${row.journalNo}.`,{reason,reversalDate:new Date().toISOString()});
  }
  async function loadLedger(){
    if(!account.trim())return;setBusy(true);setMessage('');
    try{const rows=await api(`/finance-reporting/account-ledger?account=${encodeURIComponent(account.trim())}&period=${encodeURIComponent(period)}`,token);setLedger(Array.isArray(rows)?rows:[]);}
    catch(e:any){setMessage(e.message||'Unable to load account ledger.');}finally{setBusy(false);}
  }

  const periodCandidates=useMemo(()=>candidates.filter(x=>x.period===period),[candidates,period]);
  const candidateAmountByCurrency=useMemo(()=>{
    const map=new Map<string,number>();for(const row of periodCandidates)map.set(row.currency,(map.get(row.currency)||0)+Number(row.amount||0));return Array.from(map.entries());
  },[periodCandidates]);

  return <WorkspaceShell title="Financial Posting / Reporting" subtitle="Subledger-to-GL posting, financial statements, account ledger, reversals and month-end close readiness" active="/finance-reporting" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
      <label style={{minWidth:180}}><span style={labelStyle}>Reporting Period</span><input type="month" style={fieldStyle} value={period} onChange={e=>{setPeriod(e.target.value);void load(token,e.target.value);}}/></label>
      <span className="status">Period: {close?.status||'OPEN'}</span>
      <span className="status">{close?.ready?'CLOSE READY':'CLOSE BLOCKED'}</span>
    </div></div>

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">UNPOSTED SUBLEDGER</div><div className="kpi">{close?.unpostedSubledgerCount||0}</div></div>
      <div className="card"><div className="sub">DRAFT JOURNALS</div><div className="kpi">{close?.draftJournalCount||0}</div></div>
      <div className="card"><div className="sub">UNMATCHED BANK ITEMS</div><div className="kpi">{close?.unmatchedBankCount||0}</div></div>
      <div className="card"><div className="sub">POSTED JOURNALS · PERIOD</div><div className="kpi">{journals.filter(x=>x.status==='POSTED').length}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Subledger → GL Posting Queue</h3>
      {candidateAmountByCurrency.length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>{candidateAmountByCurrency.map(([currency,value])=><span className="status" key={currency}>{currency} pending: {fmtMoney(value,currency)}</span>)}</div>}
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Date</th><th>Invoice</th><th>Party</th><th>Amount</th><th>Reference</th><th>Action</th></tr></thead><tbody>
        {periodCandidates.map(row=><tr key={row.reference}><td><b>{row.kind.replaceAll('_',' ')}</b></td><td>{fmtDate(row.date)}</td><td>{row.invoiceNo}</td><td>{row.partyName||'-'}</td><td>{fmtMoney(row.amount,row.currency)}</td><td>{row.reference}</td><td><button className="btn" disabled={busy} onClick={()=>void postCandidate(row)}>Post to GL</button></td></tr>)}
        {periodCandidates.length===0&&<tr><td colSpan={7}>No unposted accounting transactions for {period}.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Financial Statements</h3>
      {statements.length===0&&<div className="sub">No posted ledger activity for this period.</div>}
      {statements.map(row=><div key={row.currency} style={{marginBottom:18}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}><span className="status"><b>{row.currency}</b></span><span className="status">Balance check: {fmtMoney(row.balanceCheck,row.currency)}</span></div>
        <div className="grid" style={{marginBottom:10}}>
          <div className="card"><div className="sub">REVENUE</div><div className="kpi">{fmtMoney(row.revenue,row.currency)}</div></div>
          <div className="card"><div className="sub">EXPENSES</div><div className="kpi">{fmtMoney(row.expenses,row.currency)}</div></div>
          <div className="card"><div className="sub">NET PROFIT</div><div className="kpi">{fmtMoney(row.netProfit,row.currency)}</div></div>
          <div className="card"><div className="sub">ASSETS</div><div className="kpi">{fmtMoney(row.assets,row.currency)}</div></div>
          <div className="card"><div className="sub">LIABILITIES</div><div className="kpi">{fmtMoney(row.liabilities,row.currency)}</div></div>
          <div className="card"><div className="sub">EQUITY + CURRENT PROFIT</div><div className="kpi">{fmtMoney(row.equityWithCurrentProfit,row.currency)}</div></div>
        </div>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{row.accounts.map(a=><tr key={a.account}><td><b>{a.account}</b></td><td>{fmtMoney(a.debit,row.currency)}</td><td>{fmtMoney(a.credit,row.currency)}</td><td>{fmtMoney(a.balance,row.currency)}</td></tr>)}</tbody></table></div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Month-End Close Readiness</h3>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
        <span className="status">{close?.draftJournalCount||0} draft journals</span>
        <span className="status">{close?.unpostedSubledgerCount||0} unposted subledger items</span>
        <span className="status">{close?.unmatchedBankCount||0} unmatched bank items</span>
      </div>
      {close?.unmatchedBank?.length>0&&<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Bank Ref</th><th>Date</th><th>Amount</th><th>Matched</th><th>Remaining</th></tr></thead><tbody>{close.unmatchedBank.map((b:any)=><tr key={b.transactionId}><td>{b.bankReference}</td><td>{fmtDate(b.bookedAt)}</td><td>{fmtMoney(b.amount,b.currency)}</td><td>{fmtMoney(b.matchedAmount,b.currency)}</td><td>{fmtMoney(b.remainingAmount,b.currency)}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Posted Journal Register / Reversal Control</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Journal</th><th>Date</th><th>Description</th><th>Reference</th><th>Currency</th><th>Debit / Credit</th><th>Action</th></tr></thead><tbody>
      {journals.map(row=><tr key={row.journalNo}><td><b>{row.journalNo}</b></td><td>{fmtDate(row.journalDate)}</td><td>{row.description||'-'}<div className="sub">{row.source||'-'}</div></td><td>{row.reference||'-'}</td><td>{row.currency}</td><td>{fmtMoney(row.totalDebit,row.currency)} / {fmtMoney(row.totalCredit,row.currency)}</td><td>{row.reversalJournalNo?<span className="status">Reversed by {row.reversalJournalNo}</span>:row.status==='POSTED'&&row.source!=='REVERSAL'?<button className="btn" disabled={busy||close?.status==='CLOSED'} onClick={()=>void reverseJournal(row)}>Reverse</button>:<span className="status">{row.status}</span>}</td></tr>)}
      {journals.length===0&&<tr><td colSpan={7}>No journals in {period}.</td></tr>}
    </tbody></table></div></div>

    <div className="card"><h3 style={sectionTitle}>Account Ledger</h3><div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
      <label style={{minWidth:280,flex:'1 1 280px'}}><span style={labelStyle}>GL Account</span><input style={fieldStyle} value={account} onChange={e=>setAccount(e.target.value)} placeholder="e.g. 1100-ACCOUNTS-RECEIVABLE"/></label>
      <button className="btn" disabled={busy||!account.trim()} onClick={()=>void loadLedger()}>Load Ledger</button>
    </div>
    <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Date</th><th>Journal</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Running Balance</th></tr></thead><tbody>
      {ledger.map((row,i)=><tr key={`${row.journalNo}-${i}`}><td>{fmtDate(row.journalDate)}</td><td>{row.journalNo}</td><td>{row.description||'-'}</td><td>{row.reference||'-'}</td><td>{fmtMoney(row.debit,row.currency)}</td><td>{fmtMoney(row.credit,row.currency)}</td><td>{fmtMoney(row.runningBalance,row.currency)}</td></tr>)}
      {ledger.length===0&&<tr><td colSpan={7}>Load an account to view its ledger for {period}.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
