'use client';
import {useEffect,useState} from 'react';
import {api} from '../../../lib/api';

export default function Callback(){
  const [msg,setMsg]=useState('Completing secure sign-in...');

  useEffect(()=>{
    void (async()=>{
      try{
        const params=new URLSearchParams(location.search);
        const providerError=params.get('error');
        if(providerError) throw new Error(params.get('error_description')||providerError);
        const code=params.get('code');const state=params.get('state');
        const expected=sessionStorage.getItem('ancline_oidc_state')||'';
        const verifier=sessionStorage.getItem('ancline_oidc_verifier')||'';
        if(!code) throw new Error('Missing authorization code.');
        if(!state||!expected||state!==expected) throw new Error('Sign-in state validation failed. Please start again.');
        if(!verifier) throw new Error('PKCE verification data is missing. Please start again.');

        const cfg=await api('/auth/oidc/configuration');
        if(!cfg?.configured||!cfg?.redirectUri) throw new Error('Company SSO is not configured.');
        const result=await api('/auth/oidc/exchange',undefined,{method:'POST',body:JSON.stringify({code,codeVerifier:verifier,redirectUri:cfg.redirectUri})});
        if(!result?.accessToken||!result?.user) throw new Error('ANCLINE session could not be created.');

        localStorage.setItem('ancline_token',result.accessToken);
        localStorage.setItem('ancline_user',JSON.stringify(result.user));
        sessionStorage.removeItem('ancline_oidc_state');sessionStorage.removeItem('ancline_oidc_verifier');
        const role=result.user.role;
        location.replace(role==='CUSTOMER'?'/customer-portal':role==='AGENT'?'/agent-portal':'/');
      }catch(e:any){
        sessionStorage.removeItem('ancline_oidc_state');sessionStorage.removeItem('ancline_oidc_verifier');
        setMsg(e?.message||'Secure sign-in could not be completed.');
      }
    })();
  },[]);

  return <main style={{padding:30,maxWidth:560,margin:'40px auto'}}><h1>ANCLINE Sign-in</h1><div className="card"><p>{msg}</p><a className="btn" href="/login" style={{textDecoration:'none',display:'inline-block'}}>Back to sign in</a></div></main>;
}
