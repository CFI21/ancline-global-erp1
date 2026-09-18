'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, currentUser } from '../../lib/api';

type Org={id:string;code:string;name:string;roles:string[]};
type Booking={id:string;bookingNo:string;businessModel?:string;bookingChannel?:string;shipmentNo?:string;shipmentStatus?:string;carrierBookingNo?:string;status:string;origin:string;destination:string;carrier?:string;vesselVoyage?:string;equipment?:string;etd?:string;eta?:string;atd?:string;specialCargo?:string;creditStatus?:string;slotStatus?:string;equipmentStatus?:string;cyClosing?:string;siCutoff?:string;vgmCutoff?:string;docCutoff?:string;portCutoff?:string;customer?:{name:string}};

const initialForm={
  businessModel:'NVOCC',bookingNo:'',bookingDate:'',customerReference:'',shipperReference:'',carrierBookingNo:'',houseBL:'',masterBL:'',
  customerId:'',customerName:'',producingAgentId:'',bookingType:'FCL',transportMode:'SEA',serviceType:'CY/CY',
  shipper:'',consignee:'',notifyParty:'',origin:'',destination:'',placeOfReceipt:'',portOfLoading:'',portOfDischarge:'',placeOfDelivery:'',transshipmentPort:'',terminal:'',polAgent:'',podAgent:'',
  carrier:'',vesselVoyage:'',etd:'',eta:'',atd:'',ata:'',cyClosing:'',siCutoff:'',vgmCutoff:'',docCutoff:'',portCutoff:'',
  equipment:'40HC',quantity:'1',containerOwner:'CARRIER',throughBL:'',commodity:'',packageCount:'',packageType:'',grossWeight:'',netWeight:'',volumeCbm:'',marksNumbers:'',hsCode:'',cargoDescription:'',
  incoterm:'',freightTerms:'PREPAID',currency:'USD',specialCargo:'NONE',dgUnNo:'',dgImoClass:'',dgPackingGroup:'',dgProperShippingName:'',reeferTemperatureC:'',reeferVentilation:'',reeferHumidityPct:'',oogLengthCm:'',oogWidthCm:'',oogHeightCm:'',oogWeightKg:'',notes:''
};

const toIso=(v:string)=>v?new Date(`${v}T00:00:00Z`).toISOString():null;
const num=(v:string)=>v.trim()===''?null:Number(v);
const csv=(v:any)=>`"${String(v??'').replace(/"/g,'""')}"`;
const workflowOrder=['DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED','BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE','CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED'];
const operationalState=(b:Booking)=>{
  const now=Date.now(),rank=workflowOrder.indexOf(b.status),atd=Boolean(b.atd);
  const cutoffs=[['CY',b.cyClosing],['SI',b.siCutoff],['VGM',b.vgmCutoff],['DOC',b.docCutoff],['PORT',b.portCutoff]]
    .filter((x):x is [string,string]=>Boolean(x[1]))
    .map(([label,value])=>({label,value,t:new Date(value).getTime()}))
    .filter(x=>Number.isFinite(x.t));
  const overdue=!atd?cutoffs.filter(x=>x.t<now).sort((a,b)=>b.t-a.t)[0]:undefined;
  const next=!atd?cutoffs.filter(x=>x.t>=now).sort((a,b)=>a.t-b.t)[0]:undefined;
  const cutoff=overdue?{...overdue,state:'OVERDUE',hours:Math.round((overdue.t-now)/3600000)}:next?{...next,state:(next.t-now)<=48*3600000?'DUE <48H':(next.t-now)<=120*3600000?'DUE <5D':'CLEAR',hours:Math.round((next.t-now)/3600000)}:null;
  const issues:string[]=[];
  if(rank>=workflowOrder.indexOf('CREDIT_CHECK')&&b.creditStatus!=='Passed')issues.push('Credit '+(b.creditStatus||'unchecked'));
  if(rank>=workflowOrder.indexOf('SLOT_CHECK')&&!['Protected','ALLOCATED'].includes(String(b.slotStatus||'')))issues.push('Slot '+(b.slotStatus||'unchecked'));
  if(rank>=workflowOrder.indexOf('EQUIPMENT_CHECK')&&!['Available','RELEASED'].includes(String(b.equipmentStatus||'')))issues.push('Equipment '+(b.equipmentStatus||'unchecked'));
  const cutoffRisk=cutoff?.state==='OVERDUE'||cutoff?.state==='DUE <48H';
  return {cutoff,issues,needsAction:Boolean(cutoffRisk||issues.length),special:Boolean(b.specialCargo)};
};

