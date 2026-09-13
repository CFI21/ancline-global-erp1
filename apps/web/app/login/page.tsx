'use client';
import {useState} from 'react';

const API=process.env.NEXT_PUBLIC_API_URL||'/api-proxy';

export default function Login(){
  const [email,setEmail]=useState('admin@ancline.net');
  const [password,setPassword]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function login(){
    if(!email.trim()||!password){setMsg('Email and password are required.');return;}
    setBusy(true);setMsg('');
    try{
      const r=await fetch(`${API}/auth/login`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({email:email.trim(),password})
      });
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.accessToken)throw new Error(j?.message||'Login failed');
      localStorage.setItem('ancline_token',j.accessToken);
      localStorage.setItem('ancline_user',JSON.stringify(j.user));
      const role=String(j.user?.role||'');
      location.href=role==='CUSTOMER'?'/customer-portal':role==='AGENT'?'/agent-portal':'/';
    }catch(e:any){setMsg(e?.message||'Login failed');}finally{setBusy(false);}
  }

  return <main style={{padding:30,maxWidth:500,margin:'40px auto'}}>
    <h1 style={{marginBottom:4}}>ANCLINE WORLDWIDE</h1>
    <p className="sub">Secure staging access</p>
    <div className="card">
      <label>Email<input autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:9,margin:'6px 0 12px'}}/></label>
      <label>Password<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void login();}} style={{width:'100%',padding:9,margin:'6px 0 12px'}}/></label>
      <button className="btn" onClick={login} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
      {msg&&<div style={{marginTop:10}}>{msg}</div>}
    </div>
  </main>;
}
