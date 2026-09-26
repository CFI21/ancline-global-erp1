'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle} from '../../components/WorkspaceShell';
import {api,currentUser,fmtDate,requireToken} from '../../lib/api';

type Task={id:string;bookingId?:string;title:string;ownerId?:string;dueAt?:string;status:string;slaState?:string;createdAt?:string};
type ControlRow={
  id:string;severity?:string;category?:string;bookingId?:string;bookingNo?:string;businessModel?:string;
  branch?:string;owner?:string;message?:string;due?:string;source?:string;actionLabel?:string;actionHref?:string;
  taskId?:string;taskStatus?:string;slaState?:string;queueMutable?:boolean;escalationLevel?:string;
};
type Dashboard={summary?:Record<string,number>;rows?:ControlRow[];filters?:{owners?:string[];branches?:string[];businessModels?:string[]}};
type WorkRow={
  key:string;kind:'TASK'|'EXCEPTION';title:string;bookingId?:string;bookingNo?:string;owner:string;team:string;
  due?:string;severity:string;sla:string;status:string;resolution:string;source:string;actionHref:string;actionLabel:string;
};
type SavedView={name:string;view:string;search:string;owner:string;status:string;sort:string};

const terminal=(s?:string)=>String(s||'').toUpperCase()==='COMPLETED';
const late=(d?:string,s?:string)=>Boolean(d&&!terminal(s)&&new Date(d).getTime()<Date.now());
const sevRank:Record<string,number>={CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1};

