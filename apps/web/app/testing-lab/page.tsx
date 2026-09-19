'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

export default function TestingLabPage(){
  const [token,setToken]=useState(''),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uatBusy,setUatBusy]=useState(''),[fullUat,setFullUat]=useState<any>(null),[exceptionUat,setExceptionUat]=useState<any>(null);
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const r=await api('/test-data/summary',t);setData(r);
      const bookingNo=new URLSearchParams(window.location.search).get('bookingNo');
      if(bookingNo){
        const match=(r?.bookings||[]).find((b:any)=>String(b.bookingNo).toUpperCase()===String(bookingNo).toUpperCase());
        if(match){window.location.replace('/bookings/'+match.id);return;}
        setMessage('Test booking '+bookingNo+' is not seeded yet. Use Seed / Refresh Test Pack after deployment.');
      }
    }catch(e:any){setMessage(e.message||'Unable to load test data.');}
    finally{setBusy(false);}
  }
  async function seed(){setBusy(true);setMessage('');try{const r=await api('/test-data/seed',token,{method:'POST'});setData(r);setMessage('Synthetic test pack seeded / refreshed successfully.');}catch(e:any){setMessage(e.message||'Test data seed failed.');}finally{setBusy(false);}}
  async function reset(){if(!window.confirm('Delete only ANCLINE synthetic TEST-* data?'))return;setBusy(true);setMessage('');try{await api('/test-data/reset',token,{method:'DELETE'});setMessage('Synthetic test data removed.');await load();}catch(e:any){setMessage(e.message||'Test data reset failed.');}finally{setBusy(false);}}
  async function runUat(kind:'full'|'exception'){
    setUatBusy(kind);setMessage('');
    try{
      const path=kind==='full'?'/uat/run':'/uat/run-exceptions';
      const r=await api(path,token,{method:'POST',body:JSON.stringify({cleanup:true})});
      if(kind==='full')setFullUat(r);else setExceptionUat(r);
      const label=kind==='full'?'Full Transaction':'Exception & Failure';
      setMessage(label+' UAT: '+r.status+' · '+(r.summary?.passed||0)+'/'+(r.summary?.total||0)+' passed');
    }catch(e:any){setMessage(e.message||'UAT run failed.');}
    finally{setUatBusy('');}
  }
  return <WorkspaceShell title="ANCLINE Testing Lab" subtitle="Synthetic customers, carriers and full-field bookings · never for real operations" active="/testing-lab" actions={<><button className="btn" disabled={busy} onClick={seed}>Seed / Refresh Test Pack</button><button className="btn" disabled={busy} onClick={reset}>Reset Test Data</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="card" style={{marginBottom:12,border:'2px solid #c9d6df'}}><b>SYNTHETIC TEST DATA ONLY</b><div className="sub">All records use TEST / ANC-TEST references and @ancline.invalid accounts. Do not send them to real carriers, banks, customs, customers or providers.</div></div>
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">TEST CUSTOMERS</div><div className="kpi">{data?.summary?.customers||0}</div></div>
      <div className="card"><div className="sub">TEST CARRIERS</div><div className="kpi">{data?.summary?.carriers||0}</div></div>
      <div className="card"><div className="sub">TEST BOOKINGS</div><div className="kpi">{data?.summary?.bookings||0}</div></div>
      <div className="card"><div className="sub">TEST LOGIN ACCOUNTS</div><div className="kpi">{data?.summary?.testUsers||0}</div></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={{marginTop:0}}>Release Gate UAT</h3>
      <div className="sub" style={{marginBottom:10}}>Controlled synthetic end-to-end tests. Test records are cleaned up automatically.</div>
      <div className="grid" style={{marginBottom:10}}>
        <div className="card">
          <div className="sub">FULL TRANSACTION</div>
          <div className="kpi">{fullUat?.status||'—'}</div>
          <div className="sub">{fullUat?(String(fullUat.summary?.passed||0)+'/'+String(fullUat.summary?.total||0)+' passed · '+String(fullUat.runId)):'Customer → booking → carrier → docs → tracking → finance → closeout'}</div>
          <button className="btn" style={{marginTop:8}} disabled={Boolean(uatBusy)} onClick={()=>void runUat('full')}>{uatBusy==='full'?'Running…':'Run Full Transaction UAT'}</button>
        </div>
        <div className="card">
          <div className="sub">EXCEPTION & FAILURE</div>
          <div className="kpi">{exceptionUat?.status||'—'}</div>
          <div className="sub">{exceptionUat?(String(exceptionUat.summary?.passed||0)+'/'+String(exceptionUat.summary?.total||0)+' passed · '+String(exceptionUat.runId)):'Holds, cutoffs, carrier failure/retry, customs, payment failure and recovery'}</div>
          <button className="btn" style={{marginTop:8}} disabled={Boolean(uatBusy)} onClick={()=>void runUat('exception')}>{uatBusy==='exception'?'Running…':'Run Exception & Failure UAT'}</button>
        </div>
      </div>
      {(fullUat||exceptionUat)&&<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Profile</th><th>Gate</th><th>Passed</th><th>Failed</th><th>Run ID</th><th>Failed Step</th></tr></thead><tbody>
        {fullUat&&<tr><td>FULL_TRANSACTION</td><td><span className="status">{fullUat.releaseGate}</span></td><td>{fullUat.summary?.passed}</td><td>{fullUat.summary?.failed}</td><td>{fullUat.runId}</td><td>{(fullUat.steps||[]).filter((x:any)=>x.status==='FAIL').map((x:any)=>x.name).join(', ')||'—'}</td></tr>}
        {exceptionUat&&<tr><td>EXCEPTION_FAILURE</td><td><span className="status">{exceptionUat.releaseGate}</span></td><td>{exceptionUat.summary?.passed}</td><td>{exceptionUat.summary?.failed}</td><td>{exceptionUat.runId}</td><td>{(exceptionUat.steps||[]).filter((x:any)=>x.status==='FAIL').map((x:any)=>x.name).join(', ')||'—'}</td></tr>}
      </tbody></table></div>}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={{marginTop:0}}>Test Customers</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Country</th><th>ANC Customer Ref</th><th>Registration Ref</th><th>KYC</th><th>Cost Center</th></tr></thead><tbody>
        {(data?.customers||[]).map((x:any)=><tr key={x.id}><td><b>{x.code}</b></td><td>{x.name}</td><td>{x.countryCode}</td><td>{x.customerRef}</td><td>{x.registrationRef}</td><td><span className="status">{x.kycStatus}</span></td><td>{x.costCenterCode}</td></tr>)}
        {!data?.customers?.length&&<tr><td colSpan={7}>No synthetic customers seeded.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={{marginTop:0}}>Test Carrier Organizations</h3>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Code</th><th>Carrier</th><th>Country</th><th>Mode</th></tr></thead><tbody>
        {(data?.carriers||[]).map((x:any)=><tr key={x.id}><td><b>{x.code}</b></td><td>{x.name}</td><td>{x.countryCode}</td><td>MANUAL TEST ADAPTER · no real endpoint</td></tr>)}
        {!data?.carriers?.length&&<tr><td colSpan={4}>No synthetic carriers seeded.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={{marginTop:0}}>Test Login Accounts</h3>
      <div className="sub" style={{marginBottom:8}}>These .invalid emails work only while transitional login is enabled. Secure production identity should remain the final target.</div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Email</th><th>Role</th><th>Name</th><th>Scope</th><th>Permissions</th></tr></thead><tbody>
        {(data?.users||[]).map((x:any)=><tr key={x.email}><td><b>{x.email}</b></td><td>{x.role}</td><td>{x.displayName}</td><td>{x.customerId||x.agentId||'-'}</td><td>{(x.permissions||[]).join(', ')}</td></tr>)}
        {!data?.users?.length&&<tr><td colSpan={5}>No synthetic login accounts seeded.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="card">
      <h3 style={{marginTop:0}}>Full-field Test Bookings</h3>
      <div className="sub" style={{marginBottom:8}}>Coverage: standard FCL, dangerous goods, reefer, OOG/door-to-door and NVOCC segregation.</div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking</th><th>Model / Channel</th><th>Route</th><th>Equipment</th><th>Special</th><th>Carrier</th><th>Status</th><th>Quote / BL</th><th>Data Coverage</th></tr></thead><tbody>
        {(data?.bookings||[]).map((b:any)=><tr key={b.id}><td><a href={'/bookings/'+b.id}><b>{b.bookingNo}</b></a><div className="sub">{b.customerRef}</div></td><td>{b.businessModel}<div className="sub">{b.channel}</div></td><td>{b.route}</td><td>{b.equipment}</td><td>{b.specialCargo||'STANDARD'}</td><td>{b.carrier||'-'}<div className="sub">{b.carrierBookingNo||'Carrier ref pending'}</div></td><td><span className="status">{b.status}</span><div className="sub">{b.shipmentStatus}</div></td><td>{b.quoteNo||'-'}<div className="sub">{b.houseBL||'-'} / {b.masterBL||'-'}</div></td><td>{b.containers} container(s) · {b.financeLines} finance · {b.routingLegs} leg(s) · {b.milestones} milestones</td></tr>)}
        {!data?.bookings?.length&&<tr><td colSpan={9}>No synthetic bookings seeded. Click Seed / Refresh Test Pack.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
