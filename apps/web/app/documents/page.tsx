'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import JobContextRail from '../../components/JobContextRail';
import JobFlowNav from '../../components/JobFlowNav';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;status:string;shipper?:string;consignee?:string;notifyParty?:string;carrier?:string;vesselVoyage?:string;portOfLoading?:string;portOfDischarge?:string;houseBL?:string;masterBL?:string;commodity?:string;packageCount?:number;packageType?:string;grossWeight?:number;volumeCbm?:number;marksNumbers?:string;cargoDescription?:string;customer?:{name:string};containers?:Array<{containerNo:string;type:string;sealNo?:string}>;routingLegs?:Array<{sequence:number;legType:string;origin:string;destination:string;vessel?:string;voyage?:string;etd?:string;eta?:string}>};
type Doc={id:string;documentNo:string;bookingId:string;type:string;version:number;status:string;releaseControl?:string;createdAt?:string;updatedAt?:string;booking?:Booking};

const types=['SEA_WAYBILL','HOUSE_BL','MASTER_BL','BOOKING_CONFIRMATION','SHIPPING_INSTRUCTION','VGM','ARRIVAL_NOTICE','DELIVERY_ORDER','INVOICE','PACKING_LIST'];
const holds=['Clear','Hold - Finance','Hold - Documentation','Hold - Approval'];

