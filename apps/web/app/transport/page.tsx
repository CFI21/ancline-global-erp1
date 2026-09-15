'use client';

import { useEffect, useMemo, useState } from 'react';
import WorkspaceShell,{fieldStyle,formGrid,labelStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,fmtDate,requireToken} from '../../lib/api';

type Booking={id:string;bookingNo:string;origin:string;destination:string;customerReference?:string;customer?:{name:string}};
type Org={id:string;code:string;name:string;roles:string[]};
type Container={id:string;containerNo:string;type:string;status:string;location?:string};
type Order={id:string;orderNo:string;bookingId:string;containerId?:string|null;orderType:string;providerOrgId?:string|null;providerName?:string|null;driverName?:string|null;driverPhone?:string|null;truckNo?:string|null;trailerNo?:string|null;pickupLocation:string;deliveryLocation:string;plannedPickupAt?:string|null;plannedDeliveryAt?:string|null;actualPickupAt?:string|null;actualDeliveryAt?:string|null;status:string;customerReference?:string|null;providerReference?:string|null;instructions?:string|null;proofOfDeliveryRef?:string|null;booking?:Booking|null;container?:Container|null};

const blank={bookingId:'',containerId:'',orderType:'IMPORT_DELIVERY',providerOrgId:'',providerName:'',driverName:'',driverPhone:'',truckNo:'',trailerNo:'',pickupLocation:'',deliveryLocation:'',plannedPickupAt:'',plannedDeliveryAt:'',customerReference:'',providerReference:'',instructions:'',proofOfDeliveryRef:''};
const types=['EMPTY_PICKUP','EXPORT_HAULAGE','IMPORT_DELIVERY','EMPTY_RETURN','PORT_TRANSFER'];
const dateTime=(v:string)=>v?new Date(v).toISOString():null;
const dateTimeInput=(v?:string|null)=>v?new Date(v).toLocaleString(): '-';

