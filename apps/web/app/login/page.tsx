'use client';
import {useState} from 'react';

export default function Login(){
  const [email,setEmail]=useState('admin@ancline.net');
  const [role,setRole]=useState('GLOBAL_ADMIN');
  const [msg,setMsg]=useState('');
  async function login(){
    const r=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000')+'/auth/login',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email,role})
    });
    const j=await r.json();
    if(j.accessToken){
      localStorage.setItem('ancline_token',j.accessToken);
      localStorage.setItem('ancline_user',JSON.stringify(j.user));
      location.href='/';
    }else setMsg('Login failed');
  }
  return <main style={{padding:30,maxWidth:480,margin:'40px auto'}}>
    <h1>ANCLINE Login</h1>
    <p className="sub">Phase 3 development authentication</p>
    <div className="card">
      <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:8,margin:'6px 0 12px'}}/></label>
      <label>Role<select value={role} onChange={e=>setRole(e.target.value)} style={{width:'100%',padding:8,margin:'6px 0 12px'}}>
        {['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER'].map(x=><option key={x}>{x}</option>)}
      </select></label>
      <button className="btn" onClick={login}>Sign in</button>
      <div>{msg}</div>
    </div>
  </main>
}
