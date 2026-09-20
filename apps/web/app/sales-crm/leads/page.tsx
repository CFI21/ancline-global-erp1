'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell from '../../../components/WorkspaceShell';
import {api,requireToken} from '../../../lib/api';

export default function SalesLeadsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const [interest,setInterest]=useState('ALL');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const l=await api('/sales-crm/leads',t);
      setRows(Array.isArray(l)?l:[]);
    }catch(e:any){setMessage(e.message||'Unable to load Sales Leads / Inquiries');}
  }

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(x=>{
      const qok=!q||[x.inquiryNo,x.organizationName,x.contactName,x.emailAddress,x.phone,x.assignedSalesRep,x.leadSourceCode,x.leadSourceName,x.opportunityId].some(v=>String(v||'').toLowerCase().includes(q));
      const sok=status==='ALL'||String(x.status||'').toUpperCase()===status;
      const iok=interest==='ALL'||String(x.leadInterest||'').toUpperCase()===interest;
      return qok&&sok&&iok;
    });
  },[rows,search,status,interest]);

  const open=rows.filter(x=>!['CONVERTED','CLOSED','LOST'].includes(String(x.status||'').toUpperCase())).length;
  const converted=rows.filter(x=>String(x.status||'').toUpperCase()==='CONVERTED').length;
  const hot=rows.filter(x=>String(x.leadInterest||'').toUpperCase()==='HOT').length;

  return <WorkspaceShell title="" subtitle="" active="/sales-crm/leads" hideHeader>
    <div className="cw-screen">
      <div className="cw-titlebar">Inquiry / Sales Lead Register - Branch: GLOBAL - Company: ANCLINE WORLDWIDE - Department: SALES</div>

      <div className="cw-menubar">
        <button onClick={()=>location.href='/sales-crm/leads/new'}>New Inquiry</button>
        <button onClick={()=>void load()}>Refresh</button>
        <button onClick={()=>location.href='/sales-crm/opportunities'}>Opportunity Register</button>
        <button onClick={()=>location.href='/sales-crm'}>Sales CRM</button>
      </div>

      {message&&<div className="cw-message">{message}</div>}

      <div className="inq-register-summary">
        <span><b>{rows.length}</b> Total Inquiries</span>
        <span><b>{open}</b> Open / Active</span>
        <span><b>{hot}</b> Hot Leads</span>
        <span><b>{converted}</b> Converted</span>
      </div>

      <div className="inq-register-tools">
        <label>Search</label>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Inquiry, company, contact, owner..."/>
        <label>Status</label>
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="ALL">All</option>
          <option value="OPEN">OPEN</option>
          <option value="QUALIFIED">QUALIFIED</option>
          <option value="ON_HOLD">ON HOLD</option>
          <option value="CONVERTED">CONVERTED</option>
          <option value="CLOSED">CLOSED</option>
          <option value="LOST">LOST</option>
        </select>
        <label>Interest</label>
        <select value={interest} onChange={e=>setInterest(e.target.value)}>
          <option value="ALL">All</option>
          <option value="COLD">COLD</option>
          <option value="WARM">WARM</option>
          <option value="HOT">HOT</option>
        </select>
        <span className="cw-spacer"/>
        <b>{visible.length} records</b>
      </div>

      <div className="cw-tablewrap inq-register-table">
        <table className="cw-table">
          <thead><tr>
            <th>Inquiry ID</th>
            <th>Type</th>
            <th>Organization</th>
            <th>Contact</th>
            <th>E-Mail / Phone</th>
            <th>Assigned Sales Rep</th>
            <th>Lead Interest</th>
            <th>Lead Source</th>
            <th>Status</th>
            <th>Opportunity</th>
            <th></th>
          </tr></thead>
          <tbody>
            {visible.map((x:any)=><tr key={x.leadId}>
              <td><b>{x.inquiryNo||x.leadId}</b></td>
              <td>{x.inquiryTypeLabel||x.inquiryType||'—'}</td>
              <td>{x.organizationName||'—'}</td>
              <td>{x.contactName||'—'}</td>
              <td>{x.emailAddress||x.phone||'—'}</td>
              <td>{x.assignedSalesRep||'—'}</td>
              <td>{x.leadInterest||'—'}</td>
              <td>{[x.leadSourceCode,x.leadSourceName].filter(Boolean).join(' - ')||'—'}</td>
              <td><span className={'inq-status '+String(x.status||'').toLowerCase()}>{x.status||'—'}</span></td>
              <td>{x.opportunityId?<a href={`/sales-crm/opportunities/${x.opportunityId}`}><b>{x.opportunityId}</b></a>:'—'}</td>
              <td><a className="inq-open-link" href={`/sales-crm/leads/${x.leadId}`}>Open</a></td>
            </tr>)}
            {!visible.length&&<tr><td colSpan={11}>No inquiries / leads found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="cw-footerbar">
        <span className="cw-spacer"/>
        <button onClick={()=>location.href='/sales-crm/leads/new'}>□ New</button>
        <button onClick={()=>void load()}>↻ Refresh</button>
        <button onClick={()=>location.href='/sales-crm'}>● Close</button>
      </div>
    </div>
  </WorkspaceShell>;
}
