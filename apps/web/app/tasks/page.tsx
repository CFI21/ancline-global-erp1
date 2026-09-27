'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import JobFlowNav from '../../components/JobFlowNav';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string};
type Task={id:string;bookingId?:string;title:string;ownerId?:string;dueAt?:string;status:string;slaState?:string;createdAt?:string;booking?:{bookingNo?:string;origin?:string;destination?:string}};

export default function TasksPage(){
  const [token,setToken]=useState('');
  const [rows,setRows]=useState<Task[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('OPEN');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [rowBusy,setRowBusy]=useState('');
  const [form,setForm]=useState({bookingId:'',title:'',ownerId:'',dueAt:''});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);try{const u=JSON.parse(localStorage.getItem('ancline_user')||'{}');setForm(f=>({...f,ownerId:u.email||u.sub||''}));}catch{}void load(t);},[]);
  async function load(t=token){try{const [tasks,books]=await Promise.all([api('/tasks',t),api('/bookings',t)]);const taskRows=Array.isArray(tasks)?tasks:[];const bookingRows=Array.isArray(books)?books:[];setRows(taskRows);setBookings(bookingRows);const contextId=new URLSearchParams(location.search).get('bookingId')||'';if(contextId&&bookingRows.some((x:Booking)=>x.id===contextId)){setForm(x=>({...x,bookingId:contextId}));const bk=bookingRows.find((x:Booking)=>x.id===contextId);if(bk)setSearch(bk.bookingNo);}}catch(e:any){setMessage(e.message||'Unable to load tasks');}}
  const bookingLabel=(id?:string)=>{const b=bookings.find(x=>x.id===id);return b?`${b.bookingNo} · ${b.origin} → ${b.destination}`:(id||'-');};
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter(t=>{const isClosed=['COMPLETED','Completed'].includes(t.status);const f=filter==='ALL'||(filter==='OPEN'&&!isClosed)||(filter==='COMPLETED'&&isClosed)||(filter==='OVERDUE'&&Boolean(t.dueAt&&new Date(t.dueAt)<new Date()&&!isClosed));const s=!q||[t.title,t.ownerId,t.status,t.slaState,bookingLabel(t.bookingId)].some(v=>String(v||'').toLowerCase().includes(q));return f&&s;});},[rows,search,filter,bookings]);
  const open=rows.filter(x=>!['COMPLETED','Completed'].includes(x.status)).length;
  const overdue=rows.filter(x=>x.dueAt&&new Date(x.dueAt)<new Date()&&!['COMPLETED','Completed'].includes(x.status)).length;

  async function createTask(){
    if(!form.title.trim()){setMessage('Task title is required.');return;}
    setBusy(true);setMessage('');
    try{await api('/tasks',token,{method:'POST',body:JSON.stringify({bookingId:form.bookingId||null,title:form.title.trim(),ownerId:form.ownerId.trim()||null,dueAt:form.dueAt?new Date(form.dueAt).toISOString():null,status:'OPEN',slaState:'Active'})});setMessage('Task created.');setForm({...form,bookingId:'',title:'',dueAt:''});await load();}catch(e:any){setMessage(e.message||'Task could not be created.');}finally{setBusy(false);}
  }
  async function patchTask(id:string,patch:any,success='Task updated.'){
    setRowBusy(id);setMessage('');
    try{await api(`/tasks/${id}`,token,{method:'PATCH',body:JSON.stringify(patch)});setMessage(success);await load();}
    catch(e:any){setMessage(e.message||'Task update failed.');}
    finally{setRowBusy('');}
  }
  async function complete(id:string){setMessage('');try{await api(`/tasks/${id}/complete`,token,{method:'POST'});setMessage('Task completed.');await load();}catch(e:any){setMessage(e.message||'Task completion failed.');}}
  function localDateTime(value?:string){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}

  return <WorkspaceShell title="My Work" subtitle="Operational tasks, ownership, due dates and SLA control" active="/tasks" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {form.bookingId&&<JobFlowNav bookingId={form.bookingId} bookingNo={bookings.find(b=>b.id===form.bookingId)?.bookingNo} active="TASKS"/>}
    {form.bookingId&&<JobContextRail bookingId={form.bookingId} bookingNo={bookings.find(b=>b.id===form.bookingId)?.bookingNo} active="TASKS"/>}
    <div className="grid" style={{marginBottom:12}}><div className="card"><div className="sub">OPEN TASKS</div><div className="kpi">{open}</div></div><div className="card"><div className="sub">OVERDUE</div><div className="kpi">{overdue}</div></div><div className="card"><div className="sub">COMPLETED</div><div className="kpi">{rows.length-open}</div></div><div className="card"><div className="sub">TOTAL</div><div className="kpi">{rows.length}</div></div></div>
    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Create Task</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking / Job</span><select style={fieldStyle} value={form.bookingId} onChange={e=>setForm({...form,bookingId:e.target.value})}><option value="">General task</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Task Title *</span><input style={fieldStyle} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Submit SI to carrier"/></label>
      <label><span style={labelStyle}>Owner</span><input style={fieldStyle} value={form.ownerId} onChange={e=>setForm({...form,ownerId:e.target.value})}/></label>
      <label><span style={labelStyle}>Due Date / Time</span><input type="datetime-local" style={fieldStyle} value={form.dueAt} onChange={e=>setForm({...form,dueAt:e.target.value})}/></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy} onClick={createTask}>{busy?'Saving…':'Create Task'}</button></div></div>
    <div className="card"><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><input style={{...fieldStyle,maxWidth:360}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, booking, owner or status"/><select style={{...fieldStyle,maxWidth:180}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="OPEN">Open</option><option value="OVERDUE">Overdue</option><option value="COMPLETED">Completed</option><option value="ALL">All</option></select></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Task</th><th>Booking</th><th>Owner</th><th>Due</th><th>SLA</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {visible.map(t=>{const isClosed=['COMPLETED','Completed'].includes(t.status);const late=Boolean(t.dueAt&&new Date(t.dueAt)<new Date()&&!isClosed);const locked=rowBusy===t.id;return <tr key={t.id}>
        <td><b>{t.title}</b></td>
        <td>{t.bookingId?<><a href={`/bookings/${t.bookingId}`} style={{fontWeight:800,color:'#123b61'}}>{bookingLabel(t.bookingId)}</a></>:bookingLabel(t.bookingId)}</td>
        <td><input disabled={locked||isClosed} style={{...fieldStyle,minWidth:180}} defaultValue={t.ownerId||''} placeholder="Owner email / ID" onBlur={e=>{const v=e.target.value.trim();if(v!==(t.ownerId||''))void patchTask(t.id,{ownerId:v||null},'Task owner updated.');}}/></td>
        <td><div style={{display:'grid',gap:4,minWidth:190}}><input disabled={locked||isClosed} type="datetime-local" style={fieldStyle} defaultValue={localDateTime(t.dueAt)} onBlur={e=>{const next=e.target.value?new Date(e.target.value).toISOString():null;const current=t.dueAt?new Date(t.dueAt).toISOString():null;if(next!==current)void patchTask(t.id,{dueAt:next},'Task due date updated.');}}/>{late&&<span className="status">OVERDUE</span>}</div></td>
        <td><span className="status">{t.slaState||'-'}</span></td>
        <td><select disabled={locked} style={{...fieldStyle,minWidth:150}} value={t.status} onChange={e=>void patchTask(t.id,{status:e.target.value},'Task status updated.')}><option>Open</option><option>Acknowledged</option><option>In Progress</option><option>Completed</option></select></td>
        <td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{t.bookingId&&<a className="btn" href={`/bookings/${t.bookingId}`} style={{textDecoration:'none'}}>Open Job</a>}{isClosed?<span className="status">Done</span>:<button className="btn" disabled={locked} onClick={()=>complete(t.id)}>Complete</button>}</div></td>
      </tr>;})}
      {visible.length===0&&<tr><td colSpan={7}>No tasks found for this filter.</td></tr>}
    </tbody></table></div></div>
  </WorkspaceShell>;
}
