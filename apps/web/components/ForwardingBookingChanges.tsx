'use client';

import {useEffect,useState} from 'react';
import {api,fmtDate} from '../lib/api';

type Row={amendmentId:string;requestType:string;reason:string;changes?:Record<string,any>;status:string;providerCode?:string|null;capabilityMode?:string;createdAt?:string;updatedAt?:string;error?:string};

export default function ForwardingBookingChanges({bookingId,token,onChanged}:{bookingId:string;token:string;onChanged?:()=>void}){
  const [rows,setRows]=useState<Row[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [reason,setReason]=useState('');
  const [form,setForm]=useState({portOfLoading:'',portOfDischarge:'',equipment:'',quantity:'',etd:'',commodity:'',grossWeight:'',volumeCbm:'',shipper:'',consignee:'',notifyParty:'',cargoDescription:''});
  const field:React.CSSProperties={width:'100%',padding:8,border:'1px solid #cfd9e2',borderRadius:6,background:'#fff'};
  const label:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};

  useEffect(()=>{void load();},[bookingId]);
  async function load(){try{const r=await api('/forwarding-amendments/booking/'+bookingId,token);setRows(Array.isArray(r)?r:[]);}catch(e:any){setMessage(e.message||'Unable to load booking change history.');}}
  function changes(){
    const out:any={};
    for(const [k,v] of Object.entries(form)){
      if(v==='')continue;
      out[k]=['quantity','grossWeight','volumeCbm'].includes(k)?Number(v):k==='etd'?new Date(v+'T00:00:00Z').toISOString():v;
    }
    return out;
  }
  async function amend(){
    const c=changes();if(!reason.trim()){setMessage('Reason for amendment is required.');return;}if(!Object.keys(c).length){setMessage('Enter at least one field to change.');return;}
    setBusy(true);setMessage('');
    try{
      const r=await api('/forwarding-amendments/booking/'+bookingId,token,{method:'POST',body:JSON.stringify({requestType:'AMENDMENT',reason:reason.trim(),changes:c})});
      setMessage('Amendment '+r.amendmentId+' created. Carrier workflow status: '+r.status+'.');
      setReason('');setForm({portOfLoading:'',portOfDischarge:'',equipment:'',quantity:'',etd:'',commodity:'',grossWeight:'',volumeCbm:'',shipper:'',consignee:'',notifyParty:'',cargoDescription:''});await load();onChanged?.();
    }catch(e:any){setMessage(e.message||'Amendment request failed.');}finally{setBusy(false);}
  }
  async function cancel(){
    const why=window.prompt('Reason for booking cancellation',reason||'');if(!why?.trim())return;
    if(!window.confirm('Submit cancellation request to the carrier?'))return;
    setBusy(true);setMessage('');
    try{
      const r=await api('/forwarding-amendments/booking/'+bookingId,token,{method:'POST',body:JSON.stringify({requestType:'CANCELLATION',reason:why.trim()})});
      setMessage('Cancellation '+r.amendmentId+' created. Carrier workflow status: '+r.status+'.');await load();onChanged?.();
    }catch(e:any){setMessage(e.message||'Cancellation request failed.');}finally{setBusy(false);}
  }

  return <div style={{marginTop:18,borderTop:'1px solid #e2e8ee',paddingTop:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
      <div><div className="sub">CARRIER BOOKING CONTROL</div><h3 style={{margin:'2px 0'}}>Booking Amendment / Cancellation</h3><div className="sub">Changes are requested first. ANCLINE updates the booking only after carrier confirmation.</div></div>
      <button className="btn" disabled={busy} onClick={cancel}>Request Cancellation</button>
    </div>
    {message&&<div style={{marginTop:10}}>{message}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:12}}>
      <label><span style={label}>POL</span><input style={field} value={form.portOfLoading} onChange={e=>setForm({...form,portOfLoading:e.target.value.toUpperCase()})}/></label>
      <label><span style={label}>POD</span><input style={field} value={form.portOfDischarge} onChange={e=>setForm({...form,portOfDischarge:e.target.value.toUpperCase()})}/></label>
      <label><span style={label}>Equipment</span><input style={field} value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value.toUpperCase()})} placeholder="40HC"/></label>
      <label><span style={label}>Quantity</span><input type="number" min="1" style={field} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
      <label><span style={label}>Requested ETD</span><input type="date" style={field} value={form.etd} onChange={e=>setForm({...form,etd:e.target.value})}/></label>
      <label><span style={label}>Commodity</span><input style={field} value={form.commodity} onChange={e=>setForm({...form,commodity:e.target.value})}/></label>
      <label><span style={label}>Gross Weight kg</span><input type="number" style={field} value={form.grossWeight} onChange={e=>setForm({...form,grossWeight:e.target.value})}/></label>
      <label><span style={label}>Volume CBM</span><input type="number" style={field} value={form.volumeCbm} onChange={e=>setForm({...form,volumeCbm:e.target.value})}/></label>
      <label><span style={label}>Shipper</span><input style={field} value={form.shipper} onChange={e=>setForm({...form,shipper:e.target.value})}/></label>
      <label><span style={label}>Consignee</span><input style={field} value={form.consignee} onChange={e=>setForm({...form,consignee:e.target.value})}/></label>
      <label><span style={label}>Notify Party</span><input style={field} value={form.notifyParty} onChange={e=>setForm({...form,notifyParty:e.target.value})}/></label>
      <label style={{gridColumn:'1/-1'}}><span style={label}>Cargo Description</span><input style={field} value={form.cargoDescription} onChange={e=>setForm({...form,cargoDescription:e.target.value})}/></label>
      <label style={{gridColumn:'1/-1'}}><span style={label}>Reason *</span><input style={field} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this booking change is required"/></label>
    </div>
    <div style={{textAlign:'right',marginTop:10}}><button className="btn" disabled={busy} onClick={amend}>{busy?'Submitting...':'Submit Amendment to Carrier'}</button></div>

    <h4 style={{marginBottom:8}}>Change History</h4>
    <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Request</th><th>Type</th><th>Reason / Changes</th><th>Carrier Mode</th><th>Status</th><th>Updated</th></tr></thead><tbody>
      {rows.map(r=><tr key={r.amendmentId}><td><b>{r.amendmentId}</b></td><td>{r.requestType}</td><td>{r.reason}<div className="sub">{r.changes?Object.entries(r.changes).map(([k,v])=>k+'='+String(v)).join(' · '):''}</div>{r.error&&<div className="sub">{r.error}</div>}</td><td>{r.providerCode||'-'}<div className="sub">{r.capabilityMode||'-'}</div></td><td><span className="status">{r.status}</span></td><td>{fmtDate(r.updatedAt||r.createdAt)}</td></tr>)}
      {!rows.length&&<tr><td colSpan={6}>No booking amendments or cancellation requests yet.</td></tr>}
    </tbody></table></div>
  </div>;
}
