'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={
  id:string;bookingNo:string;businessModel?:string;bookingChannel?:string;status:string;
  customer?:{name?:string};producingAgent?:{name?:string};origin:string;destination:string;
  carrier?:string;vesselVoyage?:string;equipment?:string;etd?:string;eta?:string;
  creditStatus?:string;slotStatus?:string;equipmentStatus?:string;shipmentNo?:string;shipmentStatus?:string;
};

export default function JobsPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Booking[]>([]);
  const [search,setSearch]=useState('');
  const [model,setModel]=useState('ALL');
  const [status,setStatus]=useState('ALL');
  const [attention,setAttention]=useState('ALL');
  const [message,setMessage]=useState('');
  const [modal,setModal]=useState<Booking|null>(null);

  useEffect(()=>{
    const t=requireToken();if(!t)return;
    let role='';try{role=String(JSON.parse(localStorage.getItem('ancline_user')||'{}')?.role||'').toUpperCase();}catch{}
    if(!['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE'].includes(role)){location.replace('/');return;}
    setToken(t);void load(t);
  },[]);

  useEffect(()=>{
    if(!modal)return;
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(null);};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[modal]);

  async function load(t=token){
    try{const data=await api('/bookings',t);setRows(Array.isArray(data)?data:[]);}
    catch(e:any){setMessage(e?.message||'Unable to load Jobs Register');}
  }

  const statuses=useMemo(()=>Array.from(new Set(rows.map(x=>String(x.status||'')).filter(Boolean))).sort(),[rows]);
  const needsAttention=(b:Booking)=>{
    const bad=(v?:string)=>v&&['HOLD','BLOCKED','MISSING','REJECTED','FAILED','OVERDUE','PENDING'].includes(String(v).toUpperCase());
    return Boolean(bad(b.creditStatus)||bad(b.slotStatus)||bad(b.equipmentStatus)||['EXCEPTION','ON_HOLD','BLOCKED'].includes(String(b.status||'').toUpperCase()));
  };
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(b=>
      (model==='ALL'||String(b.businessModel||'NVOCC').toUpperCase()===model)&&
      (status==='ALL'||b.status===status)&&
      (attention==='ALL'||(attention==='ACTION'&&needsAttention(b))||(attention==='CLEAR'&&!needsAttention(b)))&&
      (!q||[b.bookingNo,b.businessModel,b.status,b.customer?.name,b.producingAgent?.name,b.origin,b.destination,b.carrier,b.vesselVoyage,b.equipment,b.shipmentNo].some(v=>String(v||'').toLowerCase().includes(q)))
    );
  },[rows,search,model,status,attention]);

  return <WorkspaceShell
    title="Jobs"
    subtitle="Single operational register across NVOCC + Global Forwarding · existing Booking/Job data only"
    active="/jobs"
    actions={<><a className="btn" href="/bookings" style={{textDecoration:'none'}}>Booking Register</a><button className="btn" onClick={()=>void load()}>Refresh</button></>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">TOTAL JOBS</div><div className="kpi">{rows.length}</div></div>
      <div className="card"><div className="sub">NVOCC</div><div className="kpi">{rows.filter(x=>String(x.businessModel||'NVOCC').toUpperCase()==='NVOCC').length}</div></div>
      <div className="card"><div className="sub">FORWARDING</div><div className="kpi">{rows.filter(x=>String(x.businessModel||'').toUpperCase()==='FORWARDING').length}</div></div>
      <div className="card"><div className="sub">NEEDS ACTION</div><div className="kpi">{rows.filter(needsAttention).length}</div></div>
    </div>
    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(240px,2fr) repeat(3,minmax(145px,1fr))',gap:8}}>
        <input style={fieldStyle} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job ref, customer, route, carrier, vessel…"/>
        <select style={fieldStyle} value={model} onChange={e=>setModel(e.target.value)}><option value="ALL">All models</option><option value="NVOCC">NVOCC</option><option value="FORWARDING">Forwarding</option></select>
        <select style={fieldStyle} value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option>{statuses.map(x=><option key={x}>{x}</option>)}</select>
        <select style={fieldStyle} value={attention} onChange={e=>setAttention(e.target.value)}><option value="ALL">All attention</option><option value="ACTION">Needs action</option><option value="CLEAR">Clear</option></select>
      </div>
    </div>
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
        <div><h3 style={{margin:0}}>Jobs Register</h3><div className="sub">This is a view of the existing canonical Booking/Job records; no duplicate job data is created.</div></div>
        <span className="status">{visible.length} visible</span>
      </div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr>
        <th>Job Ref</th><th>Model</th><th>Customer / Party</th><th>Route</th><th>Carrier / Vessel</th><th>Equipment</th><th>ETD / ETA</th><th>Controls</th><th>Status</th><th>Actions</th>
      </tr></thead><tbody>
        {visible.map(b=><tr key={b.id}>
          <td><a href={'/bookings/'+b.id} style={{fontWeight:800,color:'#123b61'}}>{b.bookingNo}</a><div className="sub">{b.shipmentNo||b.bookingChannel||''}</div></td>
          <td><span className="status">{String(b.businessModel||'NVOCC').toUpperCase()}</span></td>
          <td>{b.customer?.name||b.producingAgent?.name||'-'}</td>
          <td>{b.origin} → {b.destination}</td>
          <td>{b.carrier||'-'}<div className="sub">{b.vesselVoyage||''}</div></td>
          <td>{b.equipment||'-'}</td>
          <td>{fmtDate(b.etd)}<div className="sub">ETA {fmtDate(b.eta)}</div></td>
          <td><div className="sub">Credit {b.creditStatus||'-'} · Slot {b.slotStatus||'-'} · Equipment {b.equipmentStatus||'-'}</div></td>
          <td><span className="status">{b.status}</span>{needsAttention(b)&&<div className="sub" style={{marginTop:3}}>ACTION REQUIRED</div>}</td>
          <td><div style={{display:'flex',gap:5,flexWrap:'wrap',minWidth:150}}>
            <a className="btn" href={'/bookings/'+b.id} style={{textDecoration:'none'}}>Open Job</a>
            <button className="btn" type="button" onClick={()=>setModal(b)}>Quick View</button>
          </div></td>
        </tr>)}
        {!visible.length&&<tr><td colSpan={10}>No jobs match the selected filters.</td></tr>}
      </tbody></table></div>
    </div>

    {modal&&<div className="job-quick-overlay" role="dialog" aria-modal="true" aria-label={'Job '+modal.bookingNo} onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}>
      <div className="job-quick-modal">
        <div className="job-quick-head">
          <div><span>JOB QUICK VIEW</span><b>{modal.bookingNo} · {String(modal.businessModel||'NVOCC').toUpperCase()}</b></div>
          <div className="job-quick-actions"><a href={'/bookings/'+modal.id}>Open Full Job</a><button type="button" onClick={()=>setModal(null)} aria-label="Close quick view">×</button></div>
        </div>
        <iframe src={'/bookings/'+modal.id+'?embed=1'} title={'Job '+modal.bookingNo+' quick view'} className="job-quick-frame"/>
      </div>
    </div>}
  </WorkspaceShell>;
}
