'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

type Employee={employeeId:string;name:string;email?:string|null;role?:string;branchId?:string|null;department?:string|null;capacityHoursPerWeek?:number;skills?:string[];active?:boolean;notes?:string|null;updatedAt?:string};
type Booking={id:string;bookingNo:string;status?:string;origin?:string;destination?:string;customer?:{name?:string}};
type Dashboard={
  summary:any;employees:Employee[];certifications:any[];leave:any[];shifts:any[];training:any[];assignments:any[];
  utilization:any[];expiredCerts:any[];expiringCerts:any[];overdueTraining:any[];
};

const blankEmployee={name:'',email:'',role:'OPERATIONS',branchId:'',department:'',capacityHoursPerWeek:40,skills:'',active:true,notes:''};
const blankCert={name:'',certificateNo:'',issuedDate:'',expiryDate:'',status:'VALID'};
const blankTraining={course:'',required:true,dueDate:'',completedAt:'',status:'PENDING'};
const blankLeave={leaveType:'LEAVE',startDate:'',endDate:'',status:'APPROVED',notes:''};
const blankShift={startAt:'',endAt:'',status:'PLANNED',branchId:'',roleRequired:'',notes:''};
const blankAssignment={bookingId:'',assignmentRole:'OPERATOR',startAt:'',endAt:'',status:'ASSIGNED',notes:''};

const fmtDate=(v?:string|null)=>v?new Date(v).toLocaleDateString():'—';
const fmtDateTime=(v?:string|null)=>v?new Date(v).toLocaleString():'—';
const iso=(v:string)=>v?new Date(v).toISOString():null;

