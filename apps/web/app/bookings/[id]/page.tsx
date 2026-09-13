'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type Org={id:string;code:string;name:string;roles:string[]};
type Container={id:string;containerNo:string;type:string;ownership:string;status:string;location?:string};
type Booking={
  id:string;bookingNo:string;customerId:string;producingAgentId?:string|null;bookingType?:string|null;transportMode?:string|null;serviceType?:string|null;
  shipper?:string|null;consignee?:string|null;notifyParty?:string|null;origin:string;destination:string;placeOfReceipt?:string|null;portOfLoading?:string|null;
  portOfDischarge?:string|null;placeOfDelivery?:string|null;polAgent?:string|null;podAgent?:string|null;etd?:string|null;eta?:string|null;carrier?:string|null;
  vesselVoyage?:string|null;equipment?:string|null;quantity?:number|null;containerOwner?:string|null;throughBL?:string|null;commodity?:string|null;cargoDescription?:string|null;
  incoterm?:string|null;currency:string;specialCargo?:string|null;notes?:string|null;status:string;creditStatus?:string|null;slotStatus?:string|null;equipmentStatus?:string|null;
  customer?:{name:string};producingAgent?:{name:string};containers:Container[];documents:any[];financeLines:any[];tasks:any[];approvals:any[];auditEvents:any[];
};

const blank={
  bookingNo:'',customerId:'',producingAgentId:'',bookingType:'FCL',transportMode:'SEA',serviceType:'CY/CY',shipper:'',consignee:'',notifyParty:'',
  origin:'',destination:'',placeOfReceipt:'',portOfLoading:'',portOfDischarge:'',placeOfDelivery:'',polAgent:'',podAgent:'',etd:'',eta:'',carrier:'',vesselVoyage:'',
  equipment:'40HC',quantity:'1',containerOwner:'CARRIER',throughBL:'',commodity:'',cargoDescription:'',incoterm:'',currency:'USD',specialCargo:'',notes:'',
  creditStatus:'',slotStatus:'',equipmentStatus:''
};

function dateInput(v?:string|null){return v?new Date(v).toISOString().slice(0,10):'';}

