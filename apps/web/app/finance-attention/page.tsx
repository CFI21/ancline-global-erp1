'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,currentUser,fmtDate,requireToken} from '../../lib/api';

type Approval={id:string;bookingId?:string;type:string;requesterId:string;approverId:string;status:string;reason?:string;createdAt?:string};
type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string};
type ControlRow={id:string;severity?:string;category?:string;bookingId?:string;bookingNo?:string;owner?:string;message?:string;due?:string;source?:string;actionLabel?:string;actionHref?:string};
type CreditDashboard={customerCount?:number;creditHoldCount?:number;reviewCount?:number;collectionCount?:number;criticalCollectionCount?:number;promiseBreachedCount?:number;unreconciledBankCount?:number};
type AccountingDashboard={totalInvoices?:number;draftCount?:number;openARCount?:number;openAPCount?:number;overdueCount?:number;disputedCount?:number;paidCount?:number};
type FinanceRow={
  key:string;kind:'APPROVAL'|'EXCEPTION';priority:string;bookingId?:string;bookingNo:string;subject:string;
  maker:string;checker:string;status:string;reason:string;source:string;createdOrDue?:string;actionHref:string;approvalId?:string;
};

const financeApprovalTypes=new Set(['CREDIT_OVERRIDE','DOCUMENT_RELEASE','FINANCE_APPROVAL','FINAL_CLOSEOUT','RATE_APPROVAL']);
const rank:Record<string,number>={CRITICAL:4,HIGH:3,MEDIUM:2,PENDING:1};