export default function OperationsWorkbenchPage(){
  const [token,setToken]=useState('');
  const [tasks,setTasks]=useState<Task[]>([]);
  const [control,setControl]=useState<Dashboard>({summary:{},rows:[],filters:{}});
  const [view,setView]=useState('MY_WORK');
  const [search,setSearch]=useState('');
  const [owner,setOwner]=useState('ALL');
  const [status,setStatus]=useState('OPEN');
  const [sort,setSort]=useState('PRIORITY');
  const [savedViews,setSavedViews]=useState<SavedView[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const actor=String(currentUser()?.email||currentUser()?.sub||'').toLowerCase();

  useEffect(()=>{
    const t=requireToken();if(!t)return;
    setToken(t);
    try{const raw=JSON.parse(localStorage.getItem('ancline_ops_workbench_views')||'[]');setSavedViews(Array.isArray(raw)?raw:[]);}catch{}
    void load(t);
  },[]);

  async function load(t=token){
    setBusy(true);setMessage('');
    try{
      const [taskData,dash]=await Promise.all([api('/tasks',t),api('/operations/control-dashboard',t)]);
      setTasks(Array.isArray(taskData)?taskData:[]);
      setControl(dash&&typeof dash==='object'?dash:{summary:{},rows:[],filters:{}});
    }catch(e:any){setMessage(e?.message||'Unable to load Operations Workbench.');}
    finally{setBusy(false);}
  }

  const rows=useMemo<WorkRow[]>(()=>{
    const controlRows=control.rows||[];
    const taskRows:WorkRow[]=tasks.map(t=>{
      const related=controlRows.find(r=>r.taskId===t.id)||controlRows.find(r=>r.bookingId&&r.bookingId===t.bookingId);
      return {
        key:'T:'+t.id,kind:'TASK',title:t.title,bookingId:t.bookingId,bookingNo:related?.bookingNo||'General',
        owner:t.ownerId||'Unassigned',team:related?.branch||related?.source||'Operations',
        due:t.dueAt,severity:related?.severity||'—',sla:t.slaState||related?.slaState||'—',
        status:t.status||'Open',resolution:terminal(t.status)?'Completed':'Open',
        source:related?.source||'Task',actionHref:t.bookingId?('/bookings/'+t.bookingId):'/tasks',actionLabel:t.bookingId?'Open Job':'Open Task'
      };
    });
    const taskIds=new Set(tasks.map(t=>t.id));
    const exceptionRows:WorkRow[]=controlRows.filter(r=>!r.taskId||!taskIds.has(r.taskId)).map(r=>({
      key:'E:'+r.id,kind:'EXCEPTION',title:r.message||r.category||'Operational exception',
      bookingId:r.bookingId,bookingNo:r.bookingNo||'General',owner:r.owner||'Unassigned',team:r.branch||r.source||'Operations',
      due:r.due,severity:r.severity||'—',sla:r.slaState||r.escalationLevel||'—',
      status:r.taskStatus||'Open',resolution:String(r.taskStatus||'').toUpperCase()==='COMPLETED'?'Completed':'Open',
      source:r.source||r.category||'Exception',actionHref:r.actionHref||'/exceptions',actionLabel:r.actionLabel||'Open'
    }));
    return [...taskRows,...exceptionRows];
  },[tasks,control]);

  const ownerOptions=useMemo(()=>Array.from(new Set(rows.map(r=>r.owner).filter(Boolean))).sort(),[rows]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    let out=rows.filter(r=>{
      const isOpen=!terminal(r.status);
      const mine=actor&&r.owner.toLowerCase()===actor;
      const isLate=late(r.due,r.status);
      const isCritical=r.severity==='CRITICAL';
      const viewOk=
        view==='ALL'||(view==='MY_WORK'&&mine&&isOpen)||(view==='TEAM_WORK'&&!mine&&isOpen)||
        (view==='OVERDUE'&&isLate)||(view==='CRITICAL'&&isCritical&&isOpen);
      const ownerOk=owner==='ALL'||r.owner===owner;
      const statusOk=status==='ALL'||(status==='OPEN'&&isOpen)||(status==='COMPLETED'&&!isOpen);
      const searchOk=!q||[r.title,r.bookingNo,r.owner,r.team,r.severity,r.sla,r.status,r.source].some(v=>String(v||'').toLowerCase().includes(q));
      return viewOk&&ownerOk&&statusOk&&searchOk;
    });
    out=[...out].sort((a,b)=>{
      if(sort==='DUE')return (a.due?new Date(a.due).getTime():Number.MAX_SAFE_INTEGER)-(b.due?new Date(b.due).getTime():Number.MAX_SAFE_INTEGER);
      if(sort==='OWNER')return a.owner.localeCompare(b.owner);
      if(sort==='STATUS')return a.status.localeCompare(b.status);
      const ap=(late(a.due,a.status)?10:0)+(sevRank[a.severity]||0);
      const bp=(late(b.due,b.status)?10:0)+(sevRank[b.severity]||0);
      return bp-ap;
    });
    return out;
  },[rows,view,search,owner,status,sort,actor]);

  const open=rows.filter(r=>!terminal(r.status));
  const mine=open.filter(r=>actor&&r.owner.toLowerCase()===actor);
  const team=open.filter(r=>!actor||r.owner.toLowerCase()!==actor);
  const overdue=open.filter(r=>late(r.due,r.status));
  const critical=open.filter(r=>r.severity==='CRITICAL');

  function saveCurrentView(){
    const name=window.prompt('Saved view name');
    if(!name?.trim())return;
    const next=[{name:name.trim(),view,search,owner,status,sort},...savedViews.filter(v=>v.name!==name.trim())].slice(0,12);
    localStorage.setItem('ancline_ops_workbench_views',JSON.stringify(next));setSavedViews(next);
  }
  function applySaved(v:SavedView){setView(v.view);setSearch(v.search);setOwner(v.owner);setStatus(v.status);setSort(v.sort);}
  function removeSaved(name:string){
    const next=savedViews.filter(v=>v.name!==name);localStorage.setItem('ancline_ops_workbench_views',JSON.stringify(next));setSavedViews(next);
  }

  const cards=[
    ['MY WORK',mine.length,'MY_WORK'],['TEAM WORK',team.length,'TEAM_WORK'],['OVERDUE',overdue.length,'OVERDUE'],
    ['CRITICAL',critical.length,'CRITICAL'],['ACTION QUEUE',Number(control.summary?.queueOpen||0),'ALL'],['ALL OPEN',open.length,'ALL']
  ];

  return <WorkspaceShell
    title="Operations Workbench"
    subtitle="My Work · Team Work · overdue · critical · action queue · Operations Control"
    active="/operations-workbench"
    actions={<button className="btn" disabled={busy} onClick={()=>void load()}>{busy?'Refreshing…':'Refresh'}</button>}
  >
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

    <div className="grid" style={{marginBottom:12}}>
      {cards.map(([label,value,key])=><button key={String(label)} className="card" style={{textAlign:'left',cursor:'pointer'}} onClick={()=>setView(String(key))}>
        <div className="sub">{label}</div><div className="kpi">{value}</div>
      </button>)}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <select aria-label="Workbench view" style={{...fieldStyle,maxWidth:175}} value={view} onChange={e=>setView(e.target.value)}>
          <option value="MY_WORK">My Work</option><option value="TEAM_WORK">Team Work</option><option value="OVERDUE">Overdue</option><option value="CRITICAL">Critical</option><option value="ALL">All Work</option>
        </select>
        <input aria-label="Workbench search" style={{...fieldStyle,minWidth:220,flex:'1 1 260px'}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, owner, team, SLA, status or source"/>
        <select aria-label="Owner filter" style={{...fieldStyle,maxWidth:210}} value={owner} onChange={e=>setOwner(e.target.value)}>
          <option value="ALL">All owners</option>{ownerOptions.map(x=><option key={x}>{x}</option>)}
        </select>
        <select aria-label="Status filter" style={{...fieldStyle,maxWidth:150}} value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="OPEN">Open</option><option value="COMPLETED">Completed</option><option value="ALL">All statuses</option>
        </select>
        <select aria-label="Sort work" style={{...fieldStyle,maxWidth:170}} value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="PRIORITY">Priority</option><option value="DUE">Due date</option><option value="OWNER">Owner</option><option value="STATUS">Status</option>
        </select>
        <button className="btn" onClick={saveCurrentView}>Save View</button>
        <span className="status">{filtered.length} visible</span>
      </div>
      {savedViews.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
        <span className="sub" style={{alignSelf:'center'}}>Saved:</span>
        {savedViews.map(v=><span key={v.name} style={{display:'inline-flex',gap:2}}>
          <button className="btn" onClick={()=>applySaved(v)}>{v.name}</button>
          <button className="btn" aria-label={'Remove saved view '+v.name} onClick={()=>removeSaved(v.name)}>×</button>
        </span>)}
      </div>}
      <div className="sub" style={{marginTop:8}}>Presentation is consolidated only. Existing task ownership, SLA, exception lifecycle, role/scope, audit and maker-checker controls remain the source of truth.</div>
    </div>

    <div className="card">
      <div style={{overflowX:'auto'}}>
        <table className="table">
          <thead><tr><th>Type</th><th>Priority</th><th>Job</th><th>Work / Exception</th><th>Owner</th><th>Team / Queue</th><th>Due</th><th>SLA</th><th>Status</th><th>Resolution</th><th>Source</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map(r=><tr key={r.key}>
              <td><span className="status">{r.kind}</span></td>
              <td><b>{r.severity}</b>{late(r.due,r.status)&&<div className="sub">OVERDUE</div>}</td>
              <td>{r.bookingId?<a href={'/bookings/'+r.bookingId}><b>{r.bookingNo}</b></a>:r.bookingNo}</td>
              <td style={{whiteSpace:'normal',minWidth:240}}>{r.title}</td>
              <td>{r.owner}</td><td>{r.team}</td><td>{fmtDate(r.due)||'—'}</td><td>{r.sla}</td>
              <td><span className="status">{r.status}</span></td><td>{r.resolution}</td><td>{r.source}</td>
              <td><a className="btn" style={{textDecoration:'none',whiteSpace:'nowrap'}} href={r.actionHref}>{r.actionLabel}</a></td>
            </tr>)}
            {filtered.length===0&&<tr><td colSpan={12}>No work items match this view.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </WorkspaceShell>;
}