export default function TransportPage(){
  const [token,setToken]=useState('');
  const [orders,setOrders]=useState<Order[]>([]);
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [containers,setContainers]=useState<Container[]>([]);
  const [form,setForm]=useState(blank);
  const [showForm,setShowForm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [typeFilter,setTypeFilter]=useState('ALL');

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{
      const [o,b,g]=await Promise.all([api('/transport-orders',t),api('/bookings',t),api('/organizations',t)]);
      setOrders(Array.isArray(o)?o:[]);setBookings(Array.isArray(b)?b:[]);setOrgs(Array.isArray(g)?g:[]);
    }catch(e:any){setMessage(e?.message||'Unable to load transport operations');}
  }
  async function selectBooking(id:string){
    setForm(x=>({...x,bookingId:id,containerId:''}));setContainers([]);
    if(!id)return;
    try{const b=await api(`/bookings/${id}`,token);setContainers(Array.isArray(b?.containers)?b.containers:[]);setForm(x=>({...x,pickupLocation:x.pickupLocation||b?.portOfDischarge||b?.origin||'',deliveryLocation:x.deliveryLocation||b?.placeOfDelivery||b?.destination||'',customerReference:x.customerReference||b?.customerReference||''}));}catch{}
  }
  function set(k:keyof typeof blank,v:string){setForm(x=>({...x,[k]:v}));}
  async function create(){
    if(!form.bookingId||!form.pickupLocation.trim()||!form.deliveryLocation.trim()){setMessage('Booking, pickup location and delivery location are required.');return;}
    setBusy(true);setMessage('');
    try{
      const trucker=orgs.find(o=>o.id===form.providerOrgId);
      await api('/transport-orders',token,{method:'POST',body:JSON.stringify({...form,containerId:form.containerId||null,providerOrgId:form.providerOrgId||null,providerName:form.providerName||trucker?.name||null,plannedPickupAt:dateTime(form.plannedPickupAt),plannedDeliveryAt:dateTime(form.plannedDeliveryAt)})});
      setForm(blank);setContainers([]);setShowForm(false);setMessage('Transport order created.');await load();
    }catch(e:any){setMessage(e?.message||'Could not create transport order');}finally{setBusy(false);}
  }
  async function action(id:string,a:'dispatch'|'pickup'|'deliver'|'cancel'){
    if(a==='cancel'&&!confirm('Cancel this transport order?'))return;
    setBusy(true);setMessage('');
    try{await api(`/transport-orders/${id}/${a}`,token,{method:'POST'});setMessage(a==='deliver'?'Transport delivered and container/milestone synchronized.':`Transport order ${a} updated.`);await load();}
    catch(e:any){setMessage(e?.message||`Could not ${a} transport order`);}finally{setBusy(false);}
  }

  const truckers=useMemo(()=>orgs.filter(o=>o.roles?.includes('TRUCKER')),[orgs]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return orders.filter(o=>(statusFilter==='ALL'||o.status===statusFilter)&&(typeFilter==='ALL'||o.orderType===typeFilter)&&(!q||[o.orderNo,o.booking?.bookingNo,o.booking?.customer?.name,o.container?.containerNo,o.providerName,o.truckNo,o.driverName,o.pickupLocation,o.deliveryLocation].some(v=>String(v||'').toLowerCase().includes(q))));},[orders,search,statusFilter,typeFilter]);
  const today=new Date().toDateString();
  const planned=orders.filter(o=>o.status==='PLANNED').length;
  const inMotion=orders.filter(o=>['DISPATCHED','PICKED_UP'].includes(o.status)).length;
  const dueToday=orders.filter(o=>o.plannedDeliveryAt&&new Date(o.plannedDeliveryAt).toDateString()===today&&!['DELIVERED','CANCELLED'].includes(o.status)).length;
  const delivered=orders.filter(o=>o.status==='DELIVERED').length;

  return <WorkspaceShell title="Land Transport / Delivery" subtitle="Pickup, haulage, delivery and empty-return execution" active="/transport" actions={<button className="btn" onClick={()=>setShowForm(v=>!v)}>{showForm?'Close Form':'+ Transport Order'}</button>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12,marginBottom:12}}>
      <div className="card"><div className="sub">Planned</div><div className="kpi">{planned}</div></div>
      <div className="card"><div className="sub">In Motion</div><div className="kpi">{inMotion}</div></div>
      <div className="card"><div className="sub">Due Today</div><div className="kpi">{dueToday}</div></div>
      <div className="card"><div className="sub">Delivered</div><div className="kpi">{delivered}</div></div>
    </div>

    {showForm&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Create Transport Order</h3><div style={formGrid}>
      <label><span style={labelStyle}>Booking</span><select value={form.bookingId} onChange={e=>void selectBooking(e.target.value)} style={fieldStyle}><option value="">-- Select booking --</option>{bookings.map(b=><option key={b.id} value={b.id}>{b.bookingNo} — {b.customer?.name||''} — {b.origin} → {b.destination}</option>)}</select></label>
      <label><span style={labelStyle}>Order Type</span><select value={form.orderType} onChange={e=>set('orderType',e.target.value)} style={fieldStyle}>{types.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span style={labelStyle}>Container</span><select value={form.containerId} onChange={e=>set('containerId',e.target.value)} style={fieldStyle}><option value="">-- Optional / loose cargo --</option>{containers.map(c=><option key={c.id} value={c.id}>{c.containerNo} — {c.type} — {c.status}</option>)}</select></label>
      <label><span style={labelStyle}>Trucker</span><select value={form.providerOrgId} onChange={e=>set('providerOrgId',e.target.value)} style={fieldStyle}><option value="">-- Select / enter manually --</option>{truckers.map(o=><option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}</select></label>
      <Input l="Provider Name" v={form.providerName} onChange={v=>set('providerName',v)}/><Input l="Truck No." v={form.truckNo} onChange={v=>set('truckNo',v)}/><Input l="Trailer No." v={form.trailerNo} onChange={v=>set('trailerNo',v)}/><Input l="Driver" v={form.driverName} onChange={v=>set('driverName',v)}/><Input l="Driver Phone" v={form.driverPhone} onChange={v=>set('driverPhone',v)}/><Input l="Pickup Location" v={form.pickupLocation} onChange={v=>set('pickupLocation',v)}/><Input l="Delivery Location" v={form.deliveryLocation} onChange={v=>set('deliveryLocation',v)}/><Input l="Planned Pickup" v={form.plannedPickupAt} type="datetime-local" onChange={v=>set('plannedPickupAt',v)}/><Input l="Planned Delivery" v={form.plannedDeliveryAt} type="datetime-local" onChange={v=>set('plannedDeliveryAt',v)}/><Input l="Customer Ref." v={form.customerReference} onChange={v=>set('customerReference',v)}/><Input l="Trucker Ref." v={form.providerReference} onChange={v=>set('providerReference',v)}/><Input l="POD Ref." v={form.proofOfDeliveryRef} onChange={v=>set('proofOfDeliveryRef',v)}/>
    </div><label style={{display:'block',marginTop:10}}><span style={labelStyle}>Transport Instructions</span><textarea value={form.instructions} onChange={e=>set('instructions',e.target.value)} style={{...fieldStyle,minHeight:72}}/></label><div style={{textAlign:'right',marginTop:12}}><button className="btn" disabled={busy} onClick={create}>{busy?'Working...':'Create Transport Order'}</button></div></div>}

    <div className="card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:10}}><div><h3 style={{margin:0}}>Transport Control Board</h3><span className="sub">{visible.length} visible orders</span></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order, booking, truck..." style={{...fieldStyle,width:240}}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{...fieldStyle,width:155}}><option value="ALL">All statuses</option><option>PLANNED</option><option>DISPATCHED</option><option>PICKED_UP</option><option>DELIVERED</option><option>CANCELLED</option></select><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{...fieldStyle,width:180}}><option value="ALL">All transport types</option>{types.map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Order</th><th>Booking</th><th>Type</th><th>Container</th><th>Trucker / Truck</th><th>Route</th><th>Planned</th><th>Actual</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.length===0?<tr><td colSpan={10}>No transport orders found.</td></tr>:visible.map(o=><tr key={o.id}><td><b>{o.orderNo}</b><div className="sub">{o.providerReference||''}</div></td><td><a href={`/bookings/${o.bookingId}`} style={{fontWeight:800,color:'#123b61'}}>{o.booking?.bookingNo||o.bookingId}</a><div className="sub">{o.booking?.customer?.name||''}</div></td><td>{o.orderType}</td><td>{o.container?<><b>{o.container.containerNo}</b><div className="sub">{o.container.status}</div></>:'-'}</td><td>{o.providerName||'-'}<div className="sub">{o.truckNo||'-'} {o.driverName?`• ${o.driverName}`:''}</div></td><td>{o.pickupLocation}<br/>→ {o.deliveryLocation}</td><td>{dateTimeInput(o.plannedPickupAt)}<div className="sub">to {dateTimeInput(o.plannedDeliveryAt)}</div></td><td>{o.actualPickupAt?dateTimeInput(o.actualPickupAt):'-'}<div className="sub">{o.actualDeliveryAt?`Delivered ${dateTimeInput(o.actualDeliveryAt)}`:''}</div></td><td><span className="status">{o.status}</span></td><td><div style={{display:'flex',gap:5,flexWrap:'wrap',minWidth:190}}>{o.status==='PLANNED'&&<button className="btn" disabled={busy} onClick={()=>action(o.id,'dispatch')}>Dispatch</button>}{o.status==='DISPATCHED'&&<button className="btn" disabled={busy} onClick={()=>action(o.id,'pickup')}>Picked Up</button>}{['DISPATCHED','PICKED_UP'].includes(o.status)&&<button className="btn" disabled={busy} onClick={()=>action(o.id,'deliver')}>Deliver</button>}{!['DELIVERED','CANCELLED'].includes(o.status)&&<button className="btn" disabled={busy} onClick={()=>action(o.id,'cancel')}>Cancel</button>}</div></td></tr>)}</tbody></table></div>
    </div>
  </WorkspaceShell>;
}

function Input({l,v,onChange,type='text'}:{l:string;v:string;onChange:(v:string)=>void;type?:string}){return <label><span style={labelStyle}>{l}</span><input type={type} value={v} onChange={e=>onChange(e.target.value)} style={fieldStyle}/></label>;}