export default function EditBookingPage(){
  const params=useParams<{id:string}>();
  const id=String(params?.id||'');
  const [token,setToken]=useState('');
  const [booking,setBooking]=useState<Booking|null>(null);
  const [form,setForm]=useState(blank);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [container,setContainer]=useState({containerNo:'',type:'40HC',ownership:'CARRIER',status:'PLANNED',location:''});

  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')),[orgs]);
  const agents=useMemo(()=>orgs.filter(o=>o.roles?.includes('AGENT')),[orgs]);

  useEffect(()=>{
    const t=localStorage.getItem('ancline_token')||'';
    if(!t){location.href='/login';return;}
    setToken(t);void load(t);
  },[id]);

  async function req(path:string,init:RequestInit={},t=token){
    const headers=new Headers(init.headers);headers.set('content-type','application/json');if(t)headers.set('authorization',`Bearer ${t}`);
    const r=await fetch(`${API}${path}`,{...init,headers,cache:'no-store'});const text=await r.text();let data:any={};
    try{data=text?JSON.parse(text):{};}catch{data={message:text};}if(!r.ok)throw new Error(data?.message||`${r.status} ${r.statusText}`);return data;
  }

  async function load(t=token){
    if(!id)return;
    try{
      const [b,o]=await Promise.all([req(`/bookings/${id}`,{},t),fetch(`${API}/organizations`,{cache:'no-store'}).then(r=>r.json()).catch(()=>[])]);
      setBooking(b);setOrgs(Array.isArray(o)?o:[]);
      setForm({
        bookingNo:b.bookingNo||'',customerId:b.customerId||'',producingAgentId:b.producingAgentId||'',bookingType:b.bookingType||'FCL',transportMode:b.transportMode||'SEA',serviceType:b.serviceType||'CY/CY',
        shipper:b.shipper||'',consignee:b.consignee||'',notifyParty:b.notifyParty||'',origin:b.origin||'',destination:b.destination||'',placeOfReceipt:b.placeOfReceipt||'',
        portOfLoading:b.portOfLoading||'',portOfDischarge:b.portOfDischarge||'',placeOfDelivery:b.placeOfDelivery||'',polAgent:b.polAgent||'',podAgent:b.podAgent||'',
        etd:dateInput(b.etd),eta:dateInput(b.eta),carrier:b.carrier||'',vesselVoyage:b.vesselVoyage||'',equipment:b.equipment||'40HC',quantity:String(b.quantity||1),
        containerOwner:b.containerOwner||'CARRIER',throughBL:b.throughBL||'',commodity:b.commodity||'',cargoDescription:b.cargoDescription||'',incoterm:b.incoterm||'',
        currency:b.currency||'USD',specialCargo:b.specialCargo||'',notes:b.notes||'',creditStatus:b.creditStatus||'',slotStatus:b.slotStatus||'',equipmentStatus:b.equipmentStatus||''
      });
    }catch(e:any){setMessage(e?.message||'Unable to load booking');}
  }

  function set(k:keyof typeof blank,v:string){setForm(x=>({...x,[k]:v}));}

  async function save(){
    if(!form.origin.trim()||!form.destination.trim()){setMessage('Origin and Destination are required.');return;}
    setBusy(true);setMessage('');
    try{
      await req(`/bookings/${id}`,{method:'PATCH',body:JSON.stringify({
        ...form,
        producingAgentId:form.producingAgentId||null,
        etd:form.etd?new Date(`${form.etd}T00:00:00Z`).toISOString():null,
        eta:form.eta?new Date(`${form.eta}T00:00:00Z`).toISOString():null,
        quantity:form.quantity?Number(form.quantity):null
      })});
      setMessage('Booking changes saved successfully.');await load();
    }catch(e:any){setMessage(e?.message||'Could not save booking');}finally{setBusy(false);}
  }

  async function advance(){
    setBusy(true);setMessage('');try{await req(`/bookings/${id}/advance`,{method:'POST'});setMessage('Booking workflow advanced.');await load();}catch(e:any){setMessage(e?.message||'Could not advance workflow');}finally{setBusy(false);}
  }

  async function addContainer(){
    if(!container.containerNo.trim()){setMessage('Enter a container number first.');return;}
    setBusy(true);setMessage('');try{await req(`/bookings/${id}/containers`,{method:'POST',body:JSON.stringify(container)});setContainer({containerNo:'',type:'40HC',ownership:'CARRIER',status:'PLANNED',location:''});setMessage('Container added.');await load();}catch(e:any){setMessage(e?.message||'Could not add container');}finally{setBusy(false);}
  }

  async function removeContainer(containerId:string){
    if(!confirm('Remove this container from the booking?'))return;
    setBusy(true);try{await req(`/bookings/${id}/containers/${containerId}`,{method:'DELETE'});await load();}catch(e:any){setMessage(e?.message||'Could not remove container');}finally{setBusy(false);}
  }

  function signOut(){localStorage.removeItem('ancline_token');localStorage.removeItem('ancline_user');location.href='/login';}

  const field:React.CSSProperties={width:'100%',padding:'8px 9px',border:'1px solid #cfd9e2',borderRadius:6,background:'#fff',minHeight:36};
  const label:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};
  const title:React.CSSProperties={fontSize:14,fontWeight:800,color:'#153a5d',margin:'0 0 12px',paddingBottom:8,borderBottom:'1px solid #e2e8ee'};
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12};
  const Input=({l,k,type='text',ph=''}:{l:string;k:keyof typeof blank;type?:string;ph?:string})=><label><span style={label}>{l}</span><input type={type} value={form[k]} placeholder={ph} onChange={e=>set(k,e.target.value)} style={field}/></label>;
  const Select=({l,k,children}:{l:string;k:keyof typeof blank;children:React.ReactNode})=><label><span style={label}>{l}</span><select value={form[k]} onChange={e=>set(k,e.target.value)} style={field}>{children}</select></label>;

  if(!booking)return <div className="shell"><aside className="side"><div className="brand">ANCLINE WORLDWIDE</div></aside><main className="main"><div className="card">{message||'Loading booking...'}</div></main></div>;

  return <div className="shell">
    <aside className="side">
      <div className="brand">ANCLINE WORLDWIDE</div><a href="/">Control Tower</a><a href="/bookings" style={{background:'#183a5c'}}>Bookings</a><a href="/organizations">Organizations</a><a href="/rates">Rates / Quotes</a><a href="/documents">Documents</a><a href="/finance">Finance</a><a href="/approvals">Approvals</a><a href="/tasks">My Work</a>
    </aside>
    <main className="main">
      <div className="top">
        <div><div className="sub">BOOKING WORKSPACE</div><h1 style={{margin:'2px 0'}}>{booking.bookingNo}</h1><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><span className="status">{booking.status}</span><span className="status">Containers: {booking.containers?.length||0}</span><span className="status">Docs: {booking.documents?.length||0}</span><span className="status">Finance: {booking.financeLines?.length||0}</span><span className="status">Tasks: {booking.tasks?.length||0}</span></div></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a className="btn" href="/bookings" style={{textDecoration:'none'}}>← Booking Register</a><button className="btn" onClick={save} disabled={busy}>{busy?'Working...':'Save Changes'}</button><button className="btn" onClick={advance} disabled={busy}>Advance Status</button><button className="btn" onClick={signOut}>Sign out</button></div>
      </div>

      {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Booking Details</h3><div style={grid}>
        <Input l="Booking No." k="bookingNo"/><Select l="Booking Type" k="bookingType"><option>FCL</option><option>LCL</option><option>BREAKBULK</option><option>RORO</option></Select><Select l="Transport Mode" k="transportMode"><option>SEA</option><option>AIR</option><option>ROAD</option><option>RAIL</option></Select><Select l="Service Type" k="serviceType"><option>CY/CY</option><option>DOOR/CY</option><option>CY/DOOR</option><option>DOOR/DOOR</option></Select><Select l="Currency" k="currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></Select><Input l="Incoterm" k="incoterm"/>
      </div></div>

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Customer & Parties</h3><div style={grid}>
        <label><span style={label}>Customer</span><select value={form.customerId} onChange={e=>set('customerId',e.target.value)} style={field}>{customers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label><Input l="Shipper" k="shipper"/><Input l="Consignee" k="consignee"/><Input l="Notify Party" k="notifyParty"/><label><span style={label}>Producing Agent</span><select value={form.producingAgentId} onChange={e=>set('producingAgentId',e.target.value)} style={field}><option value="">-- Optional --</option>{agents.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
      </div></div>

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Routing & Agents</h3><div style={grid}>
        <Input l="Origin" k="origin"/><Input l="POL Agent" k="polAgent"/><Input l="Port of Loading (POL)" k="portOfLoading"/><Input l="Place of Receipt" k="placeOfReceipt"/><Input l="Destination" k="destination"/><Input l="POD Agent" k="podAgent"/><Input l="Port of Discharge (POD)" k="portOfDischarge"/><Input l="Place of Delivery" k="placeOfDelivery"/>
      </div></div>

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Carrier / Vessel / Schedule</h3><div style={grid}>
        <Input l="Carrier" k="carrier"/><Input l="Vessel / Voyage" k="vesselVoyage"/><Input l="ETD" k="etd" type="date"/><Input l="ETA" k="eta" type="date"/><Input l="Through B/L" k="throughBL"/>
      </div></div>

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Equipment & Cargo</h3><div style={grid}>
        <Select l="Equipment" k="equipment"><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option><option>20OT</option><option>40OT</option><option>20FR</option><option>40FR</option></Select><Input l="Quantity" k="quantity" type="number"/><Select l="Container Owner" k="containerOwner"><option>CARRIER</option><option>SHIPPER</option><option>ANCLINE</option><option>SOC</option></Select><Input l="Commodity" k="commodity"/><Input l="Special Cargo" k="specialCargo"/><Input l="Cargo Description" k="cargoDescription"/>
      </div></div>

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Operational Controls</h3><div style={grid}>
        <Select l="Credit Status" k="creditStatus"><option value="">Not checked</option><option>Pending</option><option>Passed</option><option>Blocked</option></Select><Select l="Slot Status" k="slotStatus"><option value="">Not checked</option><option>Pending</option><option>Protected</option><option>Waitlist</option></Select><Select l="Equipment Status" k="equipmentStatus"><option value="">Not checked</option><option>Pending</option><option>Available</option><option>Shortage</option></Select>
      </div></div>

      <div className="card" style={{marginBottom:12}}><h3 style={title}>Containers</h3>
        <div style={{...grid,marginBottom:12}}>
          <label><span style={label}>Container No.</span><input value={container.containerNo} onChange={e=>setContainer(v=>({...v,containerNo:e.target.value}))} style={field} placeholder="ABCD1234567"/></label>
          <label><span style={label}>Type</span><select value={container.type} onChange={e=>setContainer(v=>({...v,type:e.target.value}))} style={field}><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option></select></label>
          <label><span style={label}>Ownership</span><select value={container.ownership} onChange={e=>setContainer(v=>({...v,ownership:e.target.value}))} style={field}><option>CARRIER</option><option>SHIPPER</option><option>ANCLINE</option><option>SOC</option></select></label>
          <label><span style={label}>Status</span><select value={container.status} onChange={e=>setContainer(v=>({...v,status:e.target.value}))} style={field}><option>PLANNED</option><option>RELEASED</option><option>PICKED_UP</option><option>GATE_IN</option><option>LOADED</option><option>DISCHARGED</option><option>DELIVERED</option><option>EMPTY_RETURNED</option></select></label>
          <label><span style={label}>Location</span><input value={container.location} onChange={e=>setContainer(v=>({...v,location:e.target.value}))} style={field}/></label>
          <div style={{display:'flex',alignItems:'end'}}><button className="btn" onClick={addContainer} disabled={busy}>+ Add Container</button></div>
        </div>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Container No.</th><th>Type</th><th>Owner</th><th>Status</th><th>Location</th><th></th></tr></thead><tbody>{booking.containers?.length?<>{booking.containers.map(c=><tr key={c.id}><td><b>{c.containerNo}</b></td><td>{c.type}</td><td>{c.ownership}</td><td><span className="status">{c.status}</span></td><td>{c.location||'-'}</td><td><button className="btn" onClick={()=>removeContainer(c.id)} disabled={busy}>Remove</button></td></tr>)}</>:<tr><td colSpan={6}>No containers linked yet.</td></tr>}</tbody></table></div>
      </div>

      <div className="card" style={{marginBottom:14}}><h3 style={title}>Operational Notes</h3><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} style={{...field,minHeight:90,resize:'vertical'}}/><div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn" onClick={save} disabled={busy}>Save Changes</button></div></div>
    </main>
  </div>;
}
