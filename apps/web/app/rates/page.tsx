'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

export default function RatesPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<any[]>([]);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [dashboard,setDashboard]=useState<any>({});
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const [message,setMessage]=useState('');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    try{
      const [r,o,d]=await Promise.all([api('/rates',t),api('/organizations',t),api('/rates/dashboard',t)]);
      setRows(Array.isArray(r)?r:[]);setOrgs(Array.isArray(o)?o:[]);setDashboard(d||{});
    }catch(e:any){setMessage(e?.message||'Unable to load ANC Quotes');}
  }

  const customerName=(id:string)=>orgs.find((o:any)=>o.id===id)?.name||id||'—';
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter((x:any)=>{
      const st=String(x.status||'');
      const statusOk=status==='ALL'||st===status||(status==='EXPIRED'&&x.expired);
      const queryOk=!q||[x.quoteNo,customerName(x.customerId),x.trade,x.equipment,x.source,x.customerRef,x.carrierCode,x.carrierQuoteRef,x.requestData?.sourceOpportunityId].some(v=>String(v||'').toLowerCase().includes(q));
      return statusOk&&queryOk;
    });
  },[rows,orgs,search,status]);

  const gp=(x:any)=>Number(x.grossProfit??(Number(x.sellRate||0)-Number(x.buyRate||0)));
  const margin=(x:any)=>Number(x.marginPct??(Number(x.sellRate||0)>0?gp(x)/Number(x.sellRate||0)*100:0));

  return <WorkspaceShell
    title="ANC Quote / Commercial Quote"
    subtitle="Commercial quote register, pipeline control, margin governance and quote-to-booking workflow"
    active="/rates"
    actions={<><button className="btn" onClick={()=>location.href='/rates/new'}>+ New Quote</button><button className="btn" onClick={()=>void load()}>Refresh</button></>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,marginBottom:12}}>
      {[
        ['Open Pipeline',dashboard.openPipeline||0,'Active commercial quotes'],
        ['Pipeline Sell',Number(dashboard.pipelineSellValue||0).toFixed(2),'Indicative quote value'],
        ['Average GP %',`${Number(dashboard.avgMarginPct||0).toFixed(1)}%`,'Gross margin'],
        ['Expiring ≤ 7d',dashboard.expiring7d||0,'Requires follow-up'],
        ['Expired Open',dashboard.expiredOpen||0,'Cannot advance'],
        ['Awaiting Booking',dashboard.acceptedAwaitingBooking||0,'Accepted, not converted']
      ].map(([label,value,note])=><div className="card" key={label}>
        <div style={{fontSize:11,fontWeight:800,color:'#526778',textTransform:'uppercase'}}>{label}</div>
        <div style={{fontSize:24,fontWeight:900,color:'#153a5d',margin:'5px 0'}}>{value}</div>
        <div className="sub">{note}</div>
      </div>)}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input style={{...fieldStyle,maxWidth:430}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quote, customer, opportunity, lane, carrier..."/>
        <select style={{...fieldStyle,maxWidth:220}} value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="Rate Approved">Rate Approved</option>
          <option value="Quote Sent">Quote Sent</option>
          <option value="Customer Accepted">Customer Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <div className="sub" style={{marginLeft:'auto'}}><b>{visible.length}</b> quotes shown</div>
      </div>
    </div>

    <div className="card">
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr>
        <th>Quote</th><th>Customer</th><th>Opportunity</th><th>Trade</th><th>Equipment</th><th>Buy</th><th>Sell</th><th>GP</th><th>GP %</th><th>Validity</th><th>Carrier</th><th>Status</th><th>Booking</th><th></th>
      </tr></thead><tbody>
        {visible.map((x:any)=><tr key={x.id}>
          <td><b>{x.quoteNo}</b><div className="sub">{x.source||'MANUAL'}</div></td>
          <td>{customerName(x.customerId)}<div className="sub">{x.customerRef||''}</div></td>
          <td>{x.requestData?.sourceOpportunityId?<button className="btn" onClick={()=>location.href=`/sales-crm/opportunities/${x.requestData.sourceOpportunityId}`}>{x.requestData.sourceOpportunityId}</button>:'—'}</td>
          <td>{x.trade}</td>
          <td>{x.equipment}</td>
          <td>{x.currency} {Number(x.buyRate||0).toFixed(2)}</td>
          <td>{x.currency} {Number(x.sellRate||0).toFixed(2)}</td>
          <td>{x.currency} {gp(x).toFixed(2)}</td>
          <td><b>{margin(x).toFixed(1)}%</b></td>
          <td>{String(x.validTo||'').slice(0,10)}{x.expired&&<div style={{fontSize:11,fontWeight:800,color:'#b71c1c'}}>EXPIRED</div>}</td>
          <td>{x.carrierCode||'—'}<div className="sub">{x.carrierQuoteRef||''}</div></td>
          <td><span className="status">{x.status}</span></td>
          <td>{Number(x._count?.bookings||0)>0?'Linked':'—'}</td>
          <td><button className="btn" onClick={()=>location.href=`/rates/${x.id}`}>Open</button></td>
        </tr>)}
        {!visible.length&&<tr><td colSpan={14}>No commercial quotes found.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
