'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import JobFlowNav from '../../components/JobFlowNav';
import {api,fmtMoney,requireToken} from '../../lib/api';

type RateQuote={id:string;quoteNo:string;buyRate:any;sellRate:any;currency:string;status:string};
type Booking={id:string;bookingNo:string;origin:string;destination:string;currency?:string;status:string;rateQuoteId?:string;rateQuote?:RateQuote};
type Line={id:string;bookingId:string;type:'REVENUE'|'COST';chargeCode:string;description?:string;quantity?:any;unitRate?:any;amount:any;finalAmount?:any;currency:string;status:string;source?:string;reference?:string;invoiceReady?:boolean;invoiceNo?:string;accruedAt?:string;postedAt?:string};
type Summary={booking?:Booking;lineCount:number;byCurrency:Array<{currency:string;revenue:number;cost:number;gp:number;marginPct:number}>;invoiceReadyCount:number;revenueLineCount:number;disputedCount:number;closeReady:boolean;closeBlockingCount:number;closeBlocking:Array<{id:string;chargeCode:string;type:string;status:string}>};

const statuses=['PLANNED','WIP','ACCRUED','POSTED','APPROVAL_PENDING','APPROVED','PAYABLE','PAYMENT_SCHEDULED','PART_PAID','PAID','CLEARED','FINAL','DISPUTED','CANCELLED'];

