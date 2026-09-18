'use client';
import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,sectionTitle} from '../../../components/WorkspaceShell';
import {api,requireToken} from '../../../lib/api';

export default function SalesLeadsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<any[]>([]);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const [interest,setInterest]=useState('ALL');
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{
      const [l,o]=await Promise.all([api('/sales-crm/leads',t),api('/sales-crm/organizations',t)]);
      setRows(Array.isArray(l)?l:[]);
      setOrgs(Array.isArray(o)?o:[]);
    }catch(e:any){setMessage(e.message||'Unable to load Sales Leads / Inquiries');}
  }
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(x=>{
      const qok=!q||[x.inquiryNo,x.organizationName,x.contactName,x.emailAddress,x.phone,x.assignedSalesRep,x.leadSourceCode,x.leadSourceName].some(v=>String(v||'').toLowerCase().includes(q));
      const sok=status==='ALL'||String(x.status||'').toUpperCase()===status;
      const iok=interest==='ALL'||String(x.leadInterest||'').toUpperCase()===interest;
      return qok&&sok&&iok;
    });
  },[rows,search,status,interest]);

  const open=rows.filter(x=>!['CONVERTED','CLOSED','LOST'].includes(String(x.status||'').toUpperCase())).length;
  const converted=rows.filter(x=>String(x.status||'').toUpperCase()==='CONVERTED').length;
  const hot=rows.filter(x=>String(x.leadInterest||'').toUpperCase()==='HOT').length;

  return <WorkspaceShell
    title="Sales Leads / Inquiries"
    subtitle="Capture enquiries, qualify prospects and convert them into Sales Opportunities"
    active="/sales-crm/leads"
    actions={<>
      <a className="btn" href="/sales-crm/leads/new" style={{textDecoration:'none'}}>+ New Inquiry</a>
      <a className="btn" href="/sales-crm" style={{textDecoration:'none'}}>Opportunities / Pipeline</a>
      <button className="btn" onClick={()=>void load()}>Refresh</button>
    </>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:12}}>
      <div className="card"><div className="sub">TOTAL INQUIRIES</div><div className="kpi">{rows.length}</div></div>
      <div className="card"><div className="sub">OPEN / ACTIVE</div><div className="kpi">{open}</div></div>
      <div className="card"><div className="sub">HOT LEADS</div><div className="kpi">{hot}</div></div>
      <div className="card"><div className="sub">CONVERTED</div><div className="kpi">{converted}</div></div>
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
        <div><h3 style={{...sectionTitle,marginBottom:4}}>Inquiry / Lead Register</h3><div className="sub">Open a lead to manage Details, Workflow & Tracking, eDocs, Notes, Logs and Sales Relations.</div></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input style={{...fieldStyle,width:260}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search inquiry, company, contact, owner..."/>
          <select style={{...fieldStyle,width:145}} value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All Statuses</option><option>OPEN</option><option>QUALIFIED</option><option>ON_HOLD</option><option>CONVERTED</option><option>CLOSED</option><option>LOST</option></select>
          <select style={{...fieldStyle,width:130}} value={interest} onChange={e=>setInterest(e.target.value)}><option value="ALL">All Interest</option><option>COLD</option><option>WARM</option><option>HOT</option></select>
        </div>
      </div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Inquiry ID</th><th>Type</th><th>Organization</th><th>Contact</th><th>Assigned Sales Rep</th><th>Lead Interest</th><th>Lead Source</th><th>Status</th><th>Opportunity</th><th></th></tr></thead><tbody>
        {visible.map((x:any)=><tr key={x.leadId}>
          <td><b>{x.inquiryNo}</b></td>
          <td>{x.inquiryTypeLabel||x.inquiryType}</td>
          <td>{x.organizationName}</td>
          <td>{x.contactName}<div className="sub">{x.emailAddress||x.phone||''}</div></td>
          <td>{x.assignedSalesRep||'—'}</td>
          <td><span className="status">{x.leadInterest||'—'}</span></td>
          <td>{[x.leadSourceCode,x.leadSourceName].filter(Boolean).join(' - ')||'—'}</td>
          <td><span className="status">{x.status}</span></td>
          <td>{x.opportunityId?<a href={`/sales-crm?opportunity=${x.opportunityId}`}>{x.opportunityId}</a>:'—'}</td>
          <td><a className="btn" href={`/sales-crm/leads/${x.leadId}`} style={{textDecoration:'none'}}>Open</a></td>
        </tr>)}
        {!visible.length&&<tr><td colSpan={10}>No inquiries / leads found.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