export default function FinanceAttentionPage(){
  const [token,setToken]=useState('');
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [controlRows,setControlRows]=useState<ControlRow[]>([]);
  const [credit,setCredit]=useState<CreditDashboard>({});
  const [accounting,setAccounting]=useState<AccountingDashboard>({});
  const [view,setView]=useState('ATTENTION');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('OPEN');
  const [type,setType]=useState('ALL');
  const [sort,setSort]=useState('PRIORITY');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const user=currentUser();
  const identities=[String(user?.email||'').toLowerCase(),String(user?.sub||'').toLowerCase(),String(user?.role||'').toLowerCase()].filter(Boolean);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const [a,b,o,c,d]=await Promise.all([
        api('/approvals',t),api('/bookings',t),api('/operations/control-dashboard',t),
        api('/credit-control/dashboard',t),api('/accounting/dashboard',t)
      ]);
      setApprovals(Array.isArray(a)?a:[]);
      setBookings(Array.isArray(b)?b:[]);
      setControlRows(Array.isArray(o?.rows)?o.rows:[]);
      setCredit(c||{});setAccounting(d||{});
    }catch(e:any){setMessage(e?.message||'Unable to load Finance Attention.');}
    finally{setBusy(false);}
  }

  const bookingLabel=(id?:string)=>{
    const b=bookings.find(x=>x.id===id);
    return b?b.bookingNo:(id?'Linked job':'General');
  };

  const rows=useMemo<FinanceRow[]>(()=>{
    const approvalRows:FinanceRow[]=approvals
      .filter(a=>financeApprovalTypes.has(String(a.type||'').toUpperCase()))
      .map(a=>({
        key:'A:'+a.id,kind:'APPROVAL',priority:String(a.status).toUpperCase()==='PENDING'?'PENDING':'MEDIUM',
        bookingId:a.bookingId,bookingNo:bookingLabel(a.bookingId),subject:a.type,
        maker:a.requesterId||'—',checker:a.approverId||'—',status:a.status||'Pending',reason:a.reason||'—',
        source:'Approval Queue',createdOrDue:a.createdAt,actionHref:a.bookingId?('/approvals?bookingId='+encodeURIComponent(a.bookingId)):'/approvals',approvalId:a.id
      }));
    const exceptionRows:FinanceRow[]=controlRows
      .filter(r=>['PAYMENT_RELEASE_BLOCK','RECONCILIATION_EXCEPTION'].includes(String(r.category||''))||/FINANCE|PAYMENT|CREDIT|INVOICE|RECONCIL/i.test(String(r.source||'')+' '+String(r.message||'')))
      .map(r=>({
        key:'E:'+r.id,kind:'EXCEPTION',priority:r.severity||'MEDIUM',bookingId:r.bookingId,
        bookingNo:r.bookingNo||bookingLabel(r.bookingId),subject:String(r.category||'FINANCE_ATTENTION').replaceAll('_',' '),
        maker:'—',checker:r.owner||'Finance',status:'Open',reason:r.message||'Finance attention required',
        source:r.source||'Operations Control',createdOrDue:r.due,actionHref:r.actionHref||'/credit-control'
      }));
    return [...approvalRows,...exceptionRows];
  },[approvals,controlRows,bookings]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const out=rows.filter(r=>{
      const open=String(r.status).toUpperCase()==='PENDING'||String(r.status).toUpperCase()==='OPEN';
      const mine=r.kind==='APPROVAL'&&identities.includes(String(r.checker||'').toLowerCase());
      const viewOk=view==='ALL'||(view==='ATTENTION'&&open)||(view==='MY_APPROVALS'&&mine&&open)||(view==='APPROVALS'&&r.kind==='APPROVAL')||(view==='EXCEPTIONS'&&r.kind==='EXCEPTION');
      const statusOk=status==='ALL'||(status==='OPEN'&&open)||(status==='CLOSED'&&!open);
      const typeOk=type==='ALL'||r.kind===type;
      const searchOk=!q||[r.bookingNo,r.subject,r.maker,r.checker,r.status,r.reason,r.source].some(v=>String(v||'').toLowerCase().includes(q));
      return viewOk&&statusOk&&typeOk&&searchOk;
    });
    return [...out].sort((a,b)=>{
      if(sort==='DATE')return (a.createdOrDue?new Date(a.createdOrDue).getTime():Number.MAX_SAFE_INTEGER)-(b.createdOrDue?new Date(b.createdOrDue).getTime():Number.MAX_SAFE_INTEGER);
      if(sort==='JOB')return a.bookingNo.localeCompare(b.bookingNo);
      if(sort==='STATUS')return a.status.localeCompare(b.status);
      return (rank[b.priority]||0)-(rank[a.priority]||0);
    });
  },[rows,view,search,status,type,sort,identities.join('|')]);

  const pendingApprovals=approvals.filter(a=>financeApprovalTypes.has(String(a.type||'').toUpperCase())&&String(a.status).toUpperCase()==='PENDING');
  const myApprovals=pendingApprovals.filter(a=>identities.includes(String(a.approverId||'').toLowerCase()));
  const financeExceptions=rows.filter(r=>r.kind==='EXCEPTION');

  async function decide(id:string,action:'approve'|'reject'){
    setBusy(true);setMessage('');
    try{
      await api('/approvals/'+encodeURIComponent(id)+'/'+action,token,{method:'POST'});
      setMessage(action==='approve'?'Approval accepted.':'Approval rejected.');
      await load();
    }catch(e:any){setMessage(e?.message||'Approval decision failed. Maker-checker and assigned-approver controls remain enforced.');}
    finally{setBusy(false);}
  }

  const cards=[
    ['FINANCE ATTENTION',pendingApprovals.length+financeExceptions.length,'ATTENTION'],
    ['MY APPROVALS',myApprovals.length,'MY_APPROVALS'],
    ['PENDING APPROVALS',pendingApprovals.length,'APPROVALS'],
    ['FINANCE EXCEPTIONS',financeExceptions.length,'EXCEPTIONS'],
    ['CREDIT HOLDS',Number(credit.creditHoldCount||0),'ATTENTION'],
    ['OVERDUE INVOICES',Number(accounting.overdueCount||0),'ATTENTION'],
    ['UNRECONCILED BANK',Number(credit.unreconciledBankCount||0),'ATTENTION'],
    ['DISPUTED',Number(accounting.disputedCount||0),'ATTENTION']
  ];

  return <WorkspaceShell
    title="Finance Attention + Approval Control"
    subtitle="Finance exceptions · maker-checker approvals · credit · AR/AP · reconciliation attention"
    active="/finance-attention"
    actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Refreshing…':'Refresh'}</button>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      {cards.map(([label,value,key])=><button key={String(label)} className="card" style={{textAlign:'left',cursor:'pointer'}} onClick={()=>setView(String(key))}>
        <div className="sub">{label}</div><div className="kpi">{value}</div>
      </button>)}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <select aria-label="Finance attention view" style={{...fieldStyle,maxWidth:190}} value={view} onChange={e=>setView(e.target.value)}>
          <option value="ATTENTION">Finance Attention</option><option value="MY_APPROVALS">My Approvals</option><option value="APPROVALS">All Approvals</option><option value="EXCEPTIONS">Finance Exceptions</option><option value="ALL">All Finance Control</option>
        </select>
        <input aria-label="Finance attention search" style={{...fieldStyle,minWidth:220,flex:'1 1 270px'}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, approval, maker, checker, exception or source"/>
        <select aria-label="Finance item type" style={{...fieldStyle,maxWidth:165}} value={type} onChange={e=>setType(e.target.value)}>
          <option value="ALL">All types</option><option value="APPROVAL">Approvals</option><option value="EXCEPTION">Exceptions</option>
        </select>
        <select aria-label="Finance item status" style={{...fieldStyle,maxWidth:160}} value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="OPEN">Open / Pending</option><option value="CLOSED">Closed</option><option value="ALL">All statuses</option>
        </select>
        <select aria-label="Finance attention sort" style={{...fieldStyle,maxWidth:155}} value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="PRIORITY">Priority</option><option value="DATE">Date / Due</option><option value="JOB">Job</option><option value="STATUS">Status</option>
        </select>
        <span className="status">{filtered.length} visible</span>
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
        <a className="btn" href="/approvals" style={{textDecoration:'none'}}>Approval Queue</a>
        <a className="btn" href="/finance" style={{textDecoration:'none'}}>Job Costing</a>
        <a className="btn" href="/accounting" style={{textDecoration:'none'}}>AR / AP</a>
        <a className="btn" href="/credit-control" style={{textDecoration:'none'}}>Credit & Collections</a>
        <a className="btn" href="/finance-reporting" style={{textDecoration:'none'}}>Financial Reporting</a>
      </div>
      <div className="sub" style={{marginTop:8}}>This is a consolidated control surface only. Approval decisions use the existing API, which retains assigned-approver, maker-checker, role/scope and audit enforcement.</div>
    </div>

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">OPEN AR</div><div className="kpi">{Number(accounting.openARCount||0)}</div></div>
      <div className="card"><div className="sub">OPEN AP</div><div className="kpi">{Number(accounting.openAPCount||0)}</div></div>
      <div className="card"><div className="sub">COLLECTION QUEUE</div><div className="kpi">{Number(credit.collectionCount||0)}</div><div className="sub">{Number(credit.criticalCollectionCount||0)} critical</div></div>
      <div className="card"><div className="sub">CREDIT REVIEWS</div><div className="kpi">{Number(credit.reviewCount||0)}</div></div>
    </div>

    <div className="card">
      <div style={{overflowX:'auto'}}>
        <table className="table">
          <thead><tr><th>Type</th><th>Priority</th><th>Job</th><th>Control / Approval</th><th>Maker</th><th>Checker / Owner</th><th>Reason / Attention</th><th>Date / Due</th><th>Status</th><th>Source</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map(r=><tr key={r.key}>
              <td><span className="status">{r.kind}</span></td><td><b>{r.priority}</b></td>
              <td>{r.bookingId?<a href={'/bookings/'+r.bookingId}><b>{r.bookingNo}</b></a>:r.bookingNo}</td>
              <td><b>{r.subject}</b></td><td>{r.maker}</td><td>{r.checker}</td>
              <td style={{whiteSpace:'normal',minWidth:250}}>{r.reason}</td><td>{fmtDate(r.createdOrDue)||'—'}</td>
              <td><span className="status">{r.status}</span></td><td>{r.source}</td>
              <td><div style={{display:'flex',gap:5,flexWrap:'wrap',minWidth:180}}>
                <a className="btn" style={{textDecoration:'none'}} href={r.actionHref}>Open</a>
                {r.kind==='APPROVAL'&&String(r.status).toUpperCase()==='PENDING'&&r.approvalId&&<>
                  <button className="btn" disabled={busy} onClick={()=>void decide(r.approvalId!,'approve')}>Approve</button>
                  <button className="btn" disabled={busy} onClick={()=>void decide(r.approvalId!,'reject')}>Reject</button>
                </>}
              </div></td>
            </tr>)}
            {filtered.length===0&&<tr><td colSpan={11}>No finance attention items match this view.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </WorkspaceShell>;
}