export default function FinancePage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [bookingId,setBookingId]=useState('');
  const [lines,setLines]=useState<Line[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({type:'REVENUE',chargeCode:'OCEAN_FREIGHT',description:'',quantity:'1',unitRate:'',amount:'',finalAmount:'',currency:'USD',status:'PLANNED',source:'MANUAL',reference:'',taxRate:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void loadBookings(t);},[]);
  async function loadBookings(t=token){
    try{
      const b=await api('/bookings',t);const arr=Array.isArray(b)?b:[];setBookings(arr);
      const contextId=new URLSearchParams(location.search).get('bookingId')||'';
      const target=contextId&&arr.some((x:Booking)=>x.id===contextId)?contextId:(!bookingId&&arr[0]?.id?arr[0].id:bookingId);
      if(target){setBookingId(target);void loadFinance(target,t);}
    }catch(e:any){setMessage(e.message||'Unable to load bookings');}
  }
  async function loadFinance(id=bookingId,t=token){
    if(!id){setLines([]);setSummary(null);return;}
    try{
      const [data,sum]=await Promise.all([api(`/finance/booking/${id}`,t),api(`/finance/booking/${id}/summary`,t)]);
      setLines(Array.isArray(data)?data:[]);setSummary(sum||null);
      const currency=sum?.booking?.currency||bookings.find(b=>b.id===id)?.currency||'USD';setForm(x=>({...x,currency}));
    }catch(e:any){setMessage(e.message||'Unable to load finance');}
  }

  const selected=bookings.find(b=>b.id===bookingId);
  const main=useMemo(()=>summary?.byCurrency.find(x=>x.currency===(summary?.booking?.currency||selected?.currency))||summary?.byCurrency[0]||{currency:selected?.currency||'USD',revenue:0,cost:0,gp:0,marginPct:0},[summary,selected]);
  const mixedCurrencies=(summary?.byCurrency.length||0)>1;

  function setQuantityRate(key:'quantity'|'unitRate',value:string){
    const next={...form,[key]:value};
    const q=Number(key==='quantity'?value:next.quantity);const r=Number(key==='unitRate'?value:next.unitRate);
    if(Number.isFinite(q)&&Number.isFinite(r)&&value!=='') next.amount=String(q*r);
    setForm(next);
  }

  async function createLine(){
    if(!bookingId||!form.chargeCode.trim()||!form.amount){setMessage('Booking, charge code and amount are required.');return;}
    setBusy(true);setMessage('');
    try{
      await api('/finance',token,{method:'POST',body:JSON.stringify({bookingId,...form,quantity:form.quantity?Number(form.quantity):null,unitRate:form.unitRate?Number(form.unitRate):null,amount:Number(form.amount),finalAmount:form.finalAmount?Number(form.finalAmount):null,taxRate:form.taxRate?Number(form.taxRate):null})});
      setMessage('Finance line created.');setForm(x=>({...x,description:'',unitRate:'',amount:'',finalAmount:'',reference:'',taxRate:''}));await loadFinance();
    }catch(e:any){setMessage(e.message||'Finance line could not be created.');}finally{setBusy(false);}
  }
  async function action(path:string,body?:any,success?:string){
    setBusy(true);setMessage('');
    try{await api(path,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});setMessage(success||'Finance updated.');await Promise.all([loadFinance(),loadBookings()]);}
    catch(e:any){setMessage(e.message||'Finance action failed.');}finally{setBusy(false);}
  }
  async function syncQuote(){if(!bookingId)return;await action(`/finance/booking/${bookingId}/sync-quote`,undefined,'Accepted quote handed over to job finance.');}
  async function finalizeJob(){if(!bookingId)return;await action(`/finance/booking/${bookingId}/finalize`,undefined,'Booking financially closed.');}
  async function setStatus(id:string,status:string){await action(`/finance/${id}/status`,{status},`Charge moved to ${status}.`);}
  async function markInvoiceReady(id:string,ready:boolean){await action(`/finance/${id}/invoice-ready`,{ready},ready?'Revenue marked invoice-ready.':'Invoice-ready flag removed.');}

  return <WorkspaceShell title="Finance / Job Costing" subtitle="Commercial handover, revenue, cost, margin, accruals, invoicing readiness and financial close" active="/finance" actions={<button className="btn" onClick={()=>void loadFinance()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {bookingId&&<JobFlowNav bookingId={bookingId} bookingNo={selected?.bookingNo} active="FINANCE"/>}
    {bookingId&&<JobContextRail bookingId={bookingId} bookingNo={selected?.bookingNo} route={selected?`${selected.origin} → ${selected.destination}`:''} status={selected?.status||''} active="FINANCE"/>}

    <div className="card" style={{marginBottom:12}}><div style={formGrid}>
      <label><span style={labelStyle}>Job / Booking</span><select style={fieldStyle} value={bookingId} onChange={e=>{setBookingId(e.target.value);void loadFinance(e.target.value);}}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination} · {b.status}</option>)}</select></label>
      <div><span style={labelStyle}>Linked Commercial Quote</span><div style={{...fieldStyle,minHeight:38,display:'flex',alignItems:'center'}}>{summary?.booking?.rateQuote?.quoteNo||selected?.rateQuote?.quoteNo||'No quote linked'}{summary?.booking?.rateQuote?.status?` · ${summary.booking.rateQuote.status}`:''}</div></div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
      <button className="btn" disabled={busy||!bookingId} onClick={syncQuote}>Sync Accepted Quote to Finance</button>
      <button className="btn" disabled={busy||!summary?.closeReady} onClick={finalizeJob}>Financial Close</button>
      {summary&&!summary.closeReady&&<span className="status">Close blockers: {summary.closeBlockingCount}{summary.booking?.status!=='COMPLETED'?' · Operations not completed':''}</span>}
    </div></div>

    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">REVENUE · {main.currency}</div><div className="kpi">{fmtMoney(main.revenue,main.currency)}</div></div>
      <div className="card"><div className="sub">COST · {main.currency}</div><div className="kpi">{fmtMoney(main.cost,main.currency)}</div></div>
      <div className="card"><div className="sub">GROSS PROFIT · {main.currency}</div><div className="kpi">{fmtMoney(main.gp,main.currency)}</div></div>
      <div className="card"><div className="sub">GP MARGIN</div><div className="kpi">{main.marginPct.toFixed(1)}%</div></div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <span className="status">{summary?.lineCount||0} active charges</span>
      <span className="status">{summary?.invoiceReadyCount||0}/{summary?.revenueLineCount||0} revenue invoice-ready</span>
      <span className="status">{summary?.disputedCount||0} disputed</span>
      <span className="status">{summary?.closeReady?'READY FOR FINANCIAL CLOSE':'FINANCIAL CLOSE PENDING'}</span>
      {mixedCurrencies&&<span className="status">Mixed currencies — review each currency separately</span>}
    </div>
    {mixedCurrencies&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Currency Summary</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Currency</th><th>Revenue</th><th>Cost</th><th>GP</th><th>Margin</th></tr></thead><tbody>{summary?.byCurrency.map(x=><tr key={x.currency}><td><b>{x.currency}</b></td><td>{fmtMoney(x.revenue,x.currency)}</td><td>{fmtMoney(x.cost,x.currency)}</td><td>{fmtMoney(x.gp,x.currency)}</td><td>{x.marginPct.toFixed(1)}%</td></tr>)}</tbody></table></div></div>}

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Add Job Charge</h3><div style={formGrid}>
      <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>REVENUE</option><option>COST</option></select></label>
      <label><span style={labelStyle}>Charge Code *</span><input style={fieldStyle} value={form.chargeCode} onChange={e=>setForm({...form,chargeCode:e.target.value})}/></label>
      <label><span style={labelStyle}>Description</span><input style={fieldStyle} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ocean freight / THC / trucking..."/></label>
      <label><span style={labelStyle}>Quantity</span><input type="number" step="0.001" style={fieldStyle} value={form.quantity} onChange={e=>setQuantityRate('quantity',e.target.value)}/></label>
      <label><span style={labelStyle}>Unit Rate</span><input type="number" step="0.01" style={fieldStyle} value={form.unitRate} onChange={e=>setQuantityRate('unitRate',e.target.value)}/></label>
      <label><span style={labelStyle}>Planned Amount *</span><input type="number" step="0.01" style={fieldStyle} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
      <label><span style={labelStyle}>Final Amount</span><input type="number" step="0.01" style={fieldStyle} value={form.finalAmount} onChange={e=>setForm({...form,finalAmount:e.target.value})}/></label>
      <label><span style={labelStyle}>Currency</span><select style={fieldStyle} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{['USD','EUR','GBP','AED'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Tax %</span><input type="number" step="0.01" style={fieldStyle} value={form.taxRate} onChange={e=>setForm({...form,taxRate:e.target.value})}/></label>
      <label><span style={labelStyle}>Reference</span><input style={fieldStyle} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="Quote / vendor / invoice ref"/></label>
      <label><span style={labelStyle}>Status</span><select style={fieldStyle} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Source</span><select style={fieldStyle} value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>{['MANUAL','RATE_QUOTE','AGENT','CARRIER','VENDOR','API'].map(x=><option key={x}>{x}</option>)}</select></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy||!bookingId} onClick={createLine}>{busy?'Saving…':'Add Job Charge'}</button></div></div>

    <div className="card"><h3 style={sectionTitle}>Job Costing Register</h3><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Charge</th><th>Description / Ref</th><th>Qty × Rate</th><th>Planned</th><th>Final</th><th>Status</th><th>Invoice</th><th>Source</th><th>Actions</th></tr></thead><tbody>
      {lines.map(l=><tr key={l.id}><td><b>{l.type}</b></td><td>{l.chargeCode}</td><td>{l.description||'-'}<div className="sub">{l.reference||'-'}</div></td><td>{l.quantity??'-'} × {l.unitRate!=null?fmtMoney(l.unitRate,l.currency):'-'}</td><td>{fmtMoney(l.amount,l.currency)}</td><td>{fmtMoney(l.finalAmount??l.amount,l.currency)}</td><td><span className="status">{l.status}</span>{l.accruedAt&&<div className="sub">Accrued</div>}{l.postedAt&&<div className="sub">Posted</div>}</td><td>{l.type==='REVENUE'?<span className="status">{l.invoiceReady?'READY':'NOT READY'}</span>:'-' }{l.invoiceNo&&<div className="sub">{l.invoiceNo}</div>}</td><td>{l.source||'-'}</td><td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
        {!['FINAL','CLEARED','PAID','CANCELLED'].includes(l.status)&&<><button className="btn" disabled={busy} onClick={()=>setStatus(l.id,'ACCRUED')}>Accrue</button><button className="btn" disabled={busy} onClick={()=>setStatus(l.id,'POSTED')}>Post</button><button className="btn" disabled={busy} onClick={()=>setStatus(l.id,'FINAL')}>Final</button><button className="btn" disabled={busy} onClick={()=>setStatus(l.id,'DISPUTED')}>Dispute</button></>}
        {l.type==='REVENUE'&&<button className="btn" disabled={busy} onClick={()=>markInvoiceReady(l.id,!l.invoiceReady)}>{l.invoiceReady?'Remove Invoice Ready':'Invoice Ready'}</button>}
      </div></td></tr>)}
      {lines.length===0&&<tr><td colSpan={10}>{bookingId?'No finance lines for this booking. Use Sync Accepted Quote or add a job charge.':'Select a booking.'}</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
