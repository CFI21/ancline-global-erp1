'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtMoney,requireToken} from '../../lib/api';

const nowPeriod=()=>new Date().toISOString().slice(0,7);
export default function RevenueClosePage(){
  const [token,setToken]=useState('');const [period,setPeriod]=useState(nowPeriod());const [data,setData]=useState<any>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const [form,setForm]=useState<any>({name:'Standard Completed Shipment',transportMode:'SEA',serviceType:'',triggerStatus:'COMPLETED',recognitionPct:100,debitAccount:'1200-CONTRACT-ASSET',creditAccount:'4000-FREIGHT-REVENUE',active:true});
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t,nowPeriod());},[]);
  async function load(t=token,p=period){if(!t)return;setBusy(true);setMessage('');try{setData(await api(`/revenue-close/dashboard?period=${encodeURIComponent(p)}`,t));}catch(e:any){setMessage(e.message||'Unable to load revenue close.');}finally{setBusy(false);}}
  async function post(path:string,body:any,success:string){setBusy(true);setMessage('');try{await api(path,token,{method:'POST',body:JSON.stringify(body||{})});setMessage(success);await load();}catch(e:any){setMessage(e.message||'Action failed.');}finally{setBusy(false);}}
  const k=data?.kpis||{},pack=data?.closePack||{},policies=data?.policies||[],bookings=data?.bookings||[];
  return <WorkspaceShell title="Revenue Recognition / Finance Close" subtitle="Deterministic recognition policy, eligible revenue posting and period close-pack readiness" active="/revenue-close" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Working…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><label style={{maxWidth:220,display:'block'}}><span style={labelStyle}>Period</span><input type="month" style={fieldStyle} value={period} onChange={e=>{setPeriod(e.target.value);void load(token,e.target.value);}}/></label></div>
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">ACTIVE POLICIES</div><div className="kpi">{k.policyCount||0}</div></div>
      <div className="card"><div className="sub">READY TO RECOGNIZE</div><div className="kpi">{k.recognitionReady||0}</div></div>
      <div className="card"><div className="sub">DUE RECOGNITION</div><div className="kpi">{fmtMoney(k.dueRecognition||0,'USD')}</div></div>
      <div className="card"><div className="sub">UNCONFIGURED</div><div className="kpi">{k.unconfigured||0}</div></div>
      <div className="card"><div className="sub">CLOSE STATUS</div><div className="kpi">{k.closeReady?'READY':'BLOCKED'}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Recognition Policy</h3><div style={formGrid}>
      <label><span style={labelStyle}>Policy Name</span><input style={fieldStyle} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label><span style={labelStyle}>Transport Mode</span><input style={fieldStyle} value={form.transportMode} onChange={e=>setForm({...form,transportMode:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Service Type</span><input style={fieldStyle} value={form.serviceType} onChange={e=>setForm({...form,serviceType:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Trigger Status</span><select style={fieldStyle} value={form.triggerStatus} onChange={e=>setForm({...form,triggerStatus:e.target.value})}><option>CONFIRMED</option><option>OPERATIONAL</option><option>COMPLETED</option><option>FINANCIALLY_CLOSED</option></select></label>
      <label><span style={labelStyle}>Recognition %</span><input type="number" min={0} max={100} step="0.01" style={fieldStyle} value={form.recognitionPct} onChange={e=>setForm({...form,recognitionPct:Number(e.target.value)})}/></label>
      <label><span style={labelStyle}>Debit Account</span><input style={fieldStyle} value={form.debitAccount} onChange={e=>setForm({...form,debitAccount:e.target.value.toUpperCase()})}/></label>
      <label><span style={labelStyle}>Revenue Account</span><input style={fieldStyle} value={form.creditAccount} onChange={e=>setForm({...form,creditAccount:e.target.value.toUpperCase()})}/></label>
    </div><button className="btn" style={{marginTop:10}} disabled={busy} onClick={()=>void post('/revenue-close/policies',form,'Recognition policy saved.')}>Save Policy</button>
      <div style={{overflowX:'auto',marginTop:12}}><table className="table"><thead><tr><th>Policy</th><th>Mode</th><th>Service</th><th>Trigger</th><th>%</th><th>Accounts</th></tr></thead><tbody>{policies.map((x:any)=><tr key={x.policyId}><td>{x.name}</td><td>{x.transportMode||'ANY'}</td><td>{x.serviceType||'ANY'}</td><td>{x.triggerStatus}</td><td>{x.recognitionPct}%</td><td>{x.debitAccount} → {x.creditAccount}</td></tr>)}{!policies.length&&<tr><td colSpan={6}>No recognition policies configured.</td></tr>}</tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Booking Revenue Readiness</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Status</th><th>Revenue</th><th>Policy</th><th>Target</th><th>Recognized</th><th>Due</th><th></th></tr></thead><tbody>{bookings.map((x:any)=><tr key={x.bookingId}><td>{x.bookingNo}</td><td><span className="status">{x.status}</span></td><td>{fmtMoney(x.revenue,x.currency)}</td><td>{x.policy?.name||'NOT CONFIGURED'}</td><td>{x.targetRecognitionPct}%</td><td>{fmtMoney(x.recognizedToDate,x.currency)}</td><td>{fmtMoney(x.dueToRecognize,x.currency)}</td><td>{x.ready&&<button className="btn" disabled={busy} onClick={()=>void post(`/revenue-close/bookings/${encodeURIComponent(x.bookingId)}/recognize`,{},`Revenue recognized for ${x.bookingNo}.`)}>Recognize</button>}</td></tr>)}{!bookings.length&&<tr><td colSpan={8}>No bookings found.</td></tr>}</tbody></table></div></div>

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><h3 style={sectionTitle}>Finance Close Pack</h3><button className="btn" disabled={busy} onClick={()=>void post(`/revenue-close/close-pack/${period}/snapshot`,{},`Finance close snapshot saved for ${period}.`)}>Snapshot Close Pack</button></div>
      <div className="grid" style={{marginBottom:12}}><div><div className="sub">PERIOD</div><b>{pack.period}</b></div><div><div className="sub">GL STATUS</div><b>{pack.periodStatus||'OPEN'}</b></div><div><div className="sub">TOTAL REVENUE</div><b>{fmtMoney(pack.totalRevenue||0,'USD')}</b></div><div><div className="sub">DUE</div><b>{fmtMoney(pack.dueRecognition||0,'USD')}</b></div><div><div className="sub">READY</div><b>{pack.ready?'YES':'NO'}</b></div></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Blocker</th><th>Object</th><th>Message</th></tr></thead><tbody>{(pack.blockers||[]).map((x:any,i:number)=><tr key={i}><td><span className="status">{x.type}</span></td><td>{x.objectId}</td><td>{x.message}</td></tr>)}{!(pack.blockers||[]).length&&<tr><td colSpan={3}>No revenue-close blockers.</td></tr>}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}
