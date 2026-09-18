'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Branch={id:string;code:string;name:string;countryCode:string;active:boolean};
type Org={id:string;code:string;name:string;roles:string[];active:boolean};
type User={id:string;email:string;displayName:string;role:string;branchId?:string|null;agentId?:string|null;customerId?:string|null;partyId?:string|null;costCenterCode?:string|null;agentMode?:string|null;permissions?:string[];active:boolean};
type Integration={id:string;sourceSystem:string;eventType:string;externalId?:string;objectType:string;objectId:string;status:string;attemptCount:number;createdAt:string};

const ACCESS_RIGHTS=['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS','CARRIER_SPACE_CONTROL','FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS','FORWARDING_DIRECT_COLOAD_CROSS_TRADE','KYC_APPROVAL','RATE_PROVIDER_ADMIN','JOB_MODEL_CONVERT','FINANCE'];
const ROLE_DEFAULTS:Record<string,string[]>={
  GLOBAL_ADMIN:ACCESS_RIGHTS,CONTROL_TOWER:['CARRIER_SPACE_CONTROL'],BRANCH_OPS:['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS','CARRIER_SPACE_CONTROL'],FINANCE:['FINANCE'],
  AGENT:['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS'],CUSTOMER:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],SHIPPER:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],CONSIGNEE:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS']
};
const emptyUser={email:'',displayName:'',role:'BRANCH_OPS',branchId:'',agentId:'',customerId:'',partyId:'',costCenterCode:'',agentMode:'',permissions:ROLE_DEFAULTS.BRANCH_OPS};

