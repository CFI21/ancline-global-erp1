'use client';
import {useEffect,useState} from 'react';

export default function Callback(){
  const [msg,setMsg]=useState('Completing sign-in...');
  useEffect(()=>{
    // Production implementation should exchange authorization code server-side.
    // This page is intentionally a scaffold until the chosen OIDC provider is configured.
    const params=new URLSearchParams(location.search);
    const code=params.get('code');
    if(!code) setMsg('Missing authorization code.');
    else setMsg('OIDC callback received. Provider integration must complete server-side token exchange.');
  },[]);
  return <main style={{padding:30}}><h1>ANCLINE Sign-in</h1><p>{msg}</p></main>;
}