export default function WorkforcePage(){
  const [token,setToken]=useState('');
  const [d,setD]=useState<Dashboard>({summary:{},employees:[],certifications:[],leave:[],shifts:[],training:[],assignments:[],utilization:[],expiredCerts:[],expiringCerts:[],overdueTraining:[]});
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const [search,setSearch]=useState('');
  const [roleFilter,setRoleFilter]=useState('ALL');
  const [branchFilter,setBranchFilter]=useState('ALL');
  const [utilFilter,setUtilFilter]=useState('ALL');
  const [availabilityFilter,setAvailabilityFilter]=useState('ALL');

  const [selectedId,setSelectedId]=useState('');
  const [tab,setTab]=useState<'Details'|'Availability & Shifts'|'Certification & Training'|'Assignments'|'Notes'>('Details');
  const [newMode,setNewMode]=useState(false);

  const [employee,setEmployee]=useState<any>(blankEmployee);
  const [cert,setCert]=useState<any>(blankCert);
  const [training,setTraining]=useState<any>(blankTraining);
  const [leave,setLeave]=useState<any>(blankLeave);
  const [shift,setShift]=useState<any>(blankShift);
  const [assignment,setAssignment]=useState<any>(blankAssignment);
  const [suitability,setSuitability]=useState<any[]>([]);

  useEffect(()=>{
    const t=requireToken();
    if(!t)return;
    setToken(t);
    void load(t);
    const p=new URLSearchParams(location.search);
    const id=p.get('employee');
    if(id)setSelectedId(id);
    if(p.get('new')==='1')startNew();
  },[]);

  async function load(t=token){
    try{
      const [wd,b]=await Promise.all([
        api('/workforce/dashboard',t),
        api('/bookings',t).catch(()=>[])
      ]);
      setD(wd);
      setBookings(Array.isArray(b)?b:[]);
    }catch(e:any){setMsg(e?.message||'Unable to load Workforce / Resource Control');}
  }

  const utilizationMap=useMemo(()=>new Map((d.utilization||[]).map((x:any)=>[x.employeeId,x])),[d.utilization]);
  const roles=useMemo(()=>Array.from(new Set((d.employees||[]).map(x=>x.role).filter(Boolean) as string[])).sort(),[d.employees]);
  const branches=useMemo(()=>Array.from(new Set((d.employees||[]).map(x=>x.branchId).filter(Boolean) as string[])).sort(),[d.employees]);

  function isOnLeave(employeeId:string){
    const now=Date.now();
    return (d.leave||[]).some((x:any)=>x.employeeId===employeeId&&x.status!=='CANCELLED'&&new Date(x.startDate).getTime()<=now&&new Date(x.endDate).getTime()>=now);
  }
  function compliance(employeeId:string){
    const expired=(d.certifications||[]).filter((x:any)=>x.employeeId===employeeId&&x.expiryDate&&new Date(x.expiryDate).getTime()<Date.now());
    const overdue=(d.training||[]).filter((x:any)=>x.employeeId===employeeId&&x.status!=='COMPLETED'&&x.dueDate&&new Date(x.dueDate).getTime()<Date.now());
    return {expired,overdue,ok:!expired.length&&!overdue.length};
  }

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (d.employees||[]).filter(e=>{
      const u:any=utilizationMap.get(e.employeeId)||{};
      const onLeave=isOnLeave(e.employeeId);
      const qok=!q||[e.employeeId,e.name,e.email,e.role,e.branchId,e.department,(e.skills||[]).join(' ')].some(v=>String(v||'').toLowerCase().includes(q));
      const rok=roleFilter==='ALL'||e.role===roleFilter;
      const bok=branchFilter==='ALL'||e.branchId===branchFilter;
      const uok=utilFilter==='ALL'||String(u.status||'OK')===utilFilter;
      const aok=availabilityFilter==='ALL'||(availabilityFilter==='AVAILABLE'&&!onLeave)||(availabilityFilter==='ON_LEAVE'&&onLeave);
      return qok&&rok&&bok&&uok&&aok;
    });
  },[d.employees,d.leave,search,roleFilter,branchFilter,utilFilter,availabilityFilter,utilizationMap]);

  const selected=useMemo(()=>d.employees.find(x=>x.employeeId===selectedId)||null,[d.employees,selectedId]);
  const selectedUtil:any=selected?utilizationMap.get(selected.employeeId)||{}:{};
  const selectedCompliance=selected?compliance(selected.employeeId):{expired:[],overdue:[],ok:true};
  const employeeCerts=selected?(d.certifications||[]).filter((x:any)=>x.employeeId===selected.employeeId):[];
  const employeeTraining=selected?(d.training||[]).filter((x:any)=>x.employeeId===selected.employeeId):[];
  const employeeLeave=selected?(d.leave||[]).filter((x:any)=>x.employeeId===selected.employeeId):[];
  const employeeShifts=selected?(d.shifts||[]).filter((x:any)=>x.employeeId===selected.employeeId):[];
  const employeeAssignments=selected?(d.assignments||[]).filter((x:any)=>x.employeeId===selected.employeeId):[];

  useEffect(()=>{
    if(!selected)return;
    setEmployee({
      employeeId:selected.employeeId,
      name:selected.name||'',email:selected.email||'',role:selected.role||'OPERATIONS',
      branchId:selected.branchId||'',department:selected.department||'',
      capacityHoursPerWeek:Number(selected.capacityHoursPerWeek||40),
      skills:(selected.skills||[]).join(', '),active:selected.active!==false,notes:selected.notes||''
    });
    setNewMode(false);
  },[selectedId,selected?.updatedAt]);

  function openEmployee(id:string){
    setSelectedId(id);setNewMode(false);setTab('Details');setMsg('');
    history.replaceState(null,'',`/workforce?employee=${encodeURIComponent(id)}`);
  }
  function closeDetail(){
    setSelectedId('');setNewMode(false);setSuitability([]);history.replaceState(null,'','/workforce');
  }
  function startNew(){
    setSelectedId('');setNewMode(true);setEmployee(blankEmployee);setTab('Details');setMsg('');
    history.replaceState(null,'','/workforce?new=1');
  }

  async function post(path:string,body:any,ok:string){
    setBusy(true);setMsg('');
    try{
      const r=await api(path,token,{method:'POST',body:JSON.stringify(body)});
      setMsg(ok);await load();
      return r;
    }catch(e:any){setMsg(e?.message||'Action failed');return null;}
    finally{setBusy(false);}
  }

  async function saveEmployee(){
    const payload={...employee,skills:String(employee.skills||'').split(',').map((x:string)=>x.trim()).filter(Boolean)};
    const r=await post('/workforce/employees',payload,newMode?'Employee created':'Employee saved');
    if(r?.employeeId){setSelectedId(r.employeeId);setNewMode(false);history.replaceState(null,'',`/workforce?employee=${encodeURIComponent(r.employeeId)}`);}
  }

  async function saveCert(){
    if(!selected)return;
    const r=await post('/workforce/certifications',{...cert,employeeId:selected.employeeId},'Certification saved');
    if(r)setCert(blankCert);
  }
  async function saveTraining(){
    if(!selected)return;
    const r=await post('/workforce/training',{...training,employeeId:selected.employeeId},'Training requirement saved');
    if(r)setTraining(blankTraining);
  }
  async function saveLeave(){
    if(!selected)return;
    const r=await post('/workforce/leave',{...leave,employeeId:selected.employeeId},'Leave / availability saved');
    if(r)setLeave(blankLeave);
  }
  async function saveShift(){
    if(!selected)return;
    const r=await post('/workforce/shifts',{...shift,employeeId:selected.employeeId,startAt:shift.startAt?new Date(shift.startAt).toISOString():'',endAt:shift.endAt?new Date(shift.endAt).toISOString():''},'Shift saved');
    if(r)setShift(blankShift);
  }
  async function checkSuitability(bookingId:string){
    setAssignment((x:any)=>({...x,bookingId}));
    if(!bookingId){setSuitability([]);return;}
    try{setSuitability(await api(`/workforce/bookings/${bookingId}/suitability`,token));}
    catch(e:any){setMsg(e?.message||'Could not evaluate assignment suitability');}
  }
  async function saveAssignment(){
    if(!selected)return;
    const r=await post('/workforce/assignments',{
      ...assignment,employeeId:selected.employeeId,
      startAt:assignment.startAt?new Date(assignment.startAt).toISOString():undefined,
      endAt:assignment.endAt?new Date(assignment.endAt).toISOString():null
    },'Operational assignment saved');
    if(r){setAssignment(blankAssignment);setSuitability([]);}
  }

  const fld:React.CSSProperties={...fieldStyle};
  const lbl:React.CSSProperties={...labelStyle};
  const controlGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:4};

  const EmployeeForm=()=> <div className="workforce-detail-form">
    <div style={controlGrid}>
      <label><span style={lbl}>Employee ID</span><input style={fld} value={employee.employeeId||'Auto'} readOnly/></label>
      <label><span style={lbl}>Name *</span><input style={fld} value={employee.name||''} onChange={e=>setEmployee({...employee,name:e.target.value})}/></label>
      <label><span style={lbl}>E-Mail</span><input style={fld} value={employee.email||''} onChange={e=>setEmployee({...employee,email:e.target.value})}/></label>
      <label><span style={lbl}>Role</span><input style={fld} value={employee.role||''} onChange={e=>setEmployee({...employee,role:e.target.value})}/></label>
      <label><span style={lbl}>Branch</span><input style={fld} value={employee.branchId||''} onChange={e=>setEmployee({...employee,branchId:e.target.value})}/></label>
      <label><span style={lbl}>Department</span><input style={fld} value={employee.department||''} onChange={e=>setEmployee({...employee,department:e.target.value})}/></label>
      <label><span style={lbl}>Capacity hrs/week</span><input type="number" style={fld} value={employee.capacityHoursPerWeek||40} onChange={e=>setEmployee({...employee,capacityHoursPerWeek:Number(e.target.value)})}/></label>
      <label><span style={lbl}>Active</span><select style={fld} value={employee.active===false?'NO':'YES'} onChange={e=>setEmployee({...employee,active:e.target.value==='YES'})}><option>YES</option><option>NO</option></select></label>
      <label style={{gridColumn:'span 2'}}><span style={lbl}>Skills</span><input style={fld} value={employee.skills||''} onChange={e=>setEmployee({...employee,skills:e.target.value})} placeholder="DG, EXPORT, IMPORT, CUSTOMS"/></label>
    </div>
    <div className="workforce-detail-actions">
      <button className="btn" onClick={saveEmployee} disabled={busy}>{busy?'Saving...':newMode?'Create Employee':'Save Employee'}</button>
      <button className="btn" onClick={closeDetail}>Close</button>
    </div>
  </div>;

  const s=d.summary||{};

  return <WorkspaceShell
    title="Workforce / Resource Control"
    subtitle="One-screen people, skills, availability, capacity, compliance and operational assignment control"
    active="/workforce"
    actions={<><button className="btn" onClick={startNew}>+ New Resource</button><button className="btn" onClick={()=>void load()}>Refresh</button></>}
  >
    {msg&&<div className="card workforce-message">{msg}</div>}

    <div className="workforce-kpis">
      {[
        ['Active People',s.activeEmployees],['Expired Certs',s.expiredCerts],['Expiring 30d',s.expiringCerts],
        ['On Leave',s.activeLeave],['Overdue Training',s.overdueTraining],['Open Shifts',s.openShifts],['Overloaded',s.overloaded]
      ].map(([a,b])=><div className="card" key={String(a)}><span>{a}</span><b>{b||0}</b></div>)}
    </div>

    <section id="workforce-register" className="card workforce-register">
      <div className="workforce-register-head">
        <div><h3 style={{...sectionTitle,marginBottom:2}}>Resource Register</h3><div className="sub">Search, filter and open a resource without leaving this operational screen.</div></div>
        <div><button className="btn" onClick={()=>{setSearch('');setRoleFilter('ALL');setBranchFilter('ALL');setUtilFilter('ALL');setAvailabilityFilter('ALL');}}>Clear Filters</button> <span className="status">{visible.length} resources</span></div>
      </div>

      <div className="workforce-filter-grid">
        <input style={fld} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resource, skill, branch..."/>
        <select style={fld} value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="ALL">All roles</option>{roles.map(x=><option key={x}>{x}</option>)}</select>
        <select style={fld} value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="ALL">All branches</option>{branches.map(x=><option key={x}>{x}</option>)}</select>
        <select style={fld} value={utilFilter} onChange={e=>setUtilFilter(e.target.value)}><option value="ALL">All utilization</option><option>OK</option><option>HIGH</option><option>OVERLOADED</option></select>
        <select style={fld} value={availabilityFilter} onChange={e=>setAvailabilityFilter(e.target.value)}><option value="ALL">All availability</option><option value="AVAILABLE">Available</option><option value="ON_LEAVE">On Leave</option></select>
      </div>

      {selected||newMode
        ? <div className="workforce-inline-detail">
            <div className="workforce-detail-toolbar">
              <span>Resource Control</span>
              <button className="btn" onClick={closeDetail}>← Register</button>
            </div>

            {!newMode&&selected&&<div className="workforce-overview">
              <div className="workforce-party-grid">
                <div><span>Resource</span><b>{selected.name}</b><small>{selected.employeeId}</small></div>
                <div><span>Role / Department</span><b>{selected.role||'—'}</b><small>{selected.department||'—'}</small></div>
                <div><span>Branch / Skills</span><b>{selected.branchId||'GLOBAL'}</b><small>{(selected.skills||[]).join(', ')||'No skills recorded'}</small></div>
              </div>
              <aside className="workforce-control-rail">
                <div className="workforce-control-title">Resource Control</div>
                <div className="workforce-control-grid">
                  <div><span>Planned Hrs</span><b>{Number(selectedUtil.hours||0).toFixed(1)}</b></div>
                  <div><span>Capacity</span><b>{selectedUtil.capacity||selected.capacityHoursPerWeek||40}</b></div>
                  <div><span>Utilization</span><b>{Number(selectedUtil.utilizationPct||0).toFixed(0)}%</b></div>
                  <div><span>Load Status</span><b>{selectedUtil.status||'OK'}</b></div>
                  <div><span>Availability</span><b>{isOnLeave(selected.employeeId)?'ON LEAVE':'AVAILABLE'}</b></div>
                  <div><span>Compliance</span><b>{selectedCompliance.ok?'CLEAR':'ACTION'}</b></div>
                  <div><span>Assignments</span><b>{employeeAssignments.length}</b></div>
                  <div><span>Active</span><b>{selected.active===false?'NO':'YES'}</b></div>
                </div>
              </aside>
            </div>}

            <div className="workforce-tabs">
              {(['Details','Availability & Shifts','Certification & Training','Assignments','Notes'] as const).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}
            </div>

            {tab==='Details'&&<div className="card workforce-subform"><h3 style={sectionTitle}>{newMode?'New Resource':'Employee / Role Master'}</h3><EmployeeForm/></div>}

            {tab==='Availability & Shifts'&&selected&&<>
              <div className="workforce-two-col">
                <div className="card workforce-subform"><h3 style={sectionTitle}>Leave / Availability</h3>
                  <div style={controlGrid}>
                    <label><span style={lbl}>Type</span><input style={fld} value={leave.leaveType} onChange={e=>setLeave({...leave,leaveType:e.target.value})}/></label>
                    <label><span style={lbl}>From</span><input type="date" style={fld} value={leave.startDate} onChange={e=>setLeave({...leave,startDate:e.target.value})}/></label>
                    <label><span style={lbl}>To</span><input type="date" style={fld} value={leave.endDate} onChange={e=>setLeave({...leave,endDate:e.target.value})}/></label>
                    <label><span style={lbl}>Status</span><select style={fld} value={leave.status} onChange={e=>setLeave({...leave,status:e.target.value})}><option>APPROVED</option><option>PENDING</option><option>CANCELLED</option></select></label>
                    <label style={{gridColumn:'1/-1'}}><span style={lbl}>Notes</span><input style={fld} value={leave.notes} onChange={e=>setLeave({...leave,notes:e.target.value})}/></label>
                  </div><button className="btn" onClick={saveLeave} disabled={busy}>Save Leave</button>
                </div>
                <div className="card workforce-subform"><h3 style={sectionTitle}>Shift / Capacity Planning</h3>
                  <div style={controlGrid}>
                    <label><span style={lbl}>Start</span><input type="datetime-local" style={fld} value={shift.startAt} onChange={e=>setShift({...shift,startAt:e.target.value})}/></label>
                    <label><span style={lbl}>End</span><input type="datetime-local" style={fld} value={shift.endAt} onChange={e=>setShift({...shift,endAt:e.target.value})}/></label>
                    <label><span style={lbl}>Status</span><select style={fld} value={shift.status} onChange={e=>setShift({...shift,status:e.target.value})}><option>PLANNED</option><option>OPEN</option><option>CONFIRMED</option><option>COMPLETED</option><option>CANCELLED</option></select></label>
                    <label><span style={lbl}>Role Required</span><input style={fld} value={shift.roleRequired} onChange={e=>setShift({...shift,roleRequired:e.target.value})}/></label>
                    <label><span style={lbl}>Branch</span><input style={fld} value={shift.branchId} onChange={e=>setShift({...shift,branchId:e.target.value})}/></label>
                    <label><span style={lbl}>Notes</span><input style={fld} value={shift.notes} onChange={e=>setShift({...shift,notes:e.target.value})}/></label>
                  </div><button className="btn" onClick={saveShift} disabled={busy}>Save Shift</button>
                </div>
              </div>
              <div className="workforce-grid-pair">
                <div className="card"><h3 style={sectionTitle}>Leave Register</h3><div className="excel-grid-wrap"><table className="table"><thead><tr><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Notes</th></tr></thead><tbody>{employeeLeave.map((x:any)=><tr key={x.leaveId}><td>{x.leaveType}</td><td>{fmtDate(x.startDate)}</td><td>{fmtDate(x.endDate)}</td><td><span className="status">{x.status}</span></td><td>{x.notes||'—'}</td></tr>)}{!employeeLeave.length&&<tr><td colSpan={5}>No leave records.</td></tr>}</tbody></table></div></div>
                <div className="card"><h3 style={sectionTitle}>Shift Register</h3><div className="excel-grid-wrap"><table className="table"><thead><tr><th>Start</th><th>End</th><th>Hours</th><th>Status</th><th>Branch</th></tr></thead><tbody>{employeeShifts.map((x:any)=><tr key={x.shiftId}><td>{fmtDateTime(x.startAt)}</td><td>{fmtDateTime(x.endAt)}</td><td>{Number(x.hours||0).toFixed(1)}</td><td><span className="status">{x.status}</span></td><td>{x.branchId||'—'}</td></tr>)}{!employeeShifts.length&&<tr><td colSpan={5}>No shifts.</td></tr>}</tbody></table></div></div>
              </div>
            </>}

            {tab==='Certification & Training'&&selected&&<>
              <div className="workforce-two-col">
                <div className="card workforce-subform"><h3 style={sectionTitle}>Certification</h3><div style={controlGrid}>
                  <label><span style={lbl}>Certification *</span><input style={fld} value={cert.name} onChange={e=>setCert({...cert,name:e.target.value})}/></label>
                  <label><span style={lbl}>Certificate No.</span><input style={fld} value={cert.certificateNo} onChange={e=>setCert({...cert,certificateNo:e.target.value})}/></label>
                  <label><span style={lbl}>Issued</span><input type="date" style={fld} value={cert.issuedDate} onChange={e=>setCert({...cert,issuedDate:e.target.value})}/></label>
                  <label><span style={lbl}>Expiry</span><input type="date" style={fld} value={cert.expiryDate} onChange={e=>setCert({...cert,expiryDate:e.target.value})}/></label>
                  <label><span style={lbl}>Status</span><select style={fld} value={cert.status} onChange={e=>setCert({...cert,status:e.target.value})}><option>VALID</option><option>SUSPENDED</option><option>EXPIRED</option></select></label>
                </div><button className="btn" onClick={saveCert} disabled={busy}>Save Certification</button></div>
                <div className="card workforce-subform"><h3 style={sectionTitle}>Training</h3><div style={controlGrid}>
                  <label><span style={lbl}>Course *</span><input style={fld} value={training.course} onChange={e=>setTraining({...training,course:e.target.value})}/></label>
                  <label><span style={lbl}>Due</span><input type="date" style={fld} value={training.dueDate} onChange={e=>setTraining({...training,dueDate:e.target.value})}/></label>
                  <label><span style={lbl}>Completed</span><input type="date" style={fld} value={training.completedAt} onChange={e=>setTraining({...training,completedAt:e.target.value})}/></label>
                  <label><span style={lbl}>Required</span><select style={fld} value={training.required?'YES':'NO'} onChange={e=>setTraining({...training,required:e.target.value==='YES'})}><option>YES</option><option>NO</option></select></label>
                  <label><span style={lbl}>Status</span><select style={fld} value={training.status} onChange={e=>setTraining({...training,status:e.target.value})}><option>PENDING</option><option>COMPLETED</option><option>WAIVED</option></select></label>
                </div><button className="btn" onClick={saveTraining} disabled={busy}>Save Training</button></div>
              </div>
              <div className="workforce-grid-pair">
                <div className="card"><h3 style={sectionTitle}>Certification Register</h3><div className="excel-grid-wrap"><table className="table"><thead><tr><th>Certification</th><th>No.</th><th>Issued</th><th>Expiry</th><th>Status</th></tr></thead><tbody>{employeeCerts.map((x:any)=><tr key={x.certificationId}><td>{x.name}</td><td>{x.certificateNo||'—'}</td><td>{fmtDate(x.issuedDate)}</td><td>{fmtDate(x.expiryDate)}</td><td><span className="status">{x.status}</span></td></tr>)}{!employeeCerts.length&&<tr><td colSpan={5}>No certifications.</td></tr>}</tbody></table></div></div>
                <div className="card"><h3 style={sectionTitle}>Training Register</h3><div className="excel-grid-wrap"><table className="table"><thead><tr><th>Course</th><th>Required</th><th>Due</th><th>Completed</th><th>Status</th></tr></thead><tbody>{employeeTraining.map((x:any)=><tr key={x.trainingId}><td>{x.course}</td><td>{x.required===false?'No':'Yes'}</td><td>{fmtDate(x.dueDate)}</td><td>{fmtDate(x.completedAt)}</td><td><span className="status">{x.status}</span></td></tr>)}{!employeeTraining.length&&<tr><td colSpan={5}>No training records.</td></tr>}</tbody></table></div></div>
              </div>
            </>}

            {tab==='Assignments'&&selected&&<>
              <div className="card workforce-subform"><h3 style={sectionTitle}>Operational Assignment / Booking Suitability</h3>
                <div style={controlGrid}>
                  <label><span style={lbl}>Booking</span><select style={fld} value={assignment.bookingId} onChange={e=>void checkSuitability(e.target.value)}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin||'—'} → {b.destination||'—'}</option>)}</select></label>
                  <label><span style={lbl}>Assignment Role</span><input style={fld} value={assignment.assignmentRole} onChange={e=>setAssignment({...assignment,assignmentRole:e.target.value})}/></label>
                  <label><span style={lbl}>Start</span><input type="datetime-local" style={fld} value={assignment.startAt} onChange={e=>setAssignment({...assignment,startAt:e.target.value})}/></label>
                  <label><span style={lbl}>End</span><input type="datetime-local" style={fld} value={assignment.endAt} onChange={e=>setAssignment({...assignment,endAt:e.target.value})}/></label>
                  <label><span style={lbl}>Status</span><select style={fld} value={assignment.status} onChange={e=>setAssignment({...assignment,status:e.target.value})}><option>ASSIGNED</option><option>ACTIVE</option><option>COMPLETED</option><option>CANCELLED</option></select></label>
                  <label><span style={lbl}>Notes</span><input style={fld} value={assignment.notes} onChange={e=>setAssignment({...assignment,notes:e.target.value})}/></label>
                </div>
                {assignment.bookingId&&<div className="workforce-suitability">{(()=>{const c=suitability.find((x:any)=>x.employeeId===selected.employeeId);return c?<><span className={c.suitable?'status':'status'}>{c.suitable?'SUITABLE':'BLOCKED'}</span><b>{c.suitable?'Resource passes assignment checks.':c.blockers.join(' · ')}</b></>:<span className="sub">Checking suitability...</span>;})()}</div>}
                <button className="btn" onClick={saveAssignment} disabled={busy||!assignment.bookingId||Boolean(suitability.find((x:any)=>x.employeeId===selected.employeeId&&!x.suitable))}>Assign Resource</button>
              </div>
              <div className="card"><h3 style={sectionTitle}>Assignment Register</h3><div className="excel-grid-wrap"><table className="table"><thead><tr><th>Booking</th><th>Role</th><th>Start</th><th>End</th><th>Status</th><th>Notes</th></tr></thead><tbody>{employeeAssignments.map((x:any)=><tr key={x.assignmentId}><td>{bookings.find(b=>b.id===x.bookingId)?.bookingNo||x.bookingId}</td><td>{x.assignmentRole}</td><td>{fmtDateTime(x.startAt)}</td><td>{fmtDateTime(x.endAt)}</td><td><span className="status">{x.status}</span></td><td>{x.notes||'—'}</td></tr>)}{!employeeAssignments.length&&<tr><td colSpan={6}>No booking assignments.</td></tr>}</tbody></table></div></div>
            </>}

            {tab==='Notes'&&selected&&<div className="card workforce-subform"><h3 style={sectionTitle}>Resource Notes</h3>
              <textarea style={{...fld,minHeight:120,resize:'vertical'}} value={employee.notes||''} onChange={e=>setEmployee({...employee,notes:e.target.value})}/>
              <div className="workforce-detail-actions"><button className="btn" onClick={saveEmployee} disabled={busy}>Save Notes</button></div>
              <div className="workforce-alert-grids">
                <div><h4>Compliance Exceptions</h4>{selectedCompliance.expired.map((x:any)=><div key={x.certificationId}>Expired certification: <b>{x.name}</b> · {fmtDate(x.expiryDate)}</div>)}{selectedCompliance.overdue.map((x:any)=><div key={x.trainingId}>Overdue training: <b>{x.course}</b> · {fmtDate(x.dueDate)}</div>)}{selectedCompliance.ok&&<div>No compliance exceptions.</div>}</div>
                <div><h4>Current Availability</h4><div>{isOnLeave(selected.employeeId)?'Resource is currently on approved leave.':'Resource is currently available.'}</div></div>
              </div>
            </div>}
          </div>
        : <div className="excel-grid-wrap workforce-register-grid">
            <table className="table"><thead><tr><th>Employee</th><th>Role</th><th>Department</th><th>Branch</th><th>Skills</th><th>Availability</th><th>Planned Hrs</th><th>Capacity</th><th>Utilization</th><th>Compliance</th><th>Assignments</th><th></th></tr></thead>
              <tbody>{visible.map(e=>{const u:any=utilizationMap.get(e.employeeId)||{};const c=compliance(e.employeeId);const asn=(d.assignments||[]).filter((x:any)=>x.employeeId===e.employeeId).length;return <tr key={e.employeeId}>
                <td><button className="workforce-link" onClick={()=>openEmployee(e.employeeId)}><b>{e.name}</b></button><div className="sub">{e.employeeId}</div></td>
                <td>{e.role||'—'}</td><td>{e.department||'—'}</td><td>{e.branchId||'GLOBAL'}</td><td>{(e.skills||[]).join(', ')||'—'}</td>
                <td><span className="status">{isOnLeave(e.employeeId)?'ON LEAVE':'AVAILABLE'}</span></td>
                <td>{Number(u.hours||0).toFixed(1)}</td><td>{u.capacity||e.capacityHoursPerWeek||40}</td><td>{Number(u.utilizationPct||0).toFixed(0)}% · {u.status||'OK'}</td>
                <td><span className="status">{c.ok?'CLEAR':'ACTION'}</span></td><td>{asn}</td><td><button className="btn" onClick={()=>openEmployee(e.employeeId)}>Open</button></td>
              </tr>})}{!visible.length&&<tr><td colSpan={12}>No resources found.</td></tr>}</tbody>
            </table>
          </div>}
    </section>
  </WorkspaceShell>;
}
