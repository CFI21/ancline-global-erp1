'use client';

import {useEffect,useMemo,useState} from 'react';
import {api,fmtDate,requireToken} from '../lib/api';

type ExternalMessage={
  id:string;bookingId:string;bookingNo?:string|null;category:string;title:string;message:string;
  channels:string[];requiresAcknowledgement:boolean;read:boolean;acknowledged:boolean;
  publishedAt:string;deliveryStatus?:Record<string,string>;actionHref:string;
};
type Feed={summary?:{total?:number;unread?:number;ackRequired?:number;acknowledged?:number};preferences?:{channels?:string[];categories?:string[];muteOptional?:boolean;mandatoryOperational?:boolean};items?:ExternalMessage[]};

export default function ExternalPortalCommunications({compact=false}:{compact?:boolean}){
  const [data,setData]=useState<Feed>({items:[],summary:{},preferences:{}});
  const [err,setErr]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState('ALL');
  const token=requireToken()||'';

  async function load(){
    if(!token)return;
    setBusy(true);setErr('');
    try{setData(await api('/portal/communications',token)||{items:[],summary:{},preferences:{}});}
    catch(e:any){setErr(e.message||'Unable to load communications');}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load();},[]);

  async function markRead(item:ExternalMessage){
    try{await api('/portal/communications/'+encodeURIComponent(item.id)+'/read',token,{method:'POST',body:'{}'});await load();}
    catch(e:any){setErr(e.message||'Unable to mark message read');}
  }
  async function acknowledge(item:ExternalMessage){
    try{await api('/portal/communications/'+encodeURIComponent(item.id)+'/acknowledge',token,{method:'POST',body:'{}'});await load();}
    catch(e:any){setErr(e.message||'Unable to acknowledge message');}
  }
  async function setMuteOptional(muteOptional:boolean){
    const p=data.preferences||{};
    try{
      const next=await api('/portal/communication-preferences',token,{method:'PATCH',body:JSON.stringify({...p,muteOptional})});
      setData(d=>({...d,preferences:next}));await load();
    }catch(e:any){setErr(e.message||'Unable to update communication preferences');}
  }

  const items=data.items||[];
  const visible=useMemo(()=>items.filter(x=>filter==='ALL'||filter==='UNREAD'?!x.read:filter==='ACTION'?x.requiresAcknowledgement&&!x.acknowledged:x.category===filter),[items,filter]);
  const categories=[...new Set(items.map(x=>x.category))].sort();
  const s=data.summary||{},prefs=data.preferences||{};

  return <div className="card" style={{marginTop:compact?12:16}}>
    <div className="top" style={{gap:10,alignItems:'flex-start'}}>
      <div>
        <div className="sub">CUSTOMER-SAFE COMMUNICATIONS</div>
        <h2 style={{margin:'2px 0'}}>Communication Center</h2>
        <div className="sub">Booking updates, document requests, schedule changes and approved action notices only.</div>
      </div>
      <button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Refreshing…':'Refresh'}</button>
    </div>
    {err&&<div style={{marginTop:8}}>{err}</div>}
    <div className="grid" style={{marginTop:12}}>
      <div><div className="sub">TOTAL</div><b>{s.total||0}</b></div>
      <div><div className="sub">UNREAD</div><b>{s.unread||0}</b></div>
      <div><div className="sub">ACTION REQUIRED</div><b>{s.ackRequired||0}</b></div>
      <div><div className="sub">ACKNOWLEDGED</div><b>{s.acknowledged||0}</b></div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginTop:12}}>
      <select aria-label="Communication filter" value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:8,border:'1px solid #cfd9e2',borderRadius:6}}>
        <option value="ALL">All messages</option><option value="UNREAD">Unread</option><option value="ACTION">Action required</option>
        {categories.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}
      </select>
      <label className="sub"><input type="checkbox" checked={!prefs.muteOptional} onChange={e=>void setMuteOptional(!e.target.checked)}/> Optional updates enabled</label>
      <span className="status">Required operational messages always remain visible</span>
    </div>
    <div style={{display:'grid',gap:8,marginTop:12}}>
      {visible.map(item=><div key={item.id} style={{border:'1px solid #e1e7ed',borderRadius:8,padding:10,opacity:item.read?.75:1}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:240}}>
            <div className="sub">{item.category.replaceAll('_',' ')} · Job {item.bookingNo||'-'} · {fmtDate(item.publishedAt)}</div>
            <b>{item.title}</b>
            <div style={{marginTop:4}}>{item.message}</div>
            <div className="sub" style={{marginTop:6}}>Delivery: {(item.channels||[]).join(' + ')||'IN_APP'}{item.requiresAcknowledgement?' · acknowledgement required':''}</div>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <a className="btn" href={item.actionHref} style={{textDecoration:'none'}}>Open shipment</a>
            {!item.read&&<button className="btn" onClick={()=>void markRead(item)}>Mark read</button>}
            {item.requiresAcknowledgement&&!item.acknowledged&&<button className="btn" onClick={()=>void acknowledge(item)}>Acknowledge</button>}
            {item.acknowledged&&<span className="status">Acknowledged</span>}
          </div>
        </div>
      </div>)}
      {!visible.length&&<div className="sub">No communications match this view.</div>}
    </div>
  </div>;
}