export default function AdministrationPage(){
  const [token,setToken]=useState('');
  const [branches,setBranches]=useState<Branch[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [users,setUsers]=useState<User[]>([]);
  const [events,setEvents]=useState<Integration[]>([]);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'BRANCHES'|'USERS'|'INTEGRATIONS'>('BRANCHES');
  const [branch,setBranch]=useState({code:'',name:'',countryCode:''});
  const [user,setUser]=useState(emptyUser);
  const [editingId,setEditingId]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const [b,u,i,o]=await Promise.all([
        api('/operations/branches',t),
        api('/operations/users',t).catch(()=>[]),
        api('/operations/integrations',t),
        api('/organizations',t).catch(()=>[])
      ]);
      setBranches(Array.isArray(b)?b:[]);
      setUsers(Array.isArray(u)?u:[]);
      setEvents(Array.isArray(i)?i:[]);
      setOrgs(Array.isArray(o)?o:[]);
    }catch(e:any){setMessage(e.message||'Unable to load administration data');}
  }

  async function createBranch(){
    setBusy(true);setMessage('');
    try{await api('/operations/branches',token,{method:'POST',body:JSON.stringify(branch)});setBranch({code:'',name:'',countryCode:''});setMessage('Branch created.');await load();}
    catch(e:any){setMessage(e.message||'Could not create branch');}
    finally{setBusy(false);}
  }

  function resetUser(){setEditingId('');setUser(emptyUser);}
  function editUser(row:User){setEditingId(row.id);setUser({email:row.email,displayName:row.displayName,role:row.role,branchId:row.branchId||'',agentId:row.agentId||'',customerId:row.customerId||'',partyId:row.partyId||'',costCenterCode:row.costCenterCode||'',agentMode:row.agentMode||'',permissions:Array.isArray(row.permissions)?row.permissions:ROLE_DEFAULTS[row.role]||[]});setTab('USERS');window.scrollTo({top:0,behavior:'smooth'});}

  async function saveUser(){
    setBusy(true);setMessage('');
    try{
      const body={...user,branchId:user.branchId||null,agentId:user.agentId||null,customerId:user.customerId||null,partyId:user.partyId||null};
      if(editingId){await api(`/operations/users/${editingId}`,token,{method:'PATCH',body:JSON.stringify(body)});setMessage('User account updated.');}
      else {await api('/operations/users',token,{method:'POST',body:JSON.stringify(body)});setMessage('User account created.');}
      resetUser();await load();
    }catch(e:any){setMessage(e.message||'Could not save user');}
    finally{setBusy(false);}
  }

  async function toggleUser(id:string){
    setBusy(true);setMessage('');
    try{await api(`/operations/users/${id}/toggle`,token,{method:'POST'});await load();}
    catch(e:any){setMessage(e.message||'Could not update user');}
    finally{setBusy(false);}
  }

  const activeUsers=useMemo(()=>users.filter(x=>x.active).length,[users]);
  const agents=useMemo(()=>orgs.filter(o=>o.active&&o.roles?.includes('AGENT')),[orgs]);
  const customers=useMemo(()=>orgs.filter(o=>o.active&&o.roles?.includes('CUSTOMER')),[orgs]);
  const shippers=useMemo(()=>orgs.filter(o=>o.active&&o.roles?.includes('SHIPPER')),[orgs]);
  const consignees=useMemo(()=>orgs.filter(o=>o.active&&o.roles?.includes('CONSIGNEE')),[orgs]);
  const failedEvents=useMemo(()=>events.filter(x=>x.status==='FAILED').length,[events]);
  const scopeName=(u:User)=>{
    if(u.branchId){const b=branches.find(x=>x.id===u.branchId);return b?`${b.code} · ${b.name}`:u.branchId;}
    if(u.agentId){const o=orgs.find(x=>x.id===u.agentId);return o?`${o.code} · ${o.name}`:u.agentId;}
    if(u.customerId){const o=orgs.find(x=>x.id===u.customerId);return o?`${o.code} · ${o.name}`:u.customerId;}
    if(u.partyId){const o=orgs.find(x=>x.id===u.partyId);return o?`${o.code} · ${o.name}`:u.partyId;}
    return 'Global / none';
  };
  const roleChanged=(role:string)=>setUser(x=>({...x,role,branchId:role==='BRANCH_OPS'||role==='FINANCE'?x.branchId:'',agentId:role==='AGENT'?x.agentId:'',customerId:role==='CUSTOMER'?x.customerId:'',partyId:role==='SHIPPER'||role==='CONSIGNEE'?x.partyId:'',agentMode:role==='AGENT'?'LINER_AGENCY_ONLY':'',permissions:ROLE_DEFAULTS[role]||[]}));
  const togglePermission=(right:string)=>setUser(x=>({...x,permissions:x.permissions.includes(right)?x.permissions.filter(p=>p!==right):[...x.permissions,right]}));
  const btn=(key:typeof tab,label:string)=><button className="btn" style={{opacity:tab===key?1:.68}} onClick={()=>setTab(key)}>{label}</button>;

  return <WorkspaceShell title="Administration" subtitle="Branches, managed user access, scopes and integration monitoring" active="/administration" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">BRANCHES</div><div className="kpi">{branches.length}</div></div>
      <div className="card"><div className="sub">USERS</div><div className="kpi">{users.length}</div></div>
      <div className="card"><div className="sub">ACTIVE USERS</div><div className="kpi">{activeUsers}</div></div>
      <div className="card"><div className="sub">FAILED INTEGRATIONS</div><div className="kpi">{failedEvents}</div></div>
    </div>
    <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>{btn('BRANCHES','Branches')}{btn('USERS','Users & Access')}{btn('INTEGRATIONS','Integration Events')}</div>

    {tab==='BRANCHES'&&<>
      <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>New Branch</h3><div style={formGrid}>
        <label><span style={labelStyle}>Branch Code *</span><input style={fieldStyle} value={branch.code} onChange={e=>setBranch({...branch,code:e.target.value})}/></label>
        <label><span style={labelStyle}>Branch Name *</span><input style={fieldStyle} value={branch.name} onChange={e=>setBranch({...branch,name:e.target.value})}/></label>
        <label><span style={labelStyle}>Country Code *</span><input maxLength={2} style={fieldStyle} value={branch.countryCode} onChange={e=>setBranch({...branch,countryCode:e.target.value})}/></label>
      </div><div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy} onClick={createBranch}>Create Branch</button></div></div>
      <div className="card"><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Country</th><th>Status</th></tr></thead><tbody>{branches.map(b=><tr key={b.id}><td><b>{b.code}</b></td><td>{b.name}</td><td>{b.countryCode}</td><td><span className="status">{b.active?'Active':'Inactive'}</span></td></tr>)}{!branches.length&&<tr><td colSpan={4}>No branches configured.</td></tr>}</tbody></table></div>
    </>}

    {tab==='USERS'&&<>
      <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>{editingId?'Edit User Access':'New User Account'}</h3><div style={formGrid}>
        <label><span style={labelStyle}>Email *</span><input style={fieldStyle} value={user.email} onChange={e=>setUser({...user,email:e.target.value})}/></label>
        <label><span style={labelStyle}>Display Name *</span><input style={fieldStyle} value={user.displayName} onChange={e=>setUser({...user,displayName:e.target.value})}/></label>
        <label><span style={labelStyle}>Role *</span><select style={fieldStyle} value={user.role} onChange={e=>roleChanged(e.target.value)}>{['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER','SHIPPER','CONSIGNEE'].map(x=><option key={x}>{x}</option>)}</select></label>
        {(user.role==='BRANCH_OPS'||user.role==='FINANCE')&&<label><span style={labelStyle}>Branch {user.role==='BRANCH_OPS'?'*':'(optional)'}</span><select style={fieldStyle} value={user.branchId} onChange={e=>setUser({...user,branchId:e.target.value})}><option value="">{user.role==='BRANCH_OPS'?'-- Select branch --':'Global finance'}</option>{branches.filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}</select></label>}
        {user.role==='AGENT'&&<label><span style={labelStyle}>Agent Organization *</span><select style={fieldStyle} value={user.agentId} onChange={e=>setUser({...user,agentId:e.target.value})}><option value="">-- Select agent --</option>{agents.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>}
        <label><span style={labelStyle}>Cost Center</span><input style={fieldStyle} value={user.costCenterCode} onChange={e=>setUser({...user,costCenterCode:e.target.value.toUpperCase()})} placeholder="e.g. FWD-NL-01"/></label>
        {user.role==='AGENT'&&<label><span style={labelStyle}>Agent Mode</span><input style={fieldStyle} value="LINER_AGENCY_ONLY" disabled/></label>}
        {user.role==='CUSTOMER'&&<label><span style={labelStyle}>Customer Organization *</span><select style={fieldStyle} value={user.customerId} onChange={e=>setUser({...user,customerId:e.target.value})}><option value="">-- Select customer --</option>{customers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>}
        {user.role==='SHIPPER'&&<label><span style={labelStyle}>Shipper Organization *</span><select style={fieldStyle} value={user.partyId} onChange={e=>setUser({...user,partyId:e.target.value})}><option value="">-- Select shipper --</option>{shippers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>}
        {user.role==='CONSIGNEE'&&<label><span style={labelStyle}>Consignee Organization *</span><select style={fieldStyle} value={user.partyId} onChange={e=>setUser({...user,partyId:e.target.value})}><option value="">-- Select consignee --</option>{consignees.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>}
      </div>
      <div style={{marginTop:12}}><span style={labelStyle}>User Rights</span><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:6}}>
        {ACCESS_RIGHTS.map(r=><label key={r} style={{display:'flex',gap:7,alignItems:'center',padding:'6px 8px',border:'1px solid #e1e8ee',borderRadius:6}}><input type="checkbox" checked={user.permissions.includes(r)} disabled={user.role==='GLOBAL_ADMIN'} onChange={()=>togglePermission(r)}/><span>{r}</span></label>)}
      </div>{user.role==='AGENT'&&user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE')&&!user.costCenterCode&&<div style={{marginTop:8,fontWeight:700}}>A cost center is mandatory for Agent direct co-load / cross-trade Forwarding access.</div>}</div>
      <div className="sub" style={{marginTop:10}}>Provisioned users receive their role, cost center, operating mode and explicit rights from this record at login. Agent defaults to Liner Agency only; Forwarding direct co-load / cross-trade requires its dedicated right.</div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>{editingId&&<button className="btn" onClick={resetUser}>Cancel</button>}<button className="btn" disabled={busy} onClick={saveUser}>{busy?'Saving...':editingId?'Save Access':'Create User'}</button></div></div>
      <div className="card" style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Authorized Scope</th><th>Cost Center</th><th>Mode / Rights</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.displayName}</b></td><td>{u.email}</td><td>{u.role}</td><td>{scopeName(u)}</td><td>{u.costCenterCode||'-'}</td><td>{u.agentMode||'-'}<div className="sub">{(u.permissions||[]).join(', ')||'No explicit rights'}</div></td><td><span className="status">{u.active?'Active':'Inactive'}</span></td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn" onClick={()=>editUser(u)}>Edit Access</button><button className="btn" disabled={busy} onClick={()=>toggleUser(u.id)}>{u.active?'Deactivate':'Activate'}</button></div></td></tr>)}{!users.length&&<tr><td colSpan={8}>No managed user accounts configured or administrator permission is required.</td></tr>}</tbody></table></div>
    </>}

    {tab==='INTEGRATIONS'&&<div className="card" style={{overflowX:'auto'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:10}}><div><h3 style={{margin:0}}>Integration Event Monitor</h3><div className="sub">For retry/reprocess and payload inspection use Integration Control.</div></div><a className="btn" href="/integrations" style={{textDecoration:'none'}}>Open Integration Control</a></div><table className="table"><thead><tr><th>Created</th><th>Source</th><th>Event</th><th>Object</th><th>External ID</th><th>Attempts</th><th>Status</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{fmtDate(e.createdAt)}</td><td>{e.sourceSystem}</td><td><b>{e.eventType}</b></td><td>{e.objectType} · {e.objectId}</td><td>{e.externalId||'-'}</td><td>{e.attemptCount}</td><td><span className="status">{e.status}</span></td></tr>)}{!events.length&&<tr><td colSpan={7}>No integration events recorded.</td></tr>}</tbody></table></div>}
  </WorkspaceShell>;
}
