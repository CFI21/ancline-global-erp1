'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;status:string;origin:string;destination:string;creditStatus?:string|null;slotStatus?:string|null;equipmentStatus?:string|null;customer?:{name:string}};
type Task={id:string;bookingId?:string|null;title:string;ownerId?:string|null;dueAt?:string|null;status:string;slaState?:string|null;booking?:{bookingNo:string}};
type Approval={id:string;bookingId?:string|null;type:string;approverId:string;status:string;reason?:string|null;booking?:{bookingNo:string}};
type Milestone={id:string;bookingId:string;label:string;location?:string|null;plannedAt?:string|null;status:string;booking?:{bookingNo:string;customer?:{name:string}}};

type ExceptionRow={id:string;severity:'CRITICAL'|'HIGH'|'MEDIUM';category:string;bookingId?:string;bookingNo:string;message:string;owner:string;due?:string;source:string};

export default function ExceptionsPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [milestones,setMilestones]=useState<Milestone[]>([]);
  const [search,setSearch]=useState('');
  const [severity,setSeverity]=useState('ALL');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);

  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const [b,ta,a,m]=await Promise.all([api('/bookings',t),api('/tasks',t),api('/approvals',t),api('/tracking',t)]);
      setBookings(Array.isArray(b)?b:[]);setTasks(Array.isArray(ta)?ta:[]);setApprovals(Array.isArray(a)?a:[]);setMilestones(Array.isArray(m)?m:[]);
    }catch(e:any){setMessage(e?.message||'Unable to load operational exceptions.');}
    finally{setBusy(false);}
  }

  const rows=useMemo<ExceptionRow[]>(()=>{
    const now=Date.now();const out:ExceptionRow[]=[];
    for(const b of bookings){
      if(b.creditStatus==='Blocked')out.push({id:`credit-${b.id}`,severity:'CRITICAL',category:'Credit',bookingId:b.id,bookingNo:b.bookingNo,message:'Credit status is blocked',owner:'Finance / Credit',source:'Booking'});
      if(b.slotStatus==='Waitlist')out.push({id:`slot-${b.id}`,severity:'HIGH',category:'Slot',bookingId:b.id,bookingNo:b.bookingNo,message:'Carrier slot is waitlisted',owner:'Operations',source:'Booking'});
      if(b.equipmentStatus==='Shortage')out.push({id:`equipment-${b.id}`,severity:'HIGH',category:'Equipment',bookingId:b.id,bookingNo:b.bookingNo,message:'Equipment shortage reported',owner:'Equipment Desk',source:'Booking'});
    }
    for(const t of tasks){
      if(t.status==='Completed'||!t.dueAt)continue;
      const due=new Date(t.dueAt).getTime();
      if(due<now)out.push({id:`task-${t.id}`,severity:now-due>86400000?'HIGH':'MEDIUM',category:'Overdue Task',bookingId:t.bookingId||undefined,bookingNo:t.booking?.bookingNo||'-',message:t.title,owner:t.ownerId||'Unassigned',due:t.dueAt,source:'Task'});
    }
    for(const a of approvals){
      if(a.status==='Pending')out.push({id:`approval-${a.id}`,severity:'MEDIUM',category:'Pending Approval',bookingId:a.bookingId||undefined,bookingNo:a.booking?.bookingNo||'-',message:`${a.type}${a.reason?` — ${a.reason}`:''}`,owner:a.approverId||'Approver',source:'Approval'});
    }
    for(const m of milestones){
      if(m.status==='COMPLETED'||!m.plannedAt)continue;
      const due=new Date(m.plannedAt).getTime();
      if(due<now)out.push({id:`milestone-${m.id}`,severity:now-due>86400000?'CRITICAL':'HIGH',category:'Late Milestone',bookingId:m.bookingId,bookingNo:m.booking?.bookingNo||'-',message:`${m.label}${m.location?` at ${m.location}`:''}`,owner:'Operations',due:m.plannedAt,source:'Tracking'});
    }
    const rank={CRITICAL:0,HIGH:1,MEDIUM:2};
    return out.sort((x,y)=>rank[x.severity]-rank[y.severity]||(x.due&&y.due?new Date(x.due).getTime()-new Date(y.due).getTime():0));
  },[bookings,tasks,approvals,milestones]);

  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(r=>(severity==='ALL'||r.severity===severity)&&(!q||[r.bookingNo,r.category,r.message,r.owner,r.source].some(x=>String(x||'').toLowerCase().includes(q))));},[rows,search,severity]);
  const count=(s:string)=>rows.filter(r=>r.severity===s).length;

  return <WorkspaceShell title="Exceptions & Action Board" subtitle="Operational risks, overdue work and approvals requiring attention" active="/exceptions" actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Refreshing…':'Refresh'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div className="grid" style={{marginBottom:12}}>
      <div className="card"><div className="sub">Open Exceptions</div><div className="kpi">{rows.length}</div></div>
      <div className="card"><div className="sub">Critical</div><div className="kpi">{count('CRITICAL')}</div></div>
      <div className="card"><div className="sub">High</div><div className="kpi">{count('HIGH')}</div></div>
      <div className="card"><div className="sub">Pending Approvals</div><div className="kpi">{approvals.filter(x=>x.status==='Pending').length}</div></div>
    </div>
    <div className="card">
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
        <input style={{...fieldStyle,maxWidth:360}} placeholder="Search booking, exception, owner…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select style={{...fieldStyle,maxWidth:190}} value={severity} onChange={e=>setSeverity(e.target.value)}><option value="ALL">All severities</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option></select>
        <span className="status">{visible.length} visible</span>
      </div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Severity</th><th>Booking</th><th>Category</th><th>Exception / Action</th><th>Owner</th><th>Due</th><th>Source</th><th>Action</th></tr></thead><tbody>
        {visible.map(r=><tr key={r.id}><td><b>{r.severity}</b></td><td>{r.bookingId?<a href={`/bookings/${r.bookingId}`}><b>{r.bookingNo}</b></a>:r.bookingNo}</td><td>{r.category}</td><td style={{whiteSpace:'normal',minWidth:240}}>{r.message}</td><td>{r.owner}</td><td>{fmtDate(r.due)}</td><td>{r.source}</td><td>{r.bookingId?<a className="btn" style={{textDecoration:'none',display:'inline-block'}} href={`/bookings/${r.bookingId}`}>Open Job</a>:'-'}</td></tr>)}
        {visible.length===0&&<tr><td colSpan={8}>No matching operational exceptions.</td></tr>}
      </tbody></table></div>
    </div>
  </WorkspaceShell>;
}
