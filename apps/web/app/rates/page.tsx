'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell from '../../components/WorkspaceShell';
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

  return <WorkspaceShell title="" subtitle="" active="/rates" hideHeader>
    <div className="cw-screen">
      <div className="cw-titlebar">ANC Quote Register - Branch: GLOBAL - Company: ANCLINE WORLDWIDE - Department: SALES / COMMERCIAL</div>
      <div className="cw-menubar"><button onClick={()=>location.href='/rates/new'}>New Quote</button><button onClick={()=>void load()}>Refresh</button><button onClick={()=>location.href='/sales-crm/opportunities'}>Opportunity Register</button><button onClick={()=>location.href='/commercial'}>Contracts & Tariffs</button></div>
      {message&&<div className="cw-message">{message}</div>}

      <div className="quote-register-summary">
        <span><b>{dashboard.openPipeline||0}</b> Open Pipeline</span>
        <span><b>{Number(dashboard.avgMarginPct||0).toFixed(1)}%</b> Avg. GP</span>
        <span><b>{dashboard.expiring7d||0}</b> Expiring ≤ 7d</span>
        <span><b>{dashboard.expiredOpen||0}</b> Expired Open</span>
        <span><b>{dashboard.acceptedAwaitingBooking||0}</b> Awaiting Booking</span>
      </div>

      <div className="opp-register-tools quote-register-tools">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quote, customer, opportunity, lane, carrier..."/>
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="Rate Approved">Rate Approved</option>
          <option value="Quote Sent">Quote Sent</option>
          <option value="Customer Accepted">Customer Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <span>{visible.length} Quotes</span>
      </div>

      <div className="cw-tablewrap quote-register-table"><table className="cw-table"><thead><tr>
        <th>Quote No.</th><th>Customer</th><th>Opportunity</th><th>Trade</th><th>Equipment</th><th>Buy</th><th>Sell</th><th>GP %</th><th>Validity</th><th>Carrier</th><th>Status</th><th>Booking</th><th></th>
      </tr></thead><tbody>
        {visible.map((x:any)=><tr key={x.id}>
          <td><b>{x.quoteNo}</b><div className="quote-reg-sub">{x.source||'MANUAL'}</div></td>
          <td>{customerName(x.customerId)}<div className="quote-reg-sub">{x.customerRef||''}</div></td>
          <td>{x.requestData?.sourceOpportunityId?<a href={`/sales-crm/opportunities/${x.requestData.sourceOpportunityId}`}>{x.requestData.sourceOpportunityId}</a>:'—'}</td>
          <td>{x.trade}</td>
          <td>{x.equipment}</td>
          <td>{x.currency} {Number(x.buyRate||0).toFixed(2)}</td>
          <td>{x.currency} {Number(x.sellRate||0).toFixed(2)}</td>
          <td><b>{margin(x).toFixed(1)}%</b></td>
          <td>{String(x.validTo||'').slice(0,10)}{x.expired&&<div className="quote-expired">EXPIRED</div>}</td>
          <td>{x.carrierCode||'—'}<div className="quote-reg-sub">{x.carrierQuoteRef||''}</div></td>
          <td>{x.status}</td>
          <td>{Number(x._count?.bookings||0)>0?'LINKED':'—'}</td>
          <td><a href={`/rates/${x.id}`}>Open</a></td>
        </tr>)}
        {!visible.length&&<tr><td colSpan={13}>No ANC Quotes found.</td></tr>}
      </tbody></table></div>

      <div className="cw-footerbar"><span className="cw-spacer"/><button onClick={()=>location.href='/rates/new'}>□ New</button><button onClick={()=>void load()}>↻ Refresh</button></div>
    </div>
  </WorkspaceShell>;
}
