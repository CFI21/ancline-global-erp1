'use client';

import {useEffect,useMemo,useState} from 'react';
import {api,currentUser,requireToken} from '../lib/api';
import WorkspaceShell from '../components/WorkspaceShell';

type Health={status?:string};
type Booking={
  id:string; bookingNo?:string; businessModel?:string; bookingChannel?:string; shipmentNo?:string;
  shipmentStatus?:string; status?:string; origin?:string; destination?:string; carrier?:string;
  etd?:string; eta?:string; customer?:{name?:string}|null;
};
type Task={id:string;bookingId?:string;title:string;ownerId?:string;dueAt?:string;status:string;slaState?:string};
type ControlRow={
  id:string;severity?:string;category?:string;bookingId?:string;bookingNo?:string;message?:string;
  owner?:string;due?:string;actionHref?:string;actionLabel?:string;taskId?:string;taskStatus?:string;slaState?:string;
};
type ControlDashboard={summary?:Record<string,number>;rows?:ControlRow[]};
type ScreenRef={href:string;label:string;at?:string};

const terminal=new Set(['COMPLETED','FINANCIALLY_CLOSED','CANCELLED']);
const financeCategories=new Set(['PAYMENT_RELEASE_BLOCK','RECONCILIATION_EXCEPTION']);
const closedTask=(s?:string)=>String(s||'').toUpperCase()==='COMPLETED';
const fmtDue=(v?:string)=>v?new Date(v).toLocaleDateString():'—';

