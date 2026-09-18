'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,currentUser,requireToken} from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[];countryCode?:string;active:boolean;createdAt?:string};
type KycRow={id:string;name:string;countryCode?:string;registrationRef?:string;customerRef?:string;costCenterCode?:string;kycStatus:string;kycData?:any;kycSubmittedAt?:string;kycApprovedAt?:string;kycRejectionReason?:string;active:boolean};
const allRoles=['CUSTOMER','SHIPPER','CONSIGNEE','AGENT','CARRIER','SLOT_PROVIDER','DEPOT','TERMINAL','TRUCKER','BROKER','VENDOR','ANCLINE_BRANCH'];

export default function OrganizationsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Org[]>([]);
  const [form,setForm]=useState({code:'',name:'',countryCode:'',role:'CUSTOMER'});
  const [search,setSearch]=useState('');
  const [role,setRole]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [kycRows,setKycRows]=useState<KycRow[]>([]);
  const [kycCostCenters,setKycCostCenters]=useState<Record<string,string>>({});
  const isAdmin=String(currentUser()?.role||'')==='GLOBAL_ADMIN';

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const results=await Promise.all([api('/organizations',t),isAdmin?api('/organizations/kyc/queue',t).catch(()=>[]):Promise.resolve([])]);const data=results[0],kyc=results[1];setRows(Array.isArray(data)?data:[]);setKycRows(Array.isArray(kyc)?kyc:[]);}catch(e:any){setMessage(e.message||'Unable to load organizations');}}
  const visible=useMemo(()=>rows.filter(o=>{const q=search.trim().toLowerCase();return (role==='ALL'||o.roles?.includes(role))&&(!q||[o.code,o.name,o.countryCode,...(o.roles||[])].some(v=>String(v||'').toLowerCase().includes(q)));}),[rows,search,role]);
  const counts=useMemo(()=>({all:rows.length,customers:rows.filter(x=>x.roles?.includes('CUSTOMER')).length,agents:rows.filter(x=>x.roles?.includes('AGENT')).length,carriers:rows.filter(x=>x.roles?.includes('CARRIER')).length}),[rows]);

  async function createOrg(){
    if(!form.code.trim()||!form.name.trim()){setMessage('Code and organization name are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/organizations',token,{method:'POST',body:JSON.stringify({code:form.code.trim().toUpperCase(),name:form.name.trim(),countryCode:form.countryCode.trim().toUpperCase()||null,roles:[form.role],active:true})});
      setForm({code:'',name:'',countryCode:'',role:'CUSTOMER'});setMessage('Organization created successfully.');await load();
    }catch(e:any){setMessage(e.message||'Organization could not be created.');}finally{setBusy(false);}
  }

  async function kycAction(id:string,action:'review'|'approve'|'reject'){
    setBusy(true);setMessage('');
    try{
      if(action==='review')await api('/organizations/'+id+'/kyc/review',token,{method:'POST'});
      if(action==='approve'){
        const costCenterCode=String(kycCostCenters[id]||'').trim().toUpperCase();
        if(!costCenterCode){setMessage('Forwarding cost center is required before KYC approval.');setBusy(false);return;}
        await api('/organizations/'+id+'/kyc/approve',token,{method:'POST',body:JSON.stringify({costCenterCode})});
      }
      if(action==='reject'){
        const reason=window.prompt('KYC rejection / review reason');
        if(!reason){setBusy(false);return;}
        await api('/organizations/'+id+'/kyc/reject',token,{method:'POST',body:JSON.stringify({reason})});
      }
      setMessage(action==='approve'?'KYC approved. ANC Customer Reference and Forwarding access have been issued.':action==='review'?'KYC moved to review.':'KYC rejected with review reason.');
      await load();
    }catch(e:any){setMessage(e.message||'KYC action failed.');}finally{setBusy(false);}
  }
  return <WorkspaceShell title="Organizations" subtitle="Customers, agents, carriers and operational partners" active="/organizations" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {isAdmin&&<div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div><div className="sub">ANC CUSTOMER DATABASE</div><h3 style={{margin:'2px 0'}}>Customer Registration & KYC Approval</h3><div className="sub">Approve KYC first. Approval issues the ANC Customer Reference, assigns the Forwarding cost center and provisions customer access.</div></div>
        <a className="btn" href="/customer-registration" style={{textDecoration:'none'}}>Open Public Registration</a>
      </div>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Registration</th><th>Company / Contact</th><th>KYC</th><th>ANC Customer Ref</th><th>Cost Center</th><th>Actions</th></tr></thead><tbody>
        {kycRows.map(k=><tr key={k.id}>
          <td><b>{k.registrationRef||'-'}</b><div className="sub">{k.countryCode||'-'} · {k.kycSubmittedAt?new Date(k.kycSubmittedAt).toLocaleDateString():'-'}</div></td>
          <td>{k.name}<div className="sub">{k.kycData?.contactName||''}{k.kycData?.contactEmail?' · '+k.kycData.contactEmail:''}</div></td>
          <td><span className="status">{k.kycStatus}</span>{k.kycRejectionReason&&<div className="sub">{k.kycRejectionReason}</div>}</td>
          <td><b>{k.customerRef||'Pending approval'}</b></td>
          <td>{k.kycStatus==='APPROVED'?<b>{k.costCenterCode||'-'}</b>:<input style={{...fieldStyle,minWidth:150}} value={kycCostCenters[k.id]||''} onChange={e=>setKycCostCenters(x=>({...x,[k.id]:e.target.value.toUpperCase()}))} placeholder="FWD-NL-01"/>}</td>
          <td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{k.kycStatus==='SUBMITTED'&&<button className="btn" disabled={busy} onClick={()=>kycAction(k.id,'review')}>Start Review</button>}{['SUBMITTED','UNDER_REVIEW'].includes(k.kycStatus)&&<><button className="btn" disabled={busy} onClick={()=>kycAction(k.id,'approve')}>Approve & Issue Ref</button><button className="btn" disabled={busy} onClick={()=>kycAction(k.id,'reject')}>Reject</button></>}</div></td>
        </tr>)}
        {!kycRows.length&&<tr><td colSpan={6}>No KYC registrations found.</td></tr>}
      </tbody></table></div>
    </div>}
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">ALL ORGANIZATIONS</div><div className="kpi">{counts.all}</div></div>
      <div className="card"><div className="sub">CUSTOMERS</div><div className="kpi">{counts.customers}</div></div>
      <div className="card"><div className="sub">AGENTS</div><div className="kpi">{counts.agents}</div></div>
      <div className="card"><div className="sub">CARRIERS</div><div className="kpi">{counts.carriers}</div></div>
    </div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>New Organization</h3><div style={formGrid}>
      <label><span style={labelStyle}>Code *</span><input style={fieldStyle} value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="e.g. CUS001"/></label>
      <label><span style={labelStyle}>Organization Name *</span><input style={fieldStyle} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Legal / trading name"/></label>
      <label><span style={labelStyle}>Country Code</span><input style={fieldStyle} maxLength={2} value={form.countryCode} onChange={e=>setForm({...form,countryCode:e.target.value})} placeholder="NL / AE / CN"/></label>
      <label><span style={labelStyle}>Primary Role</span><select style={fieldStyle} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{allRoles.map(r=><option key={r}>{r}</option>)}</select></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createOrg}>{busy?'Saving…':'Create Organization'}</button></div></div>
    <div className="card"><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><input style={{...fieldStyle,maxWidth:320}} placeholder="Search code, name, country or role" value={search} onChange={e=>setSearch(e.target.value)}/><select style={{...fieldStyle,maxWidth:220}} value={role} onChange={e=>setRole(e.target.value)}><option value="ALL">All roles</option>{allRoles.map(r=><option key={r}>{r}</option>)}</select></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Roles</th><th>Country</th><th>Status</th></tr></thead><tbody>{visible.map(o=><tr key={o.id}><td><b>{o.code}</b></td><td>{o.name}</td><td>{o.roles?.join(', ')||'-'}</td><td>{o.countryCode||'-'}</td><td><span className="status">{o.active?'Active':'Inactive'}</span></td></tr>)}{visible.length===0&&<tr><td colSpan={5}>No organizations found.</td></tr>}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}
