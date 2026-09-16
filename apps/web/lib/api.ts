export const API=process.env.NEXT_PUBLIC_API_URL||'/api-proxy';

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}

function clearExpiredSession(){
  if(typeof window==='undefined') return;
  localStorage.removeItem('ancline_token');
  localStorage.removeItem('ancline_user');
  if(window.location.pathname!=='/login') window.location.replace('/login');
}

function friendlyHttpError(status:number,statusText:string,text:string,data:any){
  const contentTypeHtml=/^\s*<!doctype html|^\s*<html/i.test(text||'');
  if(status===502||status===503||status===504){
    return 'ANCLINE services are temporarily reconnecting. Please try again in a few seconds.';
  }
  if(status===401) return 'Your ANCLINE session has expired. Please sign in again.';
  if(status===403) return 'You do not have permission to perform this action.';
  if(contentTypeHtml) return `ANCLINE service error (${status}). Please refresh and try again.`;
  const message=typeof data==='string'?data:(data?.message||data?.error||`${status} ${statusText}`);
  return Array.isArray(message)?message.join(', '):String(message);
}

export async function api(path:string,token?:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  if(init.body!==undefined) headers.set('content-type','application/json');
  if(token) headers.set('authorization',`Bearer ${token}`);

  let lastError:Error|undefined;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(`${API}${path}`,{...init,headers,cache:'no-store'});
      const text=await r.text();
      let data:any={};
      try{data=text?JSON.parse(text):{};}catch{data=text;}

      if(r.ok) return data;
      if(r.status===401&&token) clearExpiredSession();

      const retryable=r.status===502||r.status===503||r.status===504;
      const message=friendlyHttpError(r.status,r.statusText,text,data);
      lastError=new Error(message);
      if(retryable&&attempt<2){await sleep(attempt===0?700:1400);continue;}
      throw lastError;
    }catch(e:any){
      if(e instanceof Error&&lastError===e) throw e;
      lastError=new Error('Unable to reach ANCLINE services. Please check your connection and try again.');
      if(attempt<2){await sleep(attempt===0?700:1400);continue;}
      throw lastError;
    }
  }
  throw lastError||new Error('Unable to reach ANCLINE services.');
}

export function requireToken(){
  if(typeof window==='undefined') return '';
  const token=localStorage.getItem('ancline_token')||'';
  if(!token) window.location.replace('/login');
  return token;
}

export function currentUser(){
  if(typeof window==='undefined') return {} as any;
  try{return JSON.parse(localStorage.getItem('ancline_user')||'{}');}catch{return {} as any;}
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
