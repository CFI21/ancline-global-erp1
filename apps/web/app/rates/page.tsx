'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,fmtMoney,requireToken} from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[]};
type Rate={id:string;quoteNo:string;customerId:string;trade:string;equipment:string;buyRate:any;sellRate:any;currency:string;validFrom:string;validTo:string;status:string;source?:string};

export default function RatesPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Rate[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [search,setSearch]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({quoteNo:'',customerId:'',trade:'',equipment:'40HC',buyRate:'',sellRate:'',currency:'USD',validFrom:new Date().toISOString().slice(0,10),validTo:'',source:'MANUAL'});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const [r,o]=await Promise.all([api('/rates',t),api('/organizations',t)]);setRows(Array.isArray(r)?r:[]);setOrgs(Array.isArray(o)?o:[]);}catch(e:any){setMessage(e.message||'Unable to load rates');}}
  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')),[orgs]);
  const customerName=(id:string)=>orgs.find(o=>o.id===id)?.name||id;
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return rows.filter(r=>!q||[r.quoteNo,r.trade,r.equipment,r.status,r.currency,customerName(r.customerId)].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search,orgs]);
  const gross=(r:Rate)=>Number(r.sellRate||0)-Number(r.buyRate||0);

  async function createRate(){
    if(!form.customerId||!form.trade.trim()||!form.validTo){setMessage('Customer, trade and valid-to date are required.');return;}
    setBusy(true);setMessage('');
    try{
      const quoteNo=form.quoteNo.trim()||`Q-${Date.now().toString().slice(-8)}`;
      await api('/rates',token,{method:'POST',body:JSON.stringify({quoteNo,customerId:form.customerId,trade:form.trade.trim().toUpperCase(),equipment:form.equipment,buyRate:Number(form.buyRate||0),sellRate:Number(form.sellRate||0),currency:form.currency,validFrom:new Date(`${form.validFrom}T00:00:00Z`).toISOString(),validTo:new Date(`${form.validTo}T23:59:59Z`).toISOString(),status:'DRAFT',source:form.source})});
      setMessage(`Quote ${quoteNo} created.`);setForm({...form,quoteNo:'',trade:'',buyRate:'',sellRate:'',validTo:''});await load();
    }catch(e:any){setMessage(e.message||'Rate could not be created.');}finally{setBusy(false);}
  }
  async function action(id:string,act:'approve'|'send'|'accept'){setMessage('');try{await api(`/rates/${id}/${act}`,token,{method:'POST'});await load();}catch(e:any){setMessage(e.message||'Rate action failed.');}}

  return <WorkspaceShell title="Rates / Quotes" subtitle="Buy rate, sell rate, margin and quotation lifecycle" active="/rates" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>New Rate / Quote</h3><div style={formGrid}>
      <label><span style={labelStyle}>Quote No.</span><input style={fieldStyle} value={form.quoteNo} onChange={e=>setForm({...form,quoteNo:e.target.value})} placeholder="Auto if blank"/></label>
      <label><span style={labelStyle}>Customer *</span><select style={fieldStyle} value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}</select></label>
      <label><span style={labelStyle}>Trade / Lane *</span><input style={fieldStyle} value={form.trade} onChange={e=>setForm({...form,trade:e.target.value})} placeholder="CNSHA-AEJEA"/></label>
      <label><span style={labelStyle}>Equipment</span><select style={fieldStyle} value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})}>{['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Buy Rate</span><input type="number" style={fieldStyle} value={form.buyRate} onChange={e=>setForm({...form,buyRate:e.target.value})}/></label>
      <label><span style={labelStyle}>Sell Rate</span><input type="number" style={fieldStyle} value={form.sellRate} onChange={e=>setForm({...form,sellRate:e.target.value})}/></label>
      <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Valid From</span><input type="date" style={fieldStyle} value={form.validFrom} onChange={e=>setForm({...form,validFrom:e.target.value})}/></label>
      <label><span style={labelStyle}>Valid To *</span><input type="date" style={fieldStyle} value={form.validTo} onChange={e=>setForm({...form,validTo:e.target.value})}/></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createRate}>{busy?'Saving…':'Create Quote'}</button></div></div>
    <div className="card"><input style={{...fieldStyle,maxWidth:360,marginBottom:12}} placeholder="Search quote, customer, trade, equipment or status" value={search} onChange={e=>setSearch(e.target.value)}/><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Quote</th><th>Customer</th><th>Trade</th><th>Equipment</th><th>Buy</th><th>Sell</th><th>GP</th><th>Validity</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {visible.map(r=><tr key={r.id}><td><b>{r.quoteNo}</b></td><td>{customerName(r.customerId)}</td><td>{r.trade}</td><td>{r.equipment}</td><td>{fmtMoney(r.buyRate,r.currency)}</td><td>{fmtMoney(r.sellRate,r.currency)}</td><td>{fmtMoney(gross(r),r.currency)}</td><td>{fmtDate(r.validFrom)} – {fmtDate(r.validTo)}</td><td><span className="status">{r.status}</span></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}><button className="btn" onClick={()=>action(r.id,'approve')}>Approve</button><button className="btn" onClick={()=>action(r.id,'send')}>Send</button><button className="btn" onClick={()=>action(r.id,'accept')}>Accept</button></div></td></tr>)}
      {visible.length===0&&<tr><td colSpan={10}>No rate quotes found.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
