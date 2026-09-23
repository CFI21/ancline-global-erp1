'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import JobFlowNav from '../../components/JobFlowNav';

void JobFlowNav;
import {api,fmtDate,requireToken} from '../../lib/api';

type Severity='CRITICAL'|'HIGH'|'MEDIUM';
type Category='ACTION_REQUIRED'|'CUT_OFF_RISK'|'DOCUMENT_GAP'|'PAYMENT_RELEASE_BLOCK'|'FAILED_EVENT'|'LATE_MILESTONE'|'RECONCILIATION_EXCEPTION';

type ControlRow={
  id:string;
  severity:Severity;
  category:Category;
  bookingId?:string;
  bookingNo:string;
  businessModel?:string;
  branchId?:string;
  branch?:string;
  owner:string;
  message:string;
  due?:string;
  source:string;
  actionLabel:string;
  actionHref:string;
  updatedAt?:string;
};

type Dashboard={
  generatedAt?:string;
  summary?:Record<string,number>;
  rows?:ControlRow[];
  filters?:{branches?:string[];owners?:string[];businessModels?:string[]};
};

const categoryLabels:Record<Category,string>={
  ACTION_REQUIRED:'Action Required',
  CUT_OFF_RISK:'Cut-off Risk',
  DOCUMENT_GAP:'Document Gaps',
  PAYMENT_RELEASE_BLOCK:'Payment / Release Blocks',
  FAILED_EVENT:'Failed Events',
  LATE_MILESTONE:'Milestone Delays',
  RECONCILIATION_EXCEPTION:'Reconciliation Exceptions'
};

export default function ExceptionsPage(){
  const [token,setToken]=useState('');
  const [data,setData]=useState<Dashboard>({summary:{},rows:[],filters:{}});
  const [search,setSearch]=useState('');
  const [severity,setSeverity]=useState('ALL');
  const [category,setCategory]=useState('ALL');
  const [owner,setOwner]=useState('ALL');
  const [businessModel,setBusinessModel]=useState('ALL');
  const [branch,setBranch]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [contextBookingId,setContextBookingId]=useState('');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const d:Dashboard=await api('/operations/control-dashboard',t);
      setData(d||{summary:{},rows:[],filters:{}});
      const contextId=new URLSearchParams(location.search).get('bookingId')||'';
      setContextBookingId(contextId);
      if(contextId){
        const match=(d?.rows||[]).find(r=>r.bookingId===contextId);
        if(match)setSearch(match.bookingNo);
      }
    }catch(e:any){setMessage(e?.message||'Unable to load operations control dashboard.');}
    finally{setBusy(false);}
  }

  const rows=data.rows||[];
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(r=>
      (severity==='ALL'||r.severity===severity)&&
      (category==='ALL'||r.category===category)&&
      (owner==='ALL'||r.owner===owner)&&
      (businessModel==='ALL'||r.businessModel===businessModel)&&
      (branch==='ALL'||r.branch===branch)&&
      (!q||[r.bookingNo,r.businessModel,r.branch,r.category,categoryLabels[r.category],r.message,r.owner,r.source].some(x=>String(x||'').toLowerCase().includes(q)))
    );
  },[rows,search,severity,category,owner,businessModel,branch]);

  const s=data.summary||{};
  const cards=[
    ['Action Required',s.ACTION_REQUIRED||0],
    ['Critical',s.critical||0],
    ['Cut-off Risk',s.CUT_OFF_RISK||0],
    ['Document Gaps',s.DOCUMENT_GAP||0],
    ['Payment / Release',s.PAYMENT_RELEASE_BLOCK||0],
    ['Failed Events',s.FAILED_EVENT||0],
    ['Milestone Delays',s.LATE_MILESTONE||0],
    ['Reconciliation',s.RECONCILIATION_EXCEPTION||0]
  ];
  const contextRow=contextBookingId?rows.find(r=>r.bookingId===contextBookingId):undefined;

  return <WorkspaceShell title="Operations Control + Exception Dashboard" subtitle="Action-required jobs and cross-module operational exceptions from approved ANCLINE data" active="/exceptions" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Refreshing…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {contextBookingId&&<JobContextRail bookingId={contextBookingId} bookingNo={contextRow?.bookingNo} active="EXCEPTIONS"/>}

    <div className="grid" style={{marginBottom:12}}>
      {cards.map(([label,value])=><div className="card" key={String(label)}><div className="sub">{label}</div><div className="kpi">{value}</div></div>)}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input style={{...fieldStyle,minWidth:220,flex:'1 1 260px'}} placeholder="Search job, exception, owner, source…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="Severity" style={{...fieldStyle,maxWidth:165}} value={severity} onChange={e=>setSeverity(e.target.value)}>
          <option value="ALL">All severities</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option>
        </select>
        <select aria-label="Category" style={{...fieldStyle,maxWidth:225}} value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="ALL">All categories</option>
          {(Object.keys(categoryLabels) as Category[]).map(k=><option key={k} value={k}>{categoryLabels[k]}</option>)}
        </select>
        <select aria-label="Owner" style={{...fieldStyle,maxWidth:205}} value={owner} onChange={e=>setOwner(e.target.value)}>
          <option value="ALL">All owners</option>{(data.filters?.owners||[]).map(x=><option key={x}>{x}</option>)}
        </select>
        <select aria-label="Business model" style={{...fieldStyle,maxWidth:180}} value={businessModel} onChange={e=>setBusinessModel(e.target.value)}>
          <option value="ALL">All models</option>{(data.filters?.businessModels||[]).map(x=><option key={x}>{x}</option>)}
        </select>
        {(data.filters?.branches||[]).length>0&&<select aria-label="Branch" style={{...fieldStyle,maxWidth:180}} value={branch} onChange={e=>setBranch(e.target.value)}>
          <option value="ALL">All branches</option>{(data.filters?.branches||[]).map(x=><option key={x}>{x}</option>)}
        </select>}
        <span className="status">{visible.length} visible</span>
      </div>
      <div className="sub" style={{marginTop:8}}>Read-only control view · no booking, payment, release, finance or document workflow is changed here.</div>
    </div>

    <div className="card">
      <div style={{overflowX:'auto'}}>
        <table className="table">
          <thead><tr><th>Severity</th><th>Job</th><th>Model / Branch</th><th>Category</th><th>Exception / Required Action</th><th>Owner</th><th>Due</th><th>Source</th><th>Action</th></tr></thead>
          <tbody>
            {visible.map(r=><tr key={r.id}>
              <td><b>{r.severity}</b></td>
              <td>{r.bookingId?<a href={'/bookings/'+r.bookingId}><b>{r.bookingNo}</b></a>:r.bookingNo}</td>
              <td>{r.businessModel||'—'}<div className="sub">{r.branch||'—'}</div></td>
              <td>{categoryLabels[r.category]}</td>
              <td style={{whiteSpace:'normal',minWidth:260}}>{r.message}</td>
              <td>{r.owner}</td>
              <td>{fmtDate(r.due)}</td>
              <td>{r.source}</td>
              <td><a className="btn" style={{textDecoration:'none',display:'inline-block',whiteSpace:'nowrap'}} href={r.actionHref}>{r.actionLabel}</a></td>
            </tr>)}
            {visible.length===0&&<tr><td colSpan={9}>No matching operational exceptions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </WorkspaceShell>;
}