export default function DocumentsPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [rows,setRows]=useState<Doc[]>([]);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [rejectReason,setRejectReason]=useState('');
  const [form,setForm]=useState({bookingId:'',documentNo:'',type:'HOUSE_BL',status:'Draft',releaseControl:'Clear'});

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){try{const [d,b]=await Promise.all([api('/documents',t),api('/bookings',t)]);const docs=Array.isArray(d)?d:[];const bookingRows=Array.isArray(b)?b:[];setRows(docs);setBookings(bookingRows);const contextId=new URLSearchParams(location.search).get('bookingId')||'';if(contextId){setForm(x=>({...x,bookingId:contextId}));const match=docs.find((x:Doc)=>x.bookingId===contextId);if(match)setSelectedId(match.id);const booking=bookingRows.find((x:Booking)=>x.id===contextId);if(booking)setSearch(booking.bookingNo);}else if(!selectedId&&docs[0])setSelectedId(docs[0].id);}catch(e:any){setMessage(e.message||'Unable to load documents');}}
  const visible=useMemo(()=>{const q=search.toLowerCase().trim();return rows.filter(d=>!q||[d.documentNo,d.type,d.status,d.releaseControl,d.booking?.bookingNo,d.booking?.origin,d.booking?.destination,d.booking?.customer?.name].some(v=>String(v||'').toLowerCase().includes(q)));},[rows,search]);
  const selected=rows.find(r=>r.id===selectedId);
  const selectedBooking=selected?.booking;
  const pending=rows.filter(r=>r.status==='Pending Review').length;
  const approved=rows.filter(r=>r.status==='Approved').length;
  const released=rows.filter(r=>r.status==='Released').length;
  const held=rows.filter(r=>r.releaseControl&&r.releaseControl!=='Clear').length;

  async function createDoc(){
    if(!form.bookingId){setMessage('Select a booking first.');return;}
    const no=form.documentNo.trim()||`${form.type==='HOUSE_BL'?'HBL':form.type==='MASTER_BL'?'MBL':'DOC'}-${Date.now().toString().slice(-8)}`;
    setBusy('create');setMessage('');
    try{const d=await api('/documents',token,{method:'POST',body:JSON.stringify({...form,documentNo:no})});setMessage(`Document ${no} created.`);setSelectedId(d.id);setForm({...form,documentNo:''});await load();}
    catch(e:any){setMessage(e.message||'Document could not be created.');}finally{setBusy('');}
  }

  async function action(id:string,path:string,label:string,body?:any){
    setBusy(`${id}:${path}`);setMessage('');
    try{await api(`/documents/${id}/${path}`,token,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});setMessage(label);setRejectReason('');await load();}
    catch(e:any){setMessage(e.message||'Document action failed.');}finally{setBusy('');}
  }
  async function changeHold(d:Doc,value:string){
    setBusy(`${d.id}:hold`);setMessage('');
    try{await api(`/documents/${d.id}`,token,{method:'PATCH',body:JSON.stringify({releaseControl:value})});setMessage('Release control updated.');await load();}
    catch(e:any){setMessage(e.message||'Release control update failed.');}finally{setBusy('');}
  }

  return <WorkspaceShell title="B/L & Document Control" subtitle="House B/L, Master B/L, review, approval, amendments and release control" active="/documents" actions={<button className="btn" onClick={()=>void load()}>Refresh</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {form.bookingId&&<JobFlowNav
      bookingId={form.bookingId}
      bookingNo={bookings.find(b=>b.id===form.bookingId)?.bookingNo}
      active="DOCUMENTS"
    />}
    {form.bookingId&&<JobContextRail
      bookingId={form.bookingId}
      bookingNo={bookings.find(b=>b.id===form.bookingId)?.bookingNo}
      active="DOCUMENTS"
      customer={bookings.find(b=>b.id===form.bookingId)?.customer?.name||''}
      route={(()=>{const b=bookings.find(x=>x.id===form.bookingId);return b?`${b.origin} → ${b.destination}`:''})()}
      carrier={bookings.find(b=>b.id===form.bookingId)?.carrier||''}
      vessel={bookings.find(b=>b.id===form.bookingId)?.vesselVoyage||''}
      status={bookings.find(b=>b.id===form.bookingId)?.status||''}
    />}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:12}}>
      {[['Documents',rows.length],['Pending Review',pending],['Approved',approved],['Released',released],['On Hold',held]].map(([k,v])=><div className="card" key={String(k)}><div className="sub">{k}</div><div style={{fontSize:24,fontWeight:800}}>{v}</div></div>)}
    </div>

    <div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Create Shipping Document / B/L</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking *</span><select style={fieldStyle} value={form.bookingId} onChange={e=>setForm({...form,bookingId:e.target.value})}><option value="">Select booking</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} · {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Document Type</span><select style={fieldStyle} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{types.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Document / B/L No.</span><input style={fieldStyle} value={form.documentNo} onChange={e=>setForm({...form,documentNo:e.target.value})} placeholder="Auto if blank"/></label>
      <label><span style={labelStyle}>Release Control</span><select style={fieldStyle} value={form.releaseControl} onChange={e=>setForm({...form,releaseControl:e.target.value})}>{holds.map(x=><option key={x}>{x}</option>)}</select></label>
    </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" disabled={busy==='create'} onClick={createDoc}>{busy==='create'?'Saving…':'Create Draft'}</button></div></div>

    <div className="card" style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}><h3 style={{...sectionTitle,margin:0,flex:1}}>Document Register</h3><input style={{...fieldStyle,maxWidth:390}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search B/L, booking, customer, route or status"/></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Document</th><th>Booking</th><th>Type</th><th>Version</th><th>Status</th><th>Release Control</th><th>Updated</th><th>Workflow</th></tr></thead><tbody>
      {visible.map(d=><tr key={d.id} onClick={()=>setSelectedId(d.id)} style={{cursor:'pointer',background:selectedId===d.id?'#f4f8fb':undefined}}><td><b>{d.documentNo}</b><div className="sub">{d.booking?.customer?.name||''}</div></td><td><a href={`/bookings/${d.bookingId}`} style={{fontWeight:800,color:'#123b61'}}>{d.booking?.bookingNo||d.bookingId}</a><div className="sub">{d.booking?`${d.booking.origin} → ${d.booking.destination}`:''}</div></td><td>{d.type}</td><td>v{d.version||1}</td><td><span className="status">{d.status}</span></td><td onClick={e=>e.stopPropagation()}><select style={{...fieldStyle,minWidth:155}} value={d.releaseControl||'Clear'} disabled={busy.startsWith(d.id)} onChange={e=>void changeHold(d,e.target.value)}>{holds.map(x=><option key={x}>{x}</option>)}</select></td><td>{fmtDate(d.updatedAt||d.createdAt)}</td><td onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {['Draft','Amended','Rejected'].includes(d.status)&&<button className="btn" disabled={busy.startsWith(d.id)} onClick={()=>void action(d.id,'submit-review','Document submitted for review.')}>Submit Review</button>}
        {d.status==='Pending Review'&&<><button className="btn" disabled={busy.startsWith(d.id)} onClick={()=>void action(d.id,'approve','Document approved.')}>Approve</button><button className="btn" disabled={busy.startsWith(d.id)} onClick={()=>{const reason=window.prompt('Rejection reason',rejectReason)||'';if(reason)void action(d.id,'reject','Document rejected.',{reason});}}>Reject</button></>}
        {d.status==='Approved'&&<button className="btn" disabled={busy.startsWith(d.id)||Boolean(d.releaseControl&&d.releaseControl!=='Clear')} onClick={()=>void action(d.id,'release','Document released successfully.')}>Release</button>}
        {['Approved','Released','Rejected'].includes(d.status)&&<button className="btn" disabled={busy.startsWith(d.id)} onClick={()=>void action(d.id,'amend','New document version opened for amendment.')}>Amend</button>}
      </div></td></tr>)}
      {visible.length===0&&<tr><td colSpan={8}>No documents found.</td></tr>}
    </tbody></table></div></div>

    {selected&&<div className="card"><h3 style={sectionTitle}>B/L Shipment Data Preview · {selected.documentNo} · v{selected.version}</h3><div style={formGrid}>
      <Info label="Booking" value={selectedBooking?.bookingNo}/><Info label="Customer" value={selectedBooking?.customer?.name}/><Info label="Shipper" value={selectedBooking?.shipper}/><Info label="Consignee" value={selectedBooking?.consignee}/><Info label="Notify Party" value={selectedBooking?.notifyParty}/><Info label="Carrier" value={selectedBooking?.carrier}/><Info label="Vessel / Voyage" value={selectedBooking?.vesselVoyage}/><Info label="POL" value={selectedBooking?.portOfLoading||selectedBooking?.origin}/><Info label="POD" value={selectedBooking?.portOfDischarge||selectedBooking?.destination}/><Info label="HBL" value={selectedBooking?.houseBL}/><Info label="MBL" value={selectedBooking?.masterBL}/><Info label="Commodity" value={selectedBooking?.commodity}/><Info label="Packages" value={[selectedBooking?.packageCount,selectedBooking?.packageType].filter(Boolean).join(' ')}/><Info label="Gross Weight" value={selectedBooking?.grossWeight?`${selectedBooking.grossWeight} kg`:undefined}/><Info label="Volume" value={selectedBooking?.volumeCbm?`${selectedBooking.volumeCbm} CBM`:undefined}/><Info label="Containers" value={selectedBooking?.containers?.map(c=>`${c.containerNo} ${c.type}${c.sealNo?` / Seal ${c.sealNo}`:''}`).join(', ')}/>
    </div>{selectedBooking?.cargoDescription&&<div style={{marginTop:12}}><span style={labelStyle}>Cargo Description</span><div>{selectedBooking.cargoDescription}</div></div>}{selectedBooking?.marksNumbers&&<div style={{marginTop:12}}><span style={labelStyle}>Marks & Numbers</span><div>{selectedBooking.marksNumbers}</div></div>}</div>}
  </WorkspaceShell>;
}

function Info({label,value}:{label:string;value:any}){return <div><span style={labelStyle}>{label}</span><div style={{minHeight:36,padding:'8px 9px',border:'1px solid #e2e8ee',borderRadius:6,background:'#fafcfd'}}>{value||'-'}</div></div>}
