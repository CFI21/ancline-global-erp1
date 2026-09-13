'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[];countryCode?:string;active:boolean;createdAt?:string};
const allRoles=['CUSTOMER','AGENT','CARRIER','SLOT_PROVIDER','DEPOT','TERMINAL','TRUCKER','BROKER','VENDOR','ANCLINE_BRANCH'];

export default function OrganizationsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Org[]>([]);
  const [form,setForm]=useState({code:'',name:'',countryCode:'',role:'CUSTOMER'});
  const [search,setSearch]=useState('');
  const [role,setRole]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const data=await api('/organizations',t);setRows(Array.isArray(data)?data:[]);}catch(e:any){setMessage(e.message||'Unable to load organizations');}}
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

  return <WorkspaceShell title="Organizations" subtitle="Customers, agents, carriers and operational partners" active="/organizations" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
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