export default function Home(){
  const [health,setHealth]=useState<Health>({status:'checking'});
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [control,setControl]=useState<ControlDashboard>({summary:{},rows:[]});
  const [recent,setRecent]=useState<ScreenRef[]>([]);
  const [favorites,setFavorites]=useState<ScreenRef[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const user=currentUser();
  const actor=String(user?.email||user?.sub||'').toLowerCase();

  useEffect(()=>{
    const token=requireToken();if(!token)return;
    const role=String(currentUser()?.role||'');
    if(['CUSTOMER','SHIPPER','CONSIGNEE'].includes(role)){location.replace('/customer-portal');return;}
    if(['AGENT','BRANCH_OPS'].includes(role)){location.replace('/nvocc-portal');return;}
    try{
      const r=JSON.parse(localStorage.getItem('ancline_recent_screens')||'[]');
      const f=JSON.parse(localStorage.getItem('ancline_favorite_screens')||'[]');
      setRecent(Array.isArray(r)?r.slice(0,6):[]);
      setFavorites(Array.isArray(f)?f.slice(0,6):[]);
    }catch{}
    void load(token);
  },[]);

  async function load(token:string){
    setLoading(true);setError('');
    try{
      const [h,b,t,c]=await Promise.all([
        api('/health'),
        api('/bookings',token),
        api('/tasks',token),
        api('/operations/control-dashboard',token)
      ]);
      setHealth(h&&typeof h==='object'?h:{status:'offline'});
      setBookings(Array.isArray(b)?b:[]);
      setTasks(Array.isArray(t)?t:[]);
      setControl(c&&typeof c==='object'?c:{summary:{},rows:[]});
    }catch(e:any){
      setError(e?.message||'Unable to load executive dashboard data');
    }finally{setLoading(false);}
  }

  const data=useMemo(()=>{
    const activeJobs=bookings.filter(b=>!terminal.has(String(b.status||'').toUpperCase()));
    const openTasks=tasks.filter(t=>!closedTask(t.status));
    const myWork=openTasks.filter(t=>!actor||String(t.ownerId||'').toLowerCase()===actor);
    const overdue=openTasks.filter(t=>Boolean(t.dueAt&&new Date(t.dueAt).getTime()<Date.now()));
    const rows=control.rows||[];
    const critical=rows.filter(r=>String(r.severity||'').toUpperCase()==='CRITICAL');
    const financeAttention=rows.filter(r=>financeCategories.has(String(r.category||'').toUpperCase()));
    return {activeJobs,myWork,overdue,critical,financeAttention,rows};
  },[bookings,tasks,control,actor]);

  const cards=[
    {label:'MY WORK',value:data.myWork.length,href:'/operations-workbench',detail:'Open tasks assigned to me'},
    {label:'CRITICAL EXCEPTIONS',value:data.critical.length,href:'/operations-workbench',detail:'Immediate operational attention'},
    {label:'OVERDUE',value:data.overdue.length,href:'/operations-workbench',detail:'Open tasks past due'},
    {label:'OPEN JOBS',value:data.activeJobs.length,href:'/jobs',detail:'Active NVOCC + Forwarding jobs'},
    {label:'FINANCE ATTENTION',value:data.financeAttention.length,href:'/exceptions?category=PAYMENT_RELEASE_BLOCK',detail:'Payment, release or reconciliation'},
    {label:'QUEUE OPEN',value:Number(control.summary?.queueOpen||control.summary?.open||0),href:'/exceptions',detail:'Governed operations queue'}
  ];

  const taskRows=(data.myWork.length?data.myWork:tasks.filter(t=>!closedTask(t.status))).slice(0,6);
  const exceptionRows=(data.critical.length?data.critical:data.rows).slice(0,6);
  const quick=[
    ['/bookings?new=1','New Booking'],
    ['/shipment-control?new=1','New Shipment'],
    ['/operations-workbench','Operations Workbench'],
    ['/tasks','My Work'],
    ['/finance','Job Costing'],
    ['/enterprise-reporting','Enterprise BI']
  ];

  return <WorkspaceShell
    title="Executive Home"
    subtitle="ANCLINE operational overview · work, exceptions, jobs and finance attention"
    active="/"
    actions={<span className="status">API: {health.status||'unknown'}</span>}
  >
    {error&&<div className="card" style={{marginBottom:12}}>Dashboard notice: {error}</div>}

    <div className="grid" style={{marginBottom:12}}>
      {cards.map(c=><a key={c.label} href={c.href} className="card" style={{textDecoration:'none',color:'inherit'}}>
        <div className="sub">{c.label}</div>
        <div className="kpi">{loading?'…':c.value}</div>
        <div className="sub">{c.detail}</div>
      </a>)}
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:12,marginBottom:12}}>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
          <div><h3 style={{margin:'0 0 3px'}}>My Work</h3><div className="sub">Owned and due operational tasks.</div></div>
          <a href="/tasks">Open all</a>
        </div>
        <div style={{marginTop:8}}>
          {taskRows.map(t=><div key={t.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,padding:'8px 0',borderTop:'1px solid #e1e6ea'}}>
            <div><b>{t.title}</b><div className="sub">{t.ownerId||'Unassigned'} · {t.slaState||'SLA active'}</div></div>
            <div style={{textAlign:'right'}}><span className="status">{t.status}</span><div className="sub">{fmtDue(t.dueAt)}</div></div>
          </div>)}
          {!loading&&taskRows.length===0&&<div className="sub" style={{paddingTop:8}}>No open work items.</div>}
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
          <div><h3 style={{margin:'0 0 3px'}}>Critical Exceptions</h3><div className="sub">Highest-priority operations-control items.</div></div>
          <a href="/exceptions">Open control</a>
        </div>
        <div style={{marginTop:8}}>
          {exceptionRows.map(r=><div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,padding:'8px 0',borderTop:'1px solid #e1e6ea'}}>
            <div><b>{r.bookingNo||'General'}</b> · {r.message||r.category}<div className="sub">{r.owner||'Unassigned'} · {r.category||'ACTION_REQUIRED'}</div></div>
            <div><span className="status">{r.severity||'OPEN'}</span></div>
          </div>)}
          {!loading&&exceptionRows.length===0&&<div className="sub" style={{paddingTop:8}}>No open operational exceptions.</div>}
        </div>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12,marginBottom:12}}>
      <div className="card">
        <h3 style={{margin:'0 0 8px'}}>Quick Actions</h3>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {quick.map(([href,label])=><a key={href} className="btn" href={href} style={{textDecoration:'none'}}>{label}</a>)}
        </div>
      </div>
      <div className="card">
        <h3 style={{margin:'0 0 8px'}}>Favorite Screens</h3>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {favorites.length?favorites.map(x=><a key={x.href} className="btn" href={x.href} style={{textDecoration:'none'}}>★ {x.label}</a>):<span className="sub">Use ☆ Favorite in the command bar on any screen.</span>}
        </div>
      </div>
      <div className="card">
        <h3 style={{margin:'0 0 8px'}}>Recent Screens</h3>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {recent.length?recent.map(x=><a key={x.href} className="btn" href={x.href} style={{textDecoration:'none'}}>{x.label}</a>):<span className="sub">Recent navigation will appear here automatically.</span>}
        </div>
      </div>
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><h3 style={{margin:'0 0 3px'}}>Open Jobs</h3><div className="sub">One compact register across NVOCC and Global Forwarding.</div></div>
        <a href="/jobs">Open Jobs Register</a>
      </div>
      <div style={{overflowX:'auto',marginTop:10}}><table className="table"><thead><tr><th>Job</th><th>Model</th><th>Status</th><th>Route</th><th>Carrier</th><th>ETD / ETA</th><th>Customer</th><th></th></tr></thead><tbody>
        {data.activeJobs.slice(0,12).map(b=><tr key={b.id}>
          <td><b>{b.bookingNo||'-'}</b><div className="sub">{b.shipmentNo||b.bookingChannel||'INTERNAL'}</div></td>
          <td><span className="status">{String(b.businessModel||'NVOCC').toUpperCase()}</span></td>
          <td><span className="status">{b.shipmentStatus||b.status||'-'}</span></td>
          <td>{b.origin||'-'} → {b.destination||'-'}</td>
          <td>{b.carrier||'-'}</td>
          <td>{b.etd?new Date(b.etd).toLocaleDateString():'-'}<div className="sub">{b.eta?new Date(b.eta).toLocaleDateString():'-'}</div></td>
          <td>{b.customer?.name||'-'}</td>
          <td><a href={`/bookings/${b.id}`}>Open</a></td>
        </tr>)}
        {!loading&&data.activeJobs.length===0&&<tr><td colSpan={8}>No open jobs to display.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
