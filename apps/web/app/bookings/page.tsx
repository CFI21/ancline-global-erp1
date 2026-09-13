'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type Org = { id:string; code:string; name:string; roles:string[] };
type Booking = {
  id:string; bookingNo:string; status:string; origin:string; destination:string;
  carrier?:string; vesselVoyage?:string; equipment?:string; etd?:string; eta?:string;
  customer?:{name:string}; producingAgent?:{name:string};
};

const initialForm = {
  bookingNo:'', customerId:'', customerName:'', producingAgentId:'',
  bookingType:'FCL', transportMode:'SEA', serviceType:'CY/CY',
  shipper:'', consignee:'', notifyParty:'',
  origin:'', destination:'', placeOfReceipt:'', portOfLoading:'', portOfDischarge:'', placeOfDelivery:'',
  polAgent:'', podAgent:'', carrier:'', vesselVoyage:'', etd:'', eta:'',
  equipment:'40HC', quantity:'1', containerOwner:'CARRIER', throughBL:'',
  commodity:'', cargoDescription:'', incoterm:'', currency:'USD', specialCargo:'', notes:''
};

export default function BookingsPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [form,setForm]=useState(initialForm);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [showForm,setShowForm]=useState(true);

  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')), [orgs]);
  const agents=useMemo(()=>orgs.filter(o=>o.roles?.includes('AGENT')), [orgs]);

  useEffect(()=>{
    const t=localStorage.getItem('ancline_token')||'';
    if(!t){ location.href='/login'; return; }
    setToken(t);
    void load(t);
  },[]);

  async function request(path:string, init:RequestInit={}, auth=true){
    const headers=new Headers(init.headers);
    headers.set('content-type','application/json');
    if(auth && token) headers.set('authorization',`Bearer ${token}`);
    const r=await fetch(`${API}${path}`,{...init,headers,cache:'no-store'});
    const text=await r.text();
    let data:any={};
    try{ data=text?JSON.parse(text):{}; }catch{ data={message:text}; }
    if(!r.ok) throw new Error(data?.message || `${r.status} ${r.statusText}`);
    return data;
  }

  async function load(t:string){
    try{
      const headers={authorization:`Bearer ${t}`};
      const [bRes,oRes]=await Promise.all([
        fetch(`${API}/bookings`,{headers,cache:'no-store'}),
        fetch(`${API}/organizations`,{cache:'no-store'})
      ]);
      const b=await bRes.json().catch(()=>[]);
      const o=await oRes.json().catch(()=>[]);
      setBookings(Array.isArray(b)?b:[]);
      setOrgs(Array.isArray(o)?o:[]);
    }catch(e:any){ setMessage(e?.message||'Unable to load booking data'); }
  }

  function set<K extends keyof typeof initialForm>(key:K,value:string){
    setForm(v=>({...v,[key]:value}));
  }

  function newBooking(){
    setForm({...initialForm,bookingNo:`ANL-${Date.now().toString().slice(-8)}`});
    setMessage('');
    setShowForm(true);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function saveBooking(){
    if(!form.origin.trim() || !form.destination.trim()){
      setMessage('Origin and Destination are required.'); return;
    }
    if(!form.customerId && !form.customerName.trim()){
      setMessage('Select a customer or enter a new customer name.'); return;
    }
    setBusy(true); setMessage('');
    try{
      let customerId=form.customerId;
      if(!customerId){
        const org=await request('/organizations',{
          method:'POST',
          body:JSON.stringify({
            code:`CUS-${Date.now().toString().slice(-7)}`,
            name:form.customerName.trim(), roles:['CUSTOMER'], active:true
          })
        },false);
        customerId=org.id;
      }
      const bookingNo=form.bookingNo.trim() || `ANL-${Date.now().toString().slice(-8)}`;
      const body:any={
        bookingNo,
        customerId,
        producingAgentId:form.producingAgentId || null,
        bookingType:form.bookingType || null,
        transportMode:form.transportMode || null,
        serviceType:form.serviceType || null,
        shipper:form.shipper || null,
        consignee:form.consignee || null,
        notifyParty:form.notifyParty || null,
        origin:form.origin.trim(),
        destination:form.destination.trim(),
        placeOfReceipt:form.placeOfReceipt || null,
        portOfLoading:form.portOfLoading || null,
        portOfDischarge:form.portOfDischarge || null,
        placeOfDelivery:form.placeOfDelivery || null,
        polAgent:form.polAgent || null,
        podAgent:form.podAgent || null,
        etd:form.etd ? new Date(`${form.etd}T00:00:00Z`).toISOString() : null,
        eta:form.eta ? new Date(`${form.eta}T00:00:00Z`).toISOString() : null,
        carrier:form.carrier || null,
        vesselVoyage:form.vesselVoyage || null,
        equipment:form.equipment || null,
        quantity:form.quantity ? Number(form.quantity) : null,
        containerOwner:form.containerOwner || null,
        throughBL:form.throughBL || null,
        commodity:form.commodity || null,
        cargoDescription:form.cargoDescription || null,
        incoterm:form.incoterm || null,
        currency:form.currency || 'USD',
        specialCargo:form.specialCargo || null,
        notes:form.notes || null,
        status:'DRAFT'
      };
      await request('/bookings',{method:'POST',body:JSON.stringify(body)});
      setMessage(`Booking ${bookingNo} saved successfully.`);
      setForm(initialForm);
      await load(token);
      setShowForm(false);
    }catch(e:any){
      setMessage(e?.message || 'Booking could not be saved.');
    }finally{ setBusy(false); }
  }

  function signOut(){ localStorage.removeItem('ancline_token'); localStorage.removeItem('ancline_user'); location.href='/login'; }

  const fieldStyle:React.CSSProperties={width:'100%',padding:'8px 9px',border:'1px solid #cfd9e2',borderRadius:6,background:'#fff',minHeight:36};
  const labelStyle:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};
  const sectionTitle:React.CSSProperties={fontSize:14,fontWeight:800,color:'#153a5d',margin:'0 0 12px',paddingBottom:8,borderBottom:'1px solid #e2e8ee'};
  const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12};

  const Input=({label,k,type='text',placeholder=''}:{label:string;k:keyof typeof initialForm;type?:string;placeholder?:string})=><label><span style={labelStyle}>{label}</span><input type={type} value={form[k]} placeholder={placeholder} onChange={e=>set(k,e.target.value)} style={fieldStyle}/></label>;
  const Select=({label,k,children}:{label:string;k:keyof typeof initialForm;children:React.ReactNode})=><label><span style={labelStyle}>{label}</span><select value={form[k]} onChange={e=>set(k,e.target.value)} style={fieldStyle}>{children}</select></label>;

  return <div className="shell">
    <aside className="side">
      <div className="brand">ANCLINE WORLDWIDE</div>
      <a href="/">Control Tower</a>
      <a href="/bookings" style={{background:'#183a5c'}}>Bookings</a>
      <a href="/organizations">Organizations</a>
      <a href="/rates">Rates / Quotes</a>
      <a href="/documents">Documents</a>
      <a href="/finance">Finance</a>
      <a href="/approvals">Approvals</a>
      <a href="/tasks">My Work</a>
    </aside>

    <main className="main">
      <div className="top">
        <div><h1 style={{margin:0}}>Bookings</h1><div className="sub">Ocean Booking & Shipment Workspace</div></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={()=>setShowForm(!showForm)}>{showForm?'Booking Register':'New Booking'}</button>
          <button className="btn" onClick={newBooking}>+ New Booking</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {message && <div className="card" style={{marginBottom:14,borderColor:message.includes('successfully')?'#9bd1ad':'#e2c37a',background:message.includes('successfully')?'#f0fbf3':'#fffaf0'}}>{message}</div>}

      {showForm && <>
        <div className="card" style={{marginBottom:12}}>
          <h3 style={sectionTitle}>Booking Details</h3>
          <div style={formGrid}>
            <Input label="Booking No." k="bookingNo" placeholder="Auto generated if blank"/>
            <Select label="Booking Type" k="bookingType"><option>FCL</option><option>LCL</option><option>BREAKBULK</option><option>RORO</option></Select>
            <Select label="Transport Mode" k="transportMode"><option>SEA</option><option>AIR</option><option>ROAD</option><option>RAIL</option></Select>
            <Select label="Service Type" k="serviceType"><option>CY/CY</option><option>DOOR/CY</option><option>CY/DOOR</option><option>DOOR/DOOR</option></Select>
            <Select label="Currency" k="currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></Select>
            <Input label="Incoterm" k="incoterm" placeholder="FOB / CIF / EXW"/>
          </div>
        </div>

        <div className="card" style={{marginBottom:12}}>
          <h3 style={sectionTitle}>Customer & Parties</h3>
          <div style={formGrid}>
            <label><span style={labelStyle}>Customer</span><select value={form.customerId} onChange={e=>set('customerId',e.target.value)} style={fieldStyle}><option value="">-- New / select customer --</option>{customers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
            {!form.customerId && <Input label="New Customer Name" k="customerName" placeholder="Customer company name"/>}
            <Input label="Shipper" k="shipper"/>
            <Input label="Consignee" k="consignee"/>
            <Input label="Notify Party" k="notifyParty"/>
            <label><span style={labelStyle}>Producing Agent</span><select value={form.producingAgentId} onChange={e=>set('producingAgentId',e.target.value)} style={fieldStyle}><option value="">-- Optional --</option>{agents.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>
          </div>
        </div>

        <div className="card" style={{marginBottom:12}}>
          <h3 style={sectionTitle}>Routing & Agents</h3>
          <div style={formGrid}>
            <Input label="Origin" k="origin" placeholder="Required"/>
            <Input label="POL Agent" k="polAgent" placeholder="Origin agent"/>
            <Input label="Port of Loading (POL)" k="portOfLoading"/>
            <Input label="Place of Receipt" k="placeOfReceipt"/>
            <Input label="Destination" k="destination" placeholder="Required"/>
            <Input label="POD Agent" k="podAgent" placeholder="Destination agent"/>
            <Input label="Port of Discharge (POD)" k="portOfDischarge"/>
            <Input label="Place of Delivery" k="placeOfDelivery"/>
          </div>
        </div>

        <div className="card" style={{marginBottom:12}}>
          <h3 style={sectionTitle}>Carrier / Vessel / Schedule</h3>
          <div style={formGrid}>
            <Input label="Carrier" k="carrier" placeholder="Shipping line"/>
            <Input label="Vessel / Voyage" k="vesselVoyage" placeholder="Vessel name / voyage"/>
            <Input label="ETD" k="etd" type="date"/>
            <Input label="ETA" k="eta" type="date"/>
            <Input label="Through B/L" k="throughBL" placeholder="Through B/L ref."/>
          </div>
        </div>

        <div className="card" style={{marginBottom:12}}>
          <h3 style={sectionTitle}>Equipment & Cargo</h3>
          <div style={formGrid}>
            <Select label="Equipment" k="equipment"><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option><option>20OT</option><option>40OT</option><option>20FR</option><option>40FR</option></Select>
            <Input label="Quantity" k="quantity" type="number"/>
            <Select label="Container Owner" k="containerOwner"><option>CARRIER</option><option>SHIPPER</option><option>ANCLINE</option><option>SOC</option></Select>
            <Input label="Commodity" k="commodity"/>
            <Input label="Special Cargo" k="specialCargo" placeholder="DG / Reefer / OOG / None"/>
            <Input label="Cargo Description" k="cargoDescription"/>
          </div>
        </div>

        <div className="card" style={{marginBottom:14}}>
          <h3 style={sectionTitle}>Operational Notes</h3>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} style={{...fieldStyle,minHeight:80,resize:'vertical'}} placeholder="Booking instructions, operational remarks, handling notes..."/>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
            <button className="btn" onClick={()=>setForm(initialForm)} disabled={busy}>Clear</button>
            <button className="btn" onClick={saveBooking} disabled={busy} style={{minWidth:130}}>{busy?'Saving...':'Save Booking'}</button>
          </div>
        </div>
      </>}

      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}><h3 style={{margin:0}}>Booking Register</h3><span className="status">{bookings.length} bookings</span></div>
        <div style={{overflowX:'auto'}}>
          <table className="table"><thead><tr><th>Booking No.</th><th>Status</th><th>Customer</th><th>Origin</th><th>Destination</th><th>Carrier</th><th>Vessel / Voyage</th><th>Equipment</th><th>ETD</th><th>ETA</th></tr></thead>
            <tbody>{bookings.length===0?<tr><td colSpan={10}>No bookings yet. Click <b>+ New Booking</b> to create the first one.</td></tr>:bookings.map(b=><tr key={b.id}><td><b>{b.bookingNo}</b></td><td><span className="status">{b.status}</span></td><td>{b.customer?.name||'-'}</td><td>{b.origin}</td><td>{b.destination}</td><td>{b.carrier||'-'}</td><td>{b.vesselVoyage||'-'}</td><td>{b.equipment||'-'}</td><td>{b.etd?new Date(b.etd).toLocaleDateString():'-'}</td><td>{b.eta?new Date(b.eta).toLocaleDateString():'-'}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </main>
  </div>;
}
