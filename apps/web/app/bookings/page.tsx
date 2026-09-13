'use client';

import { useEffect, useMemo, useState } from 'react';

const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000/api';
type Org={id:string;code:string;name:string;roles:string[]};
type Booking={id:string;bookingNo:string;status:string;origin:string;destination:string;carrier?:string;vesselVoyage?:string;equipment?:string;etd?:string;eta?:string;customer?:{name:string}};

const initialForm={bookingNo:'',customerId:'',customerName:'',producingAgentId:'',bookingType:'FCL',transportMode:'SEA',serviceType:'CY/CY',shipper:'',consignee:'',notifyParty:'',origin:'',destination:'',placeOfReceipt:'',portOfLoading:'',portOfDischarge:'',placeOfDelivery:'',polAgent:'',podAgent:'',carrier:'',vesselVoyage:'',etd:'',eta:'',equipment:'40HC',quantity:'1',containerOwner:'CARRIER',throughBL:'',commodity:'',cargoDescription:'',incoterm:'',currency:'USD',specialCargo:'',notes:''};

export default function BookingsPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [form,setForm]=useState(initialForm);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [showForm,setShowForm]=useState(true);
  const [search,setSearch]=useState('');
  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')),[orgs]);
  const agents=useMemo(()=>orgs.filter(o=>o.roles?.includes('AGENT')),[orgs]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return !q?bookings:bookings.filter(b=>[b.bookingNo,b.status,b.origin,b.destination,b.customer?.name,b.carrier,b.vesselVoyage].some(v=>String(v||'').toLowerCase().includes(q)));},[bookings,search]);

  useEffect(()=>{const t=localStorage.getItem('ancline_token')||'';if(!t){location.href='/login';return;}setToken(t);void load(t);},[]);

  async function request(path:string,init:RequestInit={},auth=true){const headers=new Headers(init.headers);headers.set('content-type','application/json');if(auth&&token)headers.set('authorization',`Bearer ${token}`);const r=await fetch(`${API}${path}`,{...init,headers,cache:'no-store'});const text=await r.text();let data:any={};try{data=text?JSON.parse(text):{};}catch{data={message:text};}if(!r.ok)throw new Error(data?.message||`${r.status} ${r.statusText}`);return data;}
  async function load(t:string){try{const headers={authorization:`Bearer ${t}`};const [br,or]=await Promise.all([fetch(`${API}/bookings`,{headers,cache:'no-store'}),fetch(`${API}/organizations`,{cache:'no-store'})]);const b=await br.json().catch(()=>[]);const o=await or.json().catch(()=>[]);setBookings(Array.isArray(b)?b:[]);setOrgs(Array.isArray(o)?o:[]);}catch(e:any){setMessage(e?.message||'Unable to load booking data');}}
  function set(k:keyof typeof initialForm,v:string){setForm(x=>({...x,[k]:v}));}
  function newBooking(){setForm({...initialForm,bookingNo:`ANL-${Date.now().toString().slice(-8)}`});setMessage('');setShowForm(true);window.scrollTo({top:0,behavior:'smooth'});}

  async function saveBooking(){
    if(!form.origin.trim()||!form.destination.trim()){setMessage('Origin and Destination are required.');return;}
    if(!form.customerId&&!form.customerName.trim()){setMessage('Select a customer or enter a new customer name.');return;}
    setBusy(true);setMessage('');
    try{
      let customerId=form.customerId;
      if(!customerId){const org=await request('/organizations',{method:'POST',body:JSON.stringify({code:`CUS-${Date.now().toString().slice(-7)}`,name:form.customerName.trim(),roles:['CUSTOMER'],active:true})},false);customerId=org.id;}
      const bookingNo=form.bookingNo.trim()||`ANL-${Date.now().toString().slice(-8)}`;
      const body:any={bookingNo,customerId,producingAgentId:form.producingAgentId||null,bookingType:form.bookingType||null,transportMode:form.transportMode||null,serviceType:form.serviceType||null,shipper:form.shipper||null,consignee:form.consignee||null,notifyParty:form.notifyParty||null,origin:form.origin.trim(),destination:form.destination.trim(),placeOfReceipt:form.placeOfReceipt||null,portOfLoading:form.portOfLoading||null,portOfDischarge:form.portOfDischarge||null,placeOfDelivery:form.placeOfDelivery||null,polAgent:form.polAgent||null,podAgent:form.podAgent||null,etd:form.etd?new Date(`${form.etd}T00:00:00Z`).toISOString():null,eta:form.eta?new Date(`${form.eta}T00:00:00Z`).toISOString():null,carrier:form.carrier||null,vesselVoyage:form.vesselVoyage||null,equipment:form.equipment||null,quantity:form.quantity?Number(form.quantity):null,containerOwner:form.containerOwner||null,throughBL:form.throughBL||null,commodity:form.commodity||null,cargoDescription:form.cargoDescription||null,incoterm:form.incoterm||null,currency:form.currency||'USD',specialCargo:form.specialCargo||null,notes:form.notes||null,status:'DRAFT'};
      const created=await request('/bookings',{method:'POST',body:JSON.stringify(body)});setMessage(`Booking ${bookingNo} saved successfully.`);setForm(initialForm);await load(token);setShowForm(false);if(created?.id)location.href=`/bookings/${created.id}`;
    }catch(e:any){setMessage(e?.message||'Booking could not be saved.');}finally{setBusy(false);}
  }

  function signOut(){localStorage.removeItem('ancline_token');localStorage.removeItem('ancline_user');location.href='/login';}
  const field:React.CSSProperties={width:'100%',padding:'8px 9px',border:'1px solid #cfd9e2',borderRadius:6,background:'#fff',minHeight:36};
  const label:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};
  const title:React.CSSProperties={fontSize:14,fontWeight:800,color:'#153a5d',margin:'0 0 12px',paddingBottom:8,borderBottom:'1px solid #e2e8ee'};
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12};
  const Input=({l,k,type='text',ph=''}:{l:string;k:keyof typeof initialForm;type?:string;ph?:string})=><label><span style={label}>{l}</span><input type={type} value={form[k]} placeholder={ph} onChange={e=>set(k,e.target.value)} style={field}/></label>;
  const Select=({l,k,children}:{l:string;k:keyof typeof initialForm;children:React.ReactNode})=><label><span style={label}>{l}</span><select value={form[k]} onChange={e=>set(k,e.target.value)} style={field}>{children}</select></label>;

  return <div className="shell"><aside className="side"><div className="brand">ANCLINE WORLDWIDE</div><a href="/">Control Tower</a><a href="/bookings" style={{background:'#183a5c'}}>Bookings</a><a href="/organizations">Organizations</a><a href="/rates">Rates / Quotes</a><a href="/documents">Documents</a><a href="/finance">Finance</a><a href="/approvals">Approvals</a><a href="/tasks">My Work</a></aside><main className="main">
    <div className="top"><div><h1 style={{margin:0}}>Bookings</h1><div className="sub">Ocean Booking & Shipment Workspace</div></div><div style={{display:'flex',gap:8}}><button className="btn" onClick={()=>setShowForm(v=>!v)}>{showForm?'Booking Register':'New Booking'}</button><button className="btn" onClick={newBooking}>+ New Booking</button><button className="btn" onClick={signOut}>Sign out</button></div></div>
    {message&&<div className="card" style={{marginBottom:14}}>{message}</div>}
    {showForm&&<>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Booking Details</h3><div style={grid}><Input l="Booking No." k="bookingNo" ph="Auto generated if blank"/><Select l="Booking Type" k="bookingType"><option>FCL</option><option>LCL</option><option>BREAKBULK</option><option>RORO</option></Select><Select l="Transport Mode" k="transportMode"><option>SEA</option><option>AIR</option><option>ROAD</option><option>RAIL</option></Select><Select l="Service Type" k="serviceType"><option>CY/CY</option><option>DOOR/CY</option><option>CY/DOOR</option><option>DOOR/DOOR</option></Select><Select l="Currency" k="currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></Select><Input l="Incoterm" k="incoterm" ph="FOB / CIF / EXW"/></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Customer & Parties</h3><div style={grid}><label><span style={label}>Customer</span><select value={form.customerId} onChange={e=>set('customerId',e.target.value)} style={field}><option value="">-- New / select customer --</option>{customers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>{!form.customerId&&<Input l="New Customer Name" k="customerName" ph="Customer company name"/>}<Input l="Shipper" k="shipper"/><Input l="Consignee" k="consignee"/><Input l="Notify Party" k="notifyParty"/><label><span style={label}>Producing Agent</span><select value={form.producingAgentId} onChange={e=>set('producingAgentId',e.target.value)} style={field}><option value="">-- Optional --</option>{agents.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Routing & Agents</h3><div style={grid}><Input l="Origin" k="origin" ph="Required"/><Input l="POL Agent" k="polAgent"/><Input l="Port of Loading (POL)" k="portOfLoading"/><Input l="Place of Receipt" k="placeOfReceipt"/><Input l="Destination" k="destination" ph="Required"/><Input l="POD Agent" k="podAgent"/><Input l="Port of Discharge (POD)" k="portOfDischarge"/><Input l="Place of Delivery" k="placeOfDelivery"/></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Carrier / Vessel / Schedule</h3><div style={grid}><Input l="Carrier" k="carrier"/><Input l="Vessel / Voyage" k="vesselVoyage"/><Input l="ETD" k="etd" type="date"/><Input l="ETA" k="eta" type="date"/><Input l="Through B/L" k="throughBL"/></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Equipment & Cargo</h3><div style={grid}><Select l="Equipment" k="equipment"><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option><option>20OT</option><option>40OT</option><option>20FR</option><option>40FR</option></Select><Input l="Quantity" k="quantity" type="number"/><Select l="Container Owner" k="containerOwner"><option>CARRIER</option><option>SHIPPER</option><option>ANCLINE</option><option>SOC</option></Select><Input l="Commodity" k="commodity"/><Input l="Special Cargo" k="specialCargo"/><Input l="Cargo Description" k="cargoDescription"/></div></div>
      <div className="card" style={{marginBottom:14}}><h3 style={title}>Operational Notes</h3><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} style={{...field,minHeight:80,resize:'vertical'}}/><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}><button className="btn" onClick={()=>setForm(initialForm)} disabled={busy}>Clear</button><button className="btn" onClick={saveBooking} disabled={busy}>{busy?'Saving...':'Save Booking'}</button></div></div>
    </>}
    <div className="card"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:10,flexWrap:'wrap'}}><div><h3 style={{margin:0}}>Booking Register</h3><span className="sub">Open any booking to edit operations, workflow and containers.</span></div><div style={{display:'flex',gap:8,alignItems:'center'}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bookings..." style={{...field,width:240}}/><span className="status">{visible.length} bookings</span></div></div><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Booking No.</th><th>Status</th><th>Customer</th><th>Origin</th><th>Destination</th><th>Carrier</th><th>Vessel / Voyage</th><th>Equipment</th><th>ETD</th><th>ETA</th><th>Action</th></tr></thead><tbody>{visible.length===0?<tr><td colSpan={11}>No bookings found.</td></tr>:visible.map(b=><tr key={b.id}><td><a href={`/bookings/${b.id}`} style={{fontWeight:800,color:'#123b61'}}>{b.bookingNo}</a></td><td><span className="status">{b.status}</span></td><td>{b.customer?.name||'-'}</td><td>{b.origin}</td><td>{b.destination}</td><td>{b.carrier||'-'}</td><td>{b.vesselVoyage||'-'}</td><td>{b.equipment||'-'}</td><td>{b.etd?new Date(b.etd).toLocaleDateString():'-'}</td><td>{b.eta?new Date(b.eta).toLocaleDateString():'-'}</td><td><a className="btn" href={`/bookings/${b.id}`} style={{textDecoration:'none',display:'inline-block'}}>Open / Edit</a></td></tr>)}</tbody></table></div></div>
  </main></div>;
}
