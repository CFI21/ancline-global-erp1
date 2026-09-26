'use client';
import {useEffect,useMemo,useState} from 'react';
import {api} from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[]};
type OidcConfig={configured:boolean;devLoginAllowed:boolean;clientId?:string;redirectUri?:string;authorizationEndpoint?:string|null};

function randomToken(bytes=32){
  const a=new Uint8Array(bytes);crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}
function b64url(buf:ArrayBuffer){
  const bytes=new Uint8Array(buf);let s='';for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export default function Login(){
  const [email,setEmail]=useState('test.admin@ancline.invalid');
  const [password,setPassword]=useState('');
  const [role,setRole]=useState('GLOBAL_ADMIN');
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [scopeId,setScopeId]=useState('');
  const [oidc,setOidc]=useState<OidcConfig>({configured:false,devLoginAllowed:true});
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    void Promise.all([
      api('/organizations').catch(()=>[]),
      api('/auth/oidc/configuration').catch(()=>({configured:false,devLoginAllowed:true}))
    ]).then(([o,c])=>{setOrgs(Array.isArray(o)?o:[]);setOidc(c||{configured:false,devLoginAllowed:true});});
  },[]);
  const scopedOrgs=useMemo(()=>role==='CUSTOMER'?orgs.filter(o=>o.roles?.includes('CUSTOMER')):role==='SHIPPER'?orgs.filter(o=>o.roles?.includes('SHIPPER')):role==='CONSIGNEE'?orgs.filter(o=>o.roles?.includes('CONSIGNEE')):role==='AGENT'?orgs.filter(o=>o.roles?.includes('AGENT')):role==='BRANCH_OPS'?orgs.filter(o=>o.roles?.includes('ANCLINE_BRANCH')):[],[role,orgs]);
  useEffect(()=>{setScopeId(scopedOrgs[0]?.id||'');},[role,scopedOrgs.length]);

  async function login(){
    setBusy(true);setMsg('');
    try{
      // Managed accounts are resolved by email on the API. Scope selectors remain
      // optional here so a pre-provisioned BRANCH_OPS / SHIPPER / CONSIGNEE
      // account is not blocked before the API can load its stored scope.
      // Unmanaged transitional logins still fail closed server-side if scope is missing.
      const payload:any={email,password,role};
      if(role==='CUSTOMER'&&scopeId)payload.customerId=scopeId;
      if((role==='SHIPPER'||role==='CONSIGNEE')&&scopeId)payload.partyId=scopeId;
      if(role==='AGENT'&&scopeId)payload.agentId=scopeId;
      if(role==='BRANCH_OPS'&&scopeId)payload.branchId=scopeId;
      const j=await api('/auth/login',undefined,{method:'POST',body:JSON.stringify(payload)});
      if(!j?.accessToken)throw new Error('Login failed');
      localStorage.setItem('ancline_token',j.accessToken);
      localStorage.setItem('ancline_user',JSON.stringify(j.user));
      const r=j.user?.role;
      location.href=['CUSTOMER','SHIPPER','CONSIGNEE'].includes(r)?'/customer-portal':r==='AGENT'?'/agent-portal':r==='BRANCH_OPS'?'/nvocc-portal':'/';
    }catch(e:any){setMsg(e?.message||'Login failed');}finally{setBusy(false);}
  }

  async function sso(){
    if(!oidc.configured||!oidc.authorizationEndpoint||!oidc.clientId||!oidc.redirectUri){setMsg('Company SSO is not fully configured yet.');return;}
    setBusy(true);setMsg('');
    try{
      const state=randomToken(24);const verifier=randomToken(48);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
      const challenge=b64url(digest);
      sessionStorage.setItem('ancline_oidc_state',state);
      sessionStorage.setItem('ancline_oidc_verifier',verifier);
      const u=new URL(oidc.authorizationEndpoint);
      u.searchParams.set('response_type','code');u.searchParams.set('client_id',oidc.clientId);
      u.searchParams.set('redirect_uri',oidc.redirectUri);u.searchParams.set('scope','openid email profile');
      u.searchParams.set('state',state);u.searchParams.set('code_challenge',challenge);u.searchParams.set('code_challenge_method','S256');
      location.href=u.toString();
    }catch(e:any){setBusy(false);setMsg(e?.message||'Unable to start company sign-in');}
  }

  return <main style={{padding:30,maxWidth:520,margin:'40px auto'}}>
    <h1 style={{marginBottom:4}}>ANCLINE WORLDWIDE</h1><p className="sub">Secure role-based ERP access</p>
    <div className="card">
      {oidc.configured&&<><button className="btn" onClick={sso} disabled={busy} style={{width:'100%',marginBottom:14}}>{busy?'Starting sign-in…':'Sign in with Company SSO'}</button>{oidc.devLoginAllowed&&<div className="sub" style={{textAlign:'center',margin:'0 0 14px'}}>or use transitional ANCLINE access</div>}</>}
      {oidc.devLoginAllowed&&<>
        <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" style={{width:'100%',padding:9,margin:'6px 0 12px'}}/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" style={{width:'100%',padding:9,margin:'6px 0 12px'}}/></label>
        <label>Role<select value={role} onChange={e=>setRole(e.target.value)} style={{width:'100%',padding:9,margin:'6px 0 12px'}}>
          {['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER','SHIPPER','CONSIGNEE'].map(x=><option key={x}>{x}</option>)}
        </select></label>
        {(role==='CUSTOMER'||role==='SHIPPER'||role==='CONSIGNEE'||role==='AGENT'||role==='BRANCH_OPS')&&<label>{role==='CUSTOMER'?'Customer Organization':role==='SHIPPER'?'Shipper Organization':role==='CONSIGNEE'?'Consignee Organization':role==='AGENT'?'Agent Organization':'Branch Organization'}<select value={scopeId} onChange={e=>setScopeId(e.target.value)} style={{width:'100%',padding:9,margin:'6px 0 12px'}}><option value="">Select organization</option>{scopedOrgs.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>}
        <button className="btn" onClick={login} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
      </>}
      {!oidc.devLoginAllowed&&!oidc.configured&&<div>ANCLINE sign-in is not configured. Contact your administrator.</div>}
      {msg&&<div style={{marginTop:10}}>{msg}</div>}<div style={{marginTop:14,paddingTop:12,borderTop:'1px solid #e2e8ee'}}><b>New Forwarding customer?</b><div className="sub" style={{margin:'4px 0 8px'}}>Register company and complete KYC before requesting rates or quotes.</div><a className="btn" href="/customer-registration" style={{textDecoration:'none'}}>Register & Complete KYC</a></div>
    </div>
  </main>;
}
