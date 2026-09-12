const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';

export async function api(path:string,token?:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  headers.set('content-type','application/json');
  if(token) headers.set('authorization',`Bearer ${token}`);
  const r=await fetch(`${API}${path}`,{...init,headers,cache:'no-store'});
  if(!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
