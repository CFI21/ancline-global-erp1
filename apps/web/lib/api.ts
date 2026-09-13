export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000/api';

export async function api(path:string,token?:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  if(init.body!==undefined) headers.set('content-type','application/json');
  if(token) headers.set('authorization',`Bearer ${token}`);
  const r=await fetch(`${API}${path}`,{...init,headers,cache:'no-store'});
  const text=await r.text();
  let data:any={};
  try{data=text?JSON.parse(text):{};}catch{data=text;}
  if(!r.ok){
    const message=typeof data==='string'?data:(data?.message||data?.error||`${r.status} ${r.statusText}`);
    throw new Error(Array.isArray(message)?message.join(', '):String(message));
  }
  return data;
}

export function requireToken(){
  if(typeof window==='undefined') return '';
  const token=localStorage.getItem('ancline_token')||'';
  if(!token) window.location.replace('/login');
  return token;
}

export function signOut(){
  if(typeof window==='undefined') return;
  localStorage.removeItem('ancline_token');
  localStorage.removeItem('ancline_user');
  window.location.href='/login';
}

export function fmtDate(value?:string|null){
  if(!value) return '-';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString();
}

export function fmtMoney(value:any,currency='USD'){
  const n=Number(value||0);
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(n);}catch{return `${currency} ${n.toFixed(2)}`;}
}