export default function BookingsPage(){
  const [token,setToken]=useState('');
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [form,setForm]=useState(initialForm);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [showForm,setShowForm]=useState(true);
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [customerFilter,setCustomerFilter]=useState('ALL');
  const [carrierFilter,setCarrierFilter]=useState('ALL');
  const [attentionFilter,setAttentionFilter]=useState('ALL');
  const [etdFrom,setEtdFrom]=useState('');
  const [etdTo,setEtdTo]=useState('');
  const [userRole,setUserRole]=useState('');
  const isAdmin=userRole==='GLOBAL_ADMIN';

  const customers=useMemo(()=>orgs.filter(o=>o.roles?.includes('CUSTOMER')),[orgs]);
  const agents=useMemo(()=>orgs.filter(o=>o.roles?.includes('AGENT')),[orgs]);
  const statuses=useMemo(()=>Array.from(new Set(bookings.map(b=>b.status))).sort(),[bookings]);
  const customerNames=useMemo(()=>Array.from(new Set(bookings.map(b=>b.customer?.name).filter(Boolean) as string[])).sort(),[bookings]);
  const carriers=useMemo(()=>Array.from(new Set(bookings.map(b=>b.carrier).filter(Boolean) as string[])).sort(),[bookings]);
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const from=etdFrom?new Date(`${etdFrom}T00:00:00Z`).getTime():null;
    const to=etdTo?new Date(`${etdTo}T23:59:59Z`).getTime():null;
    return bookings.filter(b=>{
      const statusOk=statusFilter==='ALL'||b.status===statusFilter;
      const customerOk=customerFilter==='ALL'||b.customer?.name===customerFilter;
      const carrierOk=carrierFilter==='ALL'||b.carrier===carrierFilter;
      const etd=b.etd?new Date(b.etd).getTime():null;
      const fromOk=from===null||(etd!==null&&etd>=from);
      const toOk=to===null||(etd!==null&&etd<=to);
      const op=operationalState(b);
      const attentionOk=attentionFilter==='ALL'||(attentionFilter==='ACTION'&&op.needsAction)||(attentionFilter==='CUTOFF'&&Boolean(op.cutoff&&op.cutoff.state!=='CLEAR'))||(attentionFilter==='CONTROLS'&&op.issues.length>0)||(attentionFilter==='SPECIAL'&&op.special);
      const searchOk=!q||[b.bookingNo,b.businessModel,b.bookingChannel,b.shipmentNo,b.shipmentStatus,b.carrierBookingNo,b.status,b.origin,b.destination,b.customer?.name,b.carrier,b.vesselVoyage,b.specialCargo,b.creditStatus,b.slotStatus,b.equipmentStatus].some(v=>String(v||'').toLowerCase().includes(q));
      return statusOk&&customerOk&&carrierOk&&attentionOk&&fromOk&&toOk&&searchOk;
    });
  },[bookings,search,statusFilter,customerFilter,carrierFilter,attentionFilter,etdFrom,etdTo]);
  const opsSummary=useMemo(()=>bookings.reduce((a,b)=>{const op=operationalState(b);if(!['CANCELLED','COMPLETED','FINANCIALLY_CLOSED'].includes(b.status))a.active++;if(op.needsAction)a.action++;if(op.cutoff?.state==='OVERDUE'||op.cutoff?.state==='DUE <48H')a.cutoff++;if(op.issues.length)a.controls++;if(op.special)a.special++;return a;},{active:0,action:0,cutoff:0,controls:0,special:0}),[bookings]);

  useEffect(()=>{const t=localStorage.getItem('ancline_token')||'';if(!t){location.href='/login';return;}setToken(t);setUserRole(String(currentUser()?.role||''));void load(t);},[]);

  async function request(path:string,init:RequestInit={},auth=true,t=token){
    return api(path,auth?t:undefined,init);
  }
  async function load(t:string){
    try{const [b,o]=await Promise.all([request('/bookings',{},true,t),request('/organizations',{},true,t).catch(()=>[])]);setBookings(Array.isArray(b)?b:[]);setOrgs(Array.isArray(o)?o:[]);}catch(e:any){setMessage(e?.message||'Unable to load booking data');}
  }
  function set(k:keyof typeof initialForm,v:string){setForm(x=>({...x,[k]:v}));}
  function newBooking(){setForm({...initialForm,bookingNo:`ANL-${Date.now().toString().slice(-8)}`,bookingDate:new Date().toISOString().slice(0,10)});setMessage('');setShowForm(true);window.scrollTo({top:0,behavior:'smooth'});}

  async function saveBooking(){
    if(!form.origin.trim()||!form.destination.trim()){setMessage('Origin and Destination are required.');return;}
    if(!form.customerId&&!form.customerName.trim()){setMessage('Select a customer or enter a new customer name.');return;}
    if(form.specialCargo==='DG'&&(!form.dgUnNo.trim()||!form.dgImoClass.trim())){setMessage('DG cargo requires UN No. and IMO Class.');return;}
    if(form.specialCargo==='REEFER'&&form.reeferTemperatureC.trim()===''){setMessage('Reefer cargo requires a set temperature.');return;}
    setBusy(true);setMessage('');
    try{
      let customerId=form.customerId;
      if(!customerId){const org=await request('/organizations',{method:'POST',body:JSON.stringify({code:`CUS-${Date.now().toString().slice(-7)}`,name:form.customerName.trim(),roles:['CUSTOMER'],active:true})});customerId=org.id;}
      const bookingNo=form.bookingNo.trim()||`ANL-${Date.now().toString().slice(-8)}`;
      const body:any={
        businessModel:form.businessModel,bookingNo,customerId,producingAgentId:form.producingAgentId||null,bookingType:form.bookingType||null,transportMode:form.transportMode||null,serviceType:form.serviceType||null,
        bookingDate:toIso(form.bookingDate),customerReference:form.customerReference||null,shipperReference:form.shipperReference||null,carrierBookingNo:form.carrierBookingNo||null,houseBL:form.houseBL||null,masterBL:form.masterBL||null,
        shipper:form.shipper||null,consignee:form.consignee||null,notifyParty:form.notifyParty||null,origin:form.origin.trim(),destination:form.destination.trim(),placeOfReceipt:form.placeOfReceipt||null,portOfLoading:form.portOfLoading||null,portOfDischarge:form.portOfDischarge||null,placeOfDelivery:form.placeOfDelivery||null,transshipmentPort:form.transshipmentPort||null,terminal:form.terminal||null,polAgent:form.polAgent||null,podAgent:form.podAgent||null,
        etd:toIso(form.etd),eta:toIso(form.eta),atd:toIso(form.atd),ata:toIso(form.ata),cyClosing:toIso(form.cyClosing),siCutoff:toIso(form.siCutoff),vgmCutoff:toIso(form.vgmCutoff),docCutoff:toIso(form.docCutoff),portCutoff:toIso(form.portCutoff),
        carrier:form.carrier||null,vesselVoyage:form.vesselVoyage||null,equipment:form.equipment||null,quantity:num(form.quantity),containerOwner:form.containerOwner||null,throughBL:form.throughBL||null,
        commodity:form.commodity||null,packageCount:num(form.packageCount),packageType:form.packageType||null,grossWeight:num(form.grossWeight),netWeight:num(form.netWeight),volumeCbm:num(form.volumeCbm),marksNumbers:form.marksNumbers||null,hsCode:form.hsCode||null,cargoDescription:form.cargoDescription||null,
        incoterm:form.incoterm||null,freightTerms:form.freightTerms||null,currency:form.currency||'USD',specialCargo:form.specialCargo==='NONE'?null:form.specialCargo,
        dgUnNo:form.specialCargo==='DG'?(form.dgUnNo||null):null,dgImoClass:form.specialCargo==='DG'?(form.dgImoClass||null):null,dgPackingGroup:form.specialCargo==='DG'?(form.dgPackingGroup||null):null,dgProperShippingName:form.specialCargo==='DG'?(form.dgProperShippingName||null):null,
        reeferTemperatureC:form.specialCargo==='REEFER'?num(form.reeferTemperatureC):null,reeferVentilation:form.specialCargo==='REEFER'?num(form.reeferVentilation):null,reeferHumidityPct:form.specialCargo==='REEFER'?num(form.reeferHumidityPct):null,
        oogLengthCm:form.specialCargo==='OOG'?num(form.oogLengthCm):null,oogWidthCm:form.specialCargo==='OOG'?num(form.oogWidthCm):null,oogHeightCm:form.specialCargo==='OOG'?num(form.oogHeightCm):null,oogWeightKg:form.specialCargo==='OOG'?num(form.oogWeightKg):null,
        notes:form.notes||null,status:'DRAFT'
      };
      const created=await request('/bookings',{method:'POST',body:JSON.stringify(body)});setMessage(`Booking ${bookingNo} saved successfully.`);setForm(initialForm);await load(token);setShowForm(false);if(created?.id)location.href=`/bookings/${created.id}`;
    }catch(e:any){setMessage(e?.message||'Booking could not be saved.');}finally{setBusy(false);}
  }

  function exportCsv(){
    const rows=[['Operating Model','Booking No.','Shipment No.','Execution Status','Carrier Ref.','Status','Customer','Origin','Destination','Carrier','Vessel / Voyage','Equipment','Special Cargo','ETD','ETA'],...visible.map(b=>[b.businessModel||'NVOCC',b.bookingNo,b.shipmentNo||'',b.shipmentStatus||'',b.carrierBookingNo||'',b.status,b.customer?.name||'',b.origin,b.destination,b.carrier||'',b.vesselVoyage||'',b.equipment||'',b.specialCargo||'',b.etd?new Date(b.etd).toISOString().slice(0,10):'',b.eta?new Date(b.eta).toISOString().slice(0,10):''])];
    const blob=new Blob([rows.map(r=>r.map(csv).join(',')).join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ancline-bookings-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
  }
  function clearFilters(){setSearch('');setStatusFilter('ALL');setCustomerFilter('ALL');setCarrierFilter('ALL');setAttentionFilter('ALL');setEtdFrom('');setEtdTo('');}
  function signOut(){localStorage.removeItem('ancline_token');localStorage.removeItem('ancline_user');location.href='/login';}
  const field:React.CSSProperties={width:'100%',padding:'8px 9px',border:'1px solid #cfd9e2',borderRadius:6,background:'#fff',minHeight:36};
  const label:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};
  const title:React.CSSProperties={fontSize:14,fontWeight:800,color:'#153a5d',margin:'0 0 12px',paddingBottom:8,borderBottom:'1px solid #e2e8ee'};
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:10};
  const Input=({l,k,type='text',ph=''}:{l:string;k:keyof typeof initialForm;type?:string;ph?:string})=><label><span style={label}>{l}</span><input type={type} value={form[k]} placeholder={ph} onChange={e=>set(k,e.target.value)} style={field}/></label>;
  const Select=({l,k,children}:{l:string;k:keyof typeof initialForm;children:React.ReactNode})=><label><span style={label}>{l}</span><select value={form[k]} onChange={e=>set(k,e.target.value)} style={field}>{children}</select></label>;

  return <div className="shell"><aside className="side"><div className="brand">ANCLINE WORLDWIDE</div><a href="/">Control Tower</a><a href="/bookings" style={{background:'#183a5c'}}>Bookings</a><a href="/booking-control">Booking Control</a><a href="/carrier-operations">Carrier Booking / Space Control</a><a href="/schedules">Vessel / Voyage Schedules</a><a href="/routing">Routing / Voyage Plan</a><a href="/tracking">Shipment Tracking</a><a href="/exceptions">Exceptions / Action Board</a><a href="/organizations">Organizations</a><a href="/rates">Rates / Quotes</a><a href="/documents">Documents</a><a href="/finance">Finance</a><a href="/approvals">Approvals</a><a href="/tasks">My Work</a></aside><main className="main">
    <div className="top"><div><h1 style={{margin:0}}>Bookings</h1><div className="sub">Ocean Booking Intake, Readiness & Exception Control</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a className="btn" href="/carrier-operations" style={{textDecoration:'none'}}>Carrier Space Control</a><a className="btn" href="/shipment-control" style={{textDecoration:'none'}}>Shipment Control</a><button className="btn" onClick={()=>setShowForm(v=>!v)}>{showForm?'Booking Register':'New Booking'}</button><button className="btn" onClick={newBooking}>+ New Booking</button><button className="btn" onClick={signOut}>Sign out</button></div></div>
    {message&&<div className="card" style={{marginBottom:14}}>{message}</div>}
    {showForm&&<>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Booking Details & References</h3><div style={grid}>
        {isAdmin?<Select l="Operating Model" k="businessModel"><option value="NVOCC">NVOCC</option><option value="FORWARDING">Forwarding</option></Select>:<div><span style={label}>Operating Model</span><div className="status">NVOCC</div></div>}<Input l="Booking No." k="bookingNo" ph="Auto generated if blank"/><Input l="Booking Date" k="bookingDate" type="date"/><Input l="Carrier Booking No." k="carrierBookingNo"/><Input l="Customer Ref." k="customerReference"/><Input l="Shipper Ref." k="shipperReference"/><Input l="House B/L" k="houseBL"/><Input l="Master B/L" k="masterBL"/>
        <Select l="Booking Type" k="bookingType"><option>FCL</option><option>LCL</option><option>BREAKBULK</option><option>RORO</option></Select><Select l="Transport Mode" k="transportMode"><option>SEA</option><option>AIR</option><option>ROAD</option><option>RAIL</option></Select><Select l="Service Type" k="serviceType"><option>CY/CY</option><option>DOOR/CY</option><option>CY/DOOR</option><option>DOOR/DOOR</option></Select><Select l="Freight Terms" k="freightTerms"><option>PREPAID</option><option>COLLECT</option></Select><Select l="Currency" k="currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></Select><Input l="Incoterm" k="incoterm" ph="FOB / CIF / EXW"/>
      </div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Customer & Parties</h3><div style={grid}><label><span style={label}>Customer</span><select value={form.customerId} onChange={e=>set('customerId',e.target.value)} style={field}><option value="">-- New / select customer --</option>{customers.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label>{!form.customerId&&<Input l="New Customer Name" k="customerName" ph="Customer company name"/>}<Input l="Shipper" k="shipper"/><Input l="Consignee" k="consignee"/><Input l="Notify Party" k="notifyParty"/><label><span style={label}>Producing Agent</span><select value={form.producingAgentId} onChange={e=>set('producingAgentId',e.target.value)} style={field}><option value="">-- Optional --</option>{agents.map(o=><option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></label></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Routing & Agents</h3><div style={grid}><Input l="Place of Receipt" k="placeOfReceipt"/><Input l="Origin" k="origin" ph="Required"/><Input l="Port of Loading (POL)" k="portOfLoading"/><Input l="POL Agent" k="polAgent"/><Input l="Transshipment Port" k="transshipmentPort"/><Input l="Port of Discharge (POD)" k="portOfDischarge"/><Input l="POD Agent" k="podAgent"/><Input l="Destination" k="destination" ph="Required"/><Input l="Place of Delivery" k="placeOfDelivery"/><Input l="Terminal" k="terminal"/></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Carrier / Vessel / Schedule & Cut-offs</h3><div style={grid}><Input l="Carrier" k="carrier"/><Input l="Vessel / Voyage" k="vesselVoyage"/><Input l="ETD" k="etd" type="date"/><Input l="ETA" k="eta" type="date"/><Input l="ATD" k="atd" type="date"/><Input l="ATA" k="ata" type="date"/><Input l="CY Closing" k="cyClosing" type="date"/><Input l="SI Cut-off" k="siCutoff" type="date"/><Input l="VGM Cut-off" k="vgmCutoff" type="date"/><Input l="Documentation Cut-off" k="docCutoff" type="date"/><Input l="Port Cut-off" k="portCutoff" type="date"/><Input l="Through B/L" k="throughBL"/></div></div>
      <div className="card" style={{marginBottom:12}}><h3 style={title}>Equipment & Cargo</h3><div style={grid}><Select l="Equipment" k="equipment"><option>20GP</option><option>40GP</option><option>40HC</option><option>45HC</option><option>20RF</option><option>40RF</option><option>20OT</option><option>40OT</option><option>20FR</option><option>40FR</option></Select><Input l="Quantity" k="quantity" type="number"/><Select l="Container Owner" k="containerOwner"><option>CARRIER</option><option>SHIPPER</option><option>ANCLINE</option><option>SOC</option></Select><Input l="Commodity" k="commodity"/><Input l="Packages" k="packageCount" type="number"/><Input l="Package Type" k="packageType"/><Input l="Gross Weight (kg)" k="grossWeight" type="number"/><Input l="Net Weight (kg)" k="netWeight" type="number"/><Input l="Volume (CBM)" k="volumeCbm" type="number"/><Input l="HS Code" k="hsCode"/><Select l="Special Cargo" k="specialCargo"><option value="NONE">None / General</option><option value="DG">Dangerous Goods (DG)</option><option value="REEFER">Reefer</option><option value="OOG">Out of Gauge (OOG)</option></Select><Input l="Marks & Numbers" k="marksNumbers"/><Input l="Cargo Description" k="cargoDescription"/></div>
        {form.specialCargo==='DG'&&<div style={{...grid,marginTop:12,paddingTop:12,borderTop:'1px solid #e2e8ee'}}><Input l="UN No." k="dgUnNo" ph="e.g. UN 1263"/><Input l="IMO Class" k="dgImoClass" ph="e.g. 3"/><Select l="Packing Group" k="dgPackingGroup"><option value="">-- Select --</option><option>I</option><option>II</option><option>III</option></Select><Input l="Proper Shipping Name" k="dgProperShippingName"/></div>}
        {form.specialCargo==='REEFER'&&<div style={{...grid,marginTop:12,paddingTop:12,borderTop:'1px solid #e2e8ee'}}><Input l="Set Temperature °C" k="reeferTemperatureC" type="number"/><Input l="Ventilation CBM/H" k="reeferVentilation" type="number"/><Input l="Humidity %" k="reeferHumidityPct" type="number"/></div>}
        {form.specialCargo==='OOG'&&<div style={{...grid,marginTop:12,paddingTop:12,borderTop:'1px solid #e2e8ee'}}><Input l="Length cm" k="oogLengthCm" type="number"/><Input l="Width cm" k="oogWidthCm" type="number"/><Input l="Height cm" k="oogHeightCm" type="number"/><Input l="Cargo Weight kg" k="oogWeightKg" type="number"/></div>}
      </div>
      <div className="card" style={{marginBottom:14}}><h3 style={title}>Operational Notes</h3><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} style={{...field,minHeight:80,resize:'vertical'}}/><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}><button className="btn" onClick={()=>setForm(initialForm)} disabled={busy}>Clear</button><button className="btn" onClick={saveBooking} disabled={busy}>{busy?'Saving...':'Save Booking'}</button></div></div>
    </>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:12}}>
      <div className="card"><div className="sub">Active bookings</div><div style={{fontSize:24,fontWeight:800}}>{opsSummary.active}</div></div>
      <div className="card"><div className="sub">Needs action</div><div style={{fontSize:24,fontWeight:800}}>{opsSummary.action}</div></div>
      <div className="card"><div className="sub">Cutoff risk</div><div style={{fontSize:24,fontWeight:800}}>{opsSummary.cutoff}</div></div>
      <div className="card"><div className="sub">Control gaps</div><div style={{fontSize:24,fontWeight:800}}>{opsSummary.controls}</div></div>
      <div className="card"><div className="sub">Special cargo</div><div style={{fontSize:24,fontWeight:800}}>{opsSummary.special}</div></div>
    </div>
    <div className="card"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:10,flexWrap:'wrap'}}><div><h3 style={{margin:0}}>Booking Register</h3><span className="sub">Search, filter, export and open bookings for operations.</span></div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button className="btn" onClick={clearFilters}>Clear Filters</button><button className="btn" onClick={exportCsv} disabled={!visible.length}>Export CSV</button><span className="status">{visible.length} bookings</span></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8,marginBottom:12}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bookings..." style={field}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={field}><option value="ALL">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select><select value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)} style={field}><option value="ALL">All customers</option>{customerNames.map(s=><option key={s}>{s}</option>)}</select><select value={carrierFilter} onChange={e=>setCarrierFilter(e.target.value)} style={field}><option value="ALL">All carriers</option>{carriers.map(s=><option key={s}>{s}</option>)}</select><select value={attentionFilter} onChange={e=>setAttentionFilter(e.target.value)} style={field}><option value="ALL">All attention states</option><option value="ACTION">Needs action</option><option value="CUTOFF">Cutoff risk</option><option value="CONTROLS">Control gaps</option><option value="SPECIAL">Special cargo</option></select><label><span style={label}>ETD From</span><input type="date" value={etdFrom} onChange={e=>setEtdFrom(e.target.value)} style={field}/></label><label><span style={label}>ETD To</span><input type="date" value={etdTo} onChange={e=>setEtdTo(e.target.value)} style={field}/></label></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Model</th><th>Booking No.</th><th>Shipment</th><th>Carrier Ref.</th><th>Status</th><th>Customer</th><th>Origin</th><th>Destination</th><th>Carrier</th><th>Vessel / Voyage</th><th>Equipment</th><th>Cargo</th><th>Controls</th><th>Next Cutoff</th><th>Attention</th><th>ETD</th><th>ETA</th><th>Action</th></tr></thead><tbody>{visible.length===0?<tr><td colSpan={18}>No bookings found.</td></tr>:visible.map(b=>{const op=operationalState(b);return <tr key={b.id}><td><span className="status">{b.businessModel||'NVOCC'}</span><div className="sub">{b.bookingChannel||'INTERNAL'}</div></td><td><a href={`/bookings/${b.id}`} style={{fontWeight:800,color:'#123b61'}}>{b.bookingNo}</a></td><td>{b.shipmentNo||'-'}<div className="sub">{b.shipmentStatus||'BOOKED'}</div></td><td>{b.carrierBookingNo||'-'}</td><td><span className="status">{b.status}</span></td><td>{b.customer?.name||'-'}</td><td>{b.origin}</td><td>{b.destination}</td><td>{b.carrier||'-'}</td><td>{b.vesselVoyage||'-'}</td><td>{b.equipment||'-'}</td><td>{b.specialCargo||'GENERAL'}</td><td><div style={{minWidth:135,fontSize:12}}>Credit: {b.creditStatus||'-'}<br/>Slot: {b.slotStatus||'-'}<br/>Equipment: {b.equipmentStatus||'-'}</div></td><td>{op.cutoff?<><b>{op.cutoff.label}</b><div className="sub">{new Date(op.cutoff.value).toLocaleString()}</div><div className="sub">{op.cutoff.state}{op.cutoff.hours!=null?` · ${op.cutoff.hours}h`:''}</div></>:'-'}</td><td>{op.needsAction?<><span className="status">ACTION</span><div className="sub" style={{marginTop:4,maxWidth:190}}>{op.issues.join(', ')||op.cutoff?.state}</div></>:<span className="status">CLEAR</span>}</td><td>{b.etd?new Date(b.etd).toLocaleDateString():'-'}</td><td>{b.eta?new Date(b.eta).toLocaleDateString():'-'}</td><td><a className="btn" href={`/bookings/${b.id}`} style={{textDecoration:'none',display:'inline-block'}}>Open / Edit</a></td></tr>})}</tbody></table></div></div>
  </main></div>;
}
