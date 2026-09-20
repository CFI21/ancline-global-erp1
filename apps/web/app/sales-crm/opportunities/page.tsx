'use client';
import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell from '../../../components/WorkspaceShell';
import {api,requireToken} from '../../../lib/api';

export default function OpportunitiesPage(){
  const [token,setToken]=useState(''),[rows,setRows]=useState<any[]>([]),[orgs,setOrgs]=useState<any[]>([]),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState('ALL');
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const [r,o]=await Promise.all([api('/sales-crm/opportunities',t),api('/sales-crm/organizations',t)]);setRows(Array.isArray(r)?r:[]);setOrgs(Array.isArray(o)?o:[]);}catch(e:any){setMessage(e.message||'Unable to load Opportunities');}}
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(x=>(status==='ALL'||String(x.status||'').toUpperCase()===status)&&(!q||[x.opportunityId,x.name,x.owner,x.sourceInquiryNo,x.origin,x.destination].some(v=>String(v||'').toLowerCase().includes(q))));},[rows,search,status]);
  const customerName=(id:string)=>orgs.find((o:any)=>o.id===id)?.name||id||'—';
  return <WorkspaceShell title="" subtitle="" active="/sales-crm/opportunities" hideHeader>
    <div className="cw-screen">
      <div className="cw-titlebar">Sales Opportunity Register - Branch: GLOBAL - Company: ANCLINE WORLDWIDE - Department: SALES</div>
      <div className="cw-menubar"><button onClick={()=>location.href='/sales-crm/opportunities/new'}>New Opportunity</button><button onClick={()=>void load()}>Refresh</button><button onClick={()=>location.href='/sales-crm'}>Pipeline Dashboard</button></div>
      {message&&<div className="cw-message">{message}</div>}
      <div className="opp-register-tools"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ID, name, owner, inquiry, lane..."/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All Statuses</option><option>OPEN</option><option>ON_HOLD</option><option>WON</option><option>LOST</option></select><span>{visible.length} Opportunities</span></div>
      <div className="cw-tablewrap opp-register-table"><table className="cw-table"><thead><tr><th>Opportunity ID</th><th>Name</th><th>Customer</th><th>Source Inquiry</th><th>Owner</th><th>Stage</th><th>Probability</th><th>Value</th><th>Lane</th><th>Status</th><th></th></tr></thead><tbody>
        {visible.map((x:any)=><tr key={x.opportunityId}><td><b>{x.opportunityId}</b></td><td>{x.name}</td><td>{customerName(x.customerId)}</td><td>{x.sourceInquiryNo||'—'}</td><td>{x.owner||'—'}</td><td>{x.stage}</td><td>{x.probability}%</td><td>{x.currency} {Number(x.value||0).toFixed(2)}</td><td>{x.origin||'—'} → {x.destination||'—'}</td><td>{x.status}</td><td><a href={`/sales-crm/opportunities/${x.opportunityId}`}>Open</a></td></tr>)}
        {!visible.length&&<tr><td colSpan={11}>No opportunities found.</td></tr>}
      </tbody></table></div>
      <div className="cw-footerbar"><span className="cw-spacer"/><button onClick={()=>location.href='/sales-crm/opportunities/new'}>□ New</button><button onClick={()=>void load()}>↻ Refresh</button></div>
    </div>
  </WorkspaceShell>;
}
