'use client';
import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../../components/WorkspaceShell';
import {api,requireToken} from '../../../lib/api';

export default function OpportunitiesPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<any[]>([]);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [dashboard,setDashboard]=useState<any>({summary:{},pipelineByCurrency:[]});
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const [stage,setStage]=useState('ALL');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{
      const [r,o,d]=await Promise.all([
        api('/sales-crm/opportunities',t),
        api('/sales-crm/organizations',t),
        api('/sales-crm/dashboard',t)
      ]);
      setRows(Array.isArray(r)?r:[]);setOrgs(Array.isArray(o)?o:[]);setDashboard(d||{summary:{},pipelineByCurrency:[]});
    }catch(e:any){setMessage(e.message||'Unable to load Opportunities');}
  }
  const customerName=(id:string)=>orgs.find((o:any)=>o.id===id)?.name||id||'—';
  const stages=useMemo(()=>Array.from(new Set(rows.map(x=>String(x.stage||'')).filter(Boolean))).sort(),[rows]);
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(x=>
      (status==='ALL'||String(x.status||'').toUpperCase()===status)&&
      (stage==='ALL'||String(x.stage||'')===stage)&&
      (!q||[x.opportunityId,x.name,customerName(x.customerId),x.owner,x.sourceInquiryNo,x.origin,x.destination,x.source].some(v=>String(v||'').toLowerCase().includes(q)))
    );
  },[rows,orgs,search,status,stage]);
  const s=dashboard.summary||{};

  return <WorkspaceShell
    title="Sales Opportunities / Pipeline"
    subtitle="Commercial opportunity register, weighted pipeline, inquiry relationships and win/loss control"
    active="/sales-crm/opportunities"
    actions={<><button className="btn" onClick={()=>location.href='/sales-crm/opportunities/new'}>+ New Opportunity</button><button className="btn" onClick={()=>void load()}>Refresh</button></>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,marginBottom:12}}>
      {[
        ['Open Opportunities',s.openOpportunities??rows.filter(x=>!['WON','LOST'].includes(String(x.status))).length,'Active pipeline'],
        ['Won',s.won??rows.filter(x=>x.status==='WON').length,'Closed won'],
        ['Lost',s.lost??rows.filter(x=>x.status==='LOST').length,'Closed lost'],
        ['Win Rate',`${Number(s.winRate||0).toFixed(1)}%`,'Won vs closed'],
        ['Open Tenders',s.openTenders??0,'RFQ / tender pipeline']
      ].map(([label,value,note])=><div className="card" key={label}>
        <div style={{fontSize:11,fontWeight:800,color:'#526778',textTransform:'uppercase'}}>{label}</div>
        <div style={{fontSize:24,fontWeight:900,color:'#153a5d',margin:'5px 0'}}>{value}</div>
        <div className="sub">{note}</div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input style={{...fieldStyle,maxWidth:430}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search opportunity, customer, inquiry, owner, lane..."/>
        <select style={{...fieldStyle,maxWidth:190}} value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="ALL">All Statuses</option><option>OPEN</option><option>ON_HOLD</option><option>WON</option><option>LOST</option>
        </select>
        <select style={{...fieldStyle,maxWidth:190}} value={stage} onChange={e=>setStage(e.target.value)}>
          <option value="ALL">All Stages</option>{stages.map(x=><option key={x}>{x}</option>)}
        </select>
        <div className="sub" style={{marginLeft:'auto'}}><b>{visible.length}</b> opportunities shown</div>
      </div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr>
        <th>Opportunity</th><th>Customer</th><th>Source Inquiry</th><th>Owner</th><th>Stage</th><th>Probability</th><th>Value</th><th>Weighted</th><th>Lane</th><th>Status</th><th></th>
      </tr></thead><tbody>
        {visible.map((x:any)=>{
          const weighted=Number(x.value||0)*Number(x.probability||0)/100;
          return <tr key={x.opportunityId}>
            <td><b>{x.name}</b><div className="sub">{x.opportunityId}</div></td>
            <td>{customerName(x.customerId)}</td>
            <td>{x.sourceLeadId?<button className="btn" onClick={()=>location.href=`/sales-crm?lead=${x.sourceLeadId}#inquiries`}>{x.sourceInquiryNo||x.sourceLeadId}</button>:(x.sourceInquiryNo||'—')}</td>
            <td>{x.owner||'—'}</td><td>{x.stage}</td><td>{x.probability}%</td><td>{x.currency} {Number(x.value||0).toFixed(2)}</td><td>{x.currency} {weighted.toFixed(2)}</td>
            <td>{x.origin||'—'} → {x.destination||'—'}</td><td><span className="status">{x.status}</span></td><td><button className="btn" onClick={()=>location.href=`/sales-crm/opportunities/${x.opportunityId}`}>Open</button></td>
          </tr>;
        })}
        {!visible.length&&<tr><td colSpan={11}>No opportunities found.</td></tr>}
      </tbody></table></div>
    </div>

    {(dashboard.pipelineByCurrency||[]).length>0&&<div className="card">
      <div style={{fontWeight:800,marginBottom:8}}>Pipeline Forecast</div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Currency</th><th>Gross Pipeline</th><th>Weighted Forecast</th></tr></thead><tbody>
        {(dashboard.pipelineByCurrency||[]).map((x:any)=><tr key={x.currency}><td>{x.currency}</td><td>{Number(x.grossPipeline||0).toFixed(2)}</td><td>{Number(x.weightedPipeline||0).toFixed(2)}</td></tr>)}
      </tbody></table></div>
    </div>}
  </WorkspaceShell>;
}
