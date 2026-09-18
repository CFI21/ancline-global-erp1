'use client';
import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../../components/WorkspaceShell';
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
  const [showNew,setShowNew]=useState(true);
  const [lead,setLead]=useState<any>({
    organizationId:'',organizationName:'',inquiryType:'EMAIL',inquiryTypeLabel:'Email Inquiry',
    contactName:'',phone:'',emailAddress:'',mobile:'',jobDescription:'',
    assignedSalesRep:'',leadInterest:'WARM',leadSourceCode:'DIRECT',leadSourceName:'Direct',
    sourceDetails:'',referringOrganization:'',referringContact:'',notes:''
  });

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{
      const [l,o]=await Promise.all([api('/sales-crm/leads',t),api('/sales-crm/organizations',t)]);
      setRows(Array.isArray(l)?l:[]);
      setOrgs(Array.isArray(o)?o:[]);
    }catch(e:any){setMessage(e.message||'Unable to load Sales Leads / Inquiries');}
  }
  async function createLead(){
    setBusy(true);setMessage('');
    try{
      const org=orgs.find((x:any)=>x.id===lead.organizationId);
      const created=await api('/sales-crm/leads',token,{method:'POST',body:JSON.stringify({...lead,organizationName:lead.organizationName||org?.name||''})});
      location.href=`/sales-crm/leads/${created.leadId}`;
    }catch(e:any){setMessage(e.message||'Inquiry / lead could not be created');}
    finally{setBusy(false);}
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
      <button className="btn" onClick={()=>setShowNew(v=>!v)}>{showNew?'Hide New Inquiry':'+ New Inquiry'}</button>
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

    {showNew&&<div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>New Inquiry / Sales Lead</h3>
      <div style={formGrid}>
        <label><span style={labelStyle}>Organization</span><select style={fieldStyle} value={lead.organizationId} onChange={e=>{const o=orgs.find((x:any)=>x.id===e.target.value);setLead({...lead,organizationId:e.target.value,organizationName:o?.name||lead.organizationName});}}><option value="">New / unlinked prospect</option>{orgs.map((o:any)=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
        {!lead.organizationId&&<label><span style={labelStyle}>Organization Name *</span><input style={fieldStyle} value={lead.organizationName} onChange={e=>setLead({...lead,organizationName:e.target.value})}/></label>}
        <label><span style={labelStyle}>Inquiry Type</span><select style={fieldStyle} value={lead.inquiryType} onChange={e=>setLead({...lead,inquiryType:e.target.value,inquiryTypeLabel:e.target.options[e.target.selectedIndex].text})}><option value="EMAIL">Email Inquiry</option><option value="PHONE">Phone Inquiry</option><option value="WEB">Web Inquiry</option><option value="VISIT">Sales Visit</option><option value="REFERRAL">Referral</option></select></label>
        <label><span style={labelStyle}>Inquiry Contact *</span><input style={fieldStyle} value={lead.contactName} onChange={e=>setLead({...lead,contactName:e.target.value})}/></label>
        <label><span style={labelStyle}>Phone</span><input style={fieldStyle} value={lead.phone} onChange={e=>setLead({...lead,phone:e.target.value})}/></label>
        <label><span style={labelStyle}>E-Mail Address</span><input type="email" style={fieldStyle} value={lead.emailAddress} onChange={e=>setLead({...lead,emailAddress:e.target.value})}/></label>
        <label><span style={labelStyle}>Mobile</span><input style={fieldStyle} value={lead.mobile} onChange={e=>setLead({...lead,mobile:e.target.value})}/></label>
        <label><span style={labelStyle}>Job Description</span><input style={fieldStyle} value={lead.jobDescription} onChange={e=>setLead({...lead,jobDescription:e.target.value})}/></label>
        <label><span style={labelStyle}>Assigned Sales Rep</span><input style={fieldStyle} value={lead.assignedSalesRep} onChange={e=>setLead({...lead,assignedSalesRep:e.target.value})}/></label>
        <label><span style={labelStyle}>Lead Interest</span><select style={fieldStyle} value={lead.leadInterest} onChange={e=>setLead({...lead,leadInterest:e.target.value})}><option>COLD</option><option>WARM</option><option>HOT</option></select></label>
        <label><span style={labelStyle}>Lead Source Code</span><input style={fieldStyle} value={lead.leadSourceCode} onChange={e=>setLead({...lead,leadSourceCode:e.target.value})}/></label>
        <label><span style={labelStyle}>Lead Source</span><input style={fieldStyle} value={lead.leadSourceName} onChange={e=>setLead({...lead,leadSourceName:e.target.value})}/></label>
        <label><span style={labelStyle}>Source Details</span><input style={fieldStyle} value={lead.sourceDetails} onChange={e=>setLead({...lead,sourceDetails:e.target.value})}/></label>
        <label><span style={labelStyle}>Referring Organization</span><input style={fieldStyle} value={lead.referringOrganization} onChange={e=>setLead({...lead,referringOrganization:e.target.value})}/></label>
        <label><span style={labelStyle}>Referring Contact</span><input style={fieldStyle} value={lead.referringContact} onChange={e=>setLead({...lead,referringContact:e.target.value})}/></label>
      </div>
      <label style={{display:'block',marginTop:10}}><span style={labelStyle}>Notes</span><textarea style={{...fieldStyle,minHeight:70}} value={lead.notes} onChange={e=>setLead({...lead,notes:e.target.value})}/></label>
      <div style={{textAlign:'right',marginTop:10}}><button className="btn" disabled={busy||(!lead.organizationId&&!lead.organizationName.trim())||!lead.contactName.trim()} onClick={()=>void createLead()}>{busy?'Creating...':'Create Inquiry / Lead'}</button></div>
    </div>}

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
