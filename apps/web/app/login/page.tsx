'use client';
import {useEffect,useMemo,useState} from 'react';

const API=process.env.NEXT_PUBLIC_API_URL||'/api-proxy';
type Org={id:string;code:string;name:string;roles:string[]};

export default function Login(){
  const [email,setEmail]=useState('admin@ancline.net');
  const [role,setRole]=useState('GLOBAL_ADMIN');
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [scopeId,setScopeId]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{fetch(`${API}/organizations`,{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(x=>setOrgs(Array.isArray(x)?x:[])).catch(()=>setOrgs([]));},[]);
  const scopedOrgs=useMemo(()=>role==='CUSTOMER'?orgs.filter(o=>o.roles?.includes('CUSTOMER')):role==='AGENT'?orgs.filter(o=>o.roles?.includes('AGENT')):[],[role,orgs]);
  useEffect(()=>{setScopeId(scopedOrgs[0]?.id||'');},[role,scopedOrgs.length]);

  async function login(){
    if((role==='CUSTOMER'||role==='AGENT')&&!scopeId){setMsg(`Select a ${role==='CUSTOMER'?'customer':'agent'} organization first.`);return;}
    setBusy(true);setMsg('');
    try{
      const payload:any={email,role};
      if(role==='CUSTOMER')payload.customerId=scopeId;
      if(role==='AGENT')payload.agentId=scopeId;
      const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const j=await r.json();
      if(!r.ok||!j.accessToken)throw new Error(j?.message||'Login failed');
      localStorage.setItem('ancline_token',j.accessToken);
      localStorage.setItem('ancline_user',JSON.stringify(j.user));
      location.href=role==='CUSTOMER'?'/customer-portal':role==='AGENT'?'/agent-portal':'/';
    }catch(e:any){setMsg(e?.message||'Login failed');}finally{setBusy(false);}
  }

  return <main style={{padding:30,maxWidth:500,margin:'40px auto'}}>
    <h1 style={{marginBottom:4}}>ANCLINE WORLDWIDE</h1><p className="sub">Secure role-based ERP access</p>
    <div className="card">
      <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:9,margin:'6px 0 12px'}}/></label>
      <label>Role<select value={role} onChange={e=>setRole(e.target.value)} style={{width:'100%',padding:9,margin:'6px 0 12px'}}>
        {['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER'].map(x=><option key={x}>{x}</option>)}
      </select></label>
      {(role==='CUSTOMER'||role==='AGENT')&&<label>{role==='CUSTOMER'?'Customer Organization':'Agent Organization'}<select value={scopeId} onChange={e=>setScopeId(e.target.value)} style={{width:'100%',padding:9,margin:'6px 0 12px'}}><option value="">Select organization</option>{scopedOrgs.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>}
      <button className="btn" onClick={login} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
      {msg&&<div style={{marginTop:10}}>{msg}</div>}
    </div>
  </main>;
}
