'use client';

import {useEffect,useMemo,useState} from 'react';
import {api,fmtDate,requireToken} from '../lib/api';

type Booking={id:string;bookingNo:string;status?:string;origin?:string;destination?:string};
type Template={id:string;category:string;title:string;message:string;requiresAcknowledgement:boolean};
type History={id:string;eventType:string;status:string;createdAt:string;payload:any};

export default function ExternalCommunicationAdmin(){
  const token=requireToken()||'';
  const [bookings,setBookings]=useState<Booking[]>([]),[templates,setTemplates]=useState<Template[]>([]),[history,setHistory]=useState<History[]>([]);
  const [bookingId,setBookingId]=useState(''),[templateId,setTemplateId]=useState(''),[category,setCategory]=useState('MILESTONE_UPDATE');
  const [title,setTitle]=useState(''),[message,setMessage]=useState(''),[audience,setAudience]=useState<string[]>(['CUSTOMER']);
  const [channels,setChannels]=useState<string[]>(['IN_APP']),[requiresAck,setRequiresAck]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);

  async function load(){
    if(!token)return;
    const [b,t,h]=await Promise.all([
      api('/bookings',token).catch(()=>[]),
      api('/portal/external-communications/templates',token).catch(()=>[]),
      api('/portal/external-communications/history',token).catch(()=>[])
    ]);
    const rows=Array.isArray(b)?b:(Array.isArray(b?.items)?b.items:[]);
    setBookings(rows);setTemplates(Array.isArray(t)?t:[]);setHistory(Array.isArray(h)?h:[]);
    if(!bookingId&&rows[0]?.id)setBookingId(rows[0].id);
  }
  useEffect(()=>{void load();},[]);

  function applyTemplate(id:string){
    setTemplateId(id);
    const t=templates.find(x=>x.id===id);
    if(!t)return;
    setCategory(t.category);setTitle(t.title);setMessage(t.message);setRequiresAck(Boolean(t.requiresAcknowledgement));
  }
  function toggle(list:string[],value:string,setter:(v:string[])=>void){setter(list.includes(value)?list.filter(x=>x!==value):[...list,value]);}

  async function publish(){
    setBusy(true);setNotice('');
    try{
      const r=await api('/portal/external-communications',token,{method:'POST',body:JSON.stringify({
        bookingId,category,title,message,audienceRoles:audience,channels,requiresAcknowledgement:requiresAck,
        idempotencyKey:[bookingId,category,title,message,audience.sort().join(','),channels.sort().join(',')].join('|')
      })});
      setNotice(r?.duplicate?'Existing identical communication reused.':'Communication published.');
      await load();
    }catch(e:any){setNotice(e.message||'External communication publish failed');}
    finally{setBusy(false);}
  }
  async function resend(id:string){
    try{const r=await api('/portal/external-communications/'+encodeURIComponent(id)+'/resend',token,{method:'POST',body:JSON.stringify({channel:'EMAIL'})});setNotice('Email retry status: '+String(r?.deliveryStatus||'UNKNOWN'));await load();}
    catch(e:any){setNotice(e.message||'Email resend failed');}
  }

  const messages=useMemo(()=>history.filter(x=>x.eventType==='EXTERNAL_MESSAGE_PUBLISHED'),[history]);

  return <div className="card" style={{marginTop:14}}>
    <div className="sub">CR-007 · EXTERNAL DELIVERY</div>
    <h2 style={{margin:'2px 0'}}>Customer / Agent Communication Publisher</h2>
    <div className="sub">Only customer-safe content is permitted. Internal notes, SLA/control-tower data, KYC, carrier secrets and internal finance detail are rejected by the API.</div>

    {notice&&<div style={{marginTop:10}}>{notice}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10,marginTop:12}}>
      <label><div className="sub">BOOKING</div><select value={bookingId} onChange={e=>setBookingId(e.target.value)} style={{width:'100%',padding:8}}>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin||''} → {b.destination||''}</option>)}</select></label>
      <label><div className="sub">APPROVED TEMPLATE</div><select value={templateId} onChange={e=>applyTemplate(e.target.value)} style={{width:'100%',padding:8}}><option value="">Custom approved-safe message</option>{templates.map(t=><option key={t.id} value={t.id}>{t.category.replaceAll('_',' ')}</option>)}</select></label>
      <label><div className="sub">CATEGORY</div><select value={category} onChange={e=>setCategory(e.target.value)} style={{width:'100%',padding:8}}>{templates.map(t=><option key={t.category} value={t.category}>{t.category.replaceAll('_',' ')}</option>)}</select></label>
    </div>

    <div style={{marginTop:10}}><div className="sub">AUDIENCE</div>{['CUSTOMER','SHIPPER','CONSIGNEE','AGENT'].map(x=><label key={x} style={{marginRight:12}}><input type="checkbox" checked={audience.includes(x)} onChange={()=>toggle(audience,x,setAudience)}/> {x}</label>)}</div>
    <div style={{marginTop:8}}><div className="sub">CHANNELS</div>{['IN_APP','EMAIL'].map(x=><label key={x} style={{marginRight:12}}><input type="checkbox" checked={channels.includes(x)} onChange={()=>toggle(channels,x,setChannels)}/> {x}</label>)} <label><input type="checkbox" checked={requiresAck} onChange={e=>setRequiresAck(e.target.checked)}/> Require acknowledgement</label></div>

    <label style={{display:'block',marginTop:10}}><div className="sub">TITLE</div><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} style={{width:'100%',padding:8}}/></label>
    <label style={{display:'block',marginTop:10}}><div className="sub">MESSAGE</div><textarea value={message} onChange={e=>setMessage(e.target.value)} rows={4} maxLength={4000} style={{width:'100%',padding:8}}/></label>
    <div style={{display:'flex',gap:8,marginTop:10}}><button className="btn" disabled={busy||!bookingId||!title||!message||!audience.length||!channels.length} onClick={()=>void publish()}>{busy?'Publishing…':'Publish external communication'}</button><button className="btn" onClick={()=>void load()}>Refresh history</button></div>

    <h3 style={{marginTop:18}}>Delivery History</h3>
    <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>When</th><th>Job</th><th>Category</th><th>Audience</th><th>Channels</th><th>Status</th><th></th></tr></thead><tbody>
      {messages.slice(0,80).map(x=><tr key={x.id}><td>{fmtDate(x.createdAt)}</td><td>{x.payload?.bookingNo||'-'}</td><td>{String(x.payload?.category||'').replaceAll('_',' ')}</td><td>{(x.payload?.audienceRoles||[]).join(', ')}</td><td>{(x.payload?.channels||[]).join(' + ')}</td><td><span className="status">{x.status}</span></td><td>{(x.payload?.channels||[]).includes('EMAIL')&&<button className="btn" onClick={()=>void resend(x.id)}>Retry email</button>}</td></tr>)}
      {!messages.length&&<tr><td colSpan={7}>No external communications have been published yet.</td></tr>}
    </tbody></table></div>
  </div>;
}
