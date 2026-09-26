'use client';

import {useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api';

export type JobWorkspaceKey='BOOKING'|'RATES'|'SCHEDULE'|'ROUTING'|'CARRIER'|'PAYMENT'|'SHIPMENT'|'CONTAINERS'|'DOCUMENTS'|'DETAILS'|'TRACKING'|'EXCEPTIONS'|'FINANCE'|'TASKS'|'APPROVALS';

type Props={
  bookingId:string;
  bookingNo?:string;
  active?:JobWorkspaceKey;
  customer?:string;
  route?:string;
  carrier?:string;
  vessel?:string;
  equipment?:string;
  status?:string;
  etd?:string;
  eta?:string;
};

type BookingContext={
  id?:string;
  bookingNo?:string;
  businessModel?:string;
  customer?:{name?:string};
  customerId?:string;
  origin?:string;
  destination?:string;
  carrier?:string;
  vesselVoyage?:string;
  equipment?:string;
  quantity?:number;
  status?:string;
  shipmentStatus?:string;
  etd?:string;
  eta?:string;
  houseBL?:string;
  masterBL?:string;
  containers?:Array<any>;
  routingLegs?:Array<any>;
  documents?:Array<any>;
  tasks?:Array<any>;
};

const fmtDate=(v?:string)=>v?new Date(v).toLocaleDateString():'';

export default function JobContextRail({
  bookingId,bookingNo='',active,customer='',route='',carrier='',vessel='',equipment='',status='',etd='',eta=''
}:Props){
  const [modal,setModal]=useState<{title:string;href:string}|null>(null);
  const [embedded,setEmbedded]=useState(false);
  const [context,setContext]=useState<BookingContext|null>(null);

  useEffect(()=>{
    const isEmbedded=new URLSearchParams(location.search).get('embed')==='1';
    setEmbedded(isEmbedded);
    if(!isEmbedded)document.body.classList.add('has-job-context-rail');
    return ()=>document.body.classList.remove('has-job-context-rail');
  },[]);

  useEffect(()=>{
    if(!bookingId)return;
    const token=localStorage.getItem('ancline_token')||'';
    if(!token)return;
    void api(`/bookings/${bookingId}`,token).then(setContext).catch(()=>{});
  },[bookingId]);

  useEffect(()=>{
    if(!modal)return;
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(null);};
    window.addEventListener('keydown',close);
    return ()=>window.removeEventListener('keydown',close);
  },[modal]);

  const q=bookingId?`bookingId=${encodeURIComponent(bookingId)}`:'';
  const pages=useMemo(()=>[
    {key:'BOOKING' as JobWorkspaceKey,label:'Booking',href:bookingId?`/bookings/${bookingId}`:'/bookings'},
    {key:'RATES' as JobWorkspaceKey,label:'Rates / Quote',href:`/rates?${q}`},
    {key:'SCHEDULE' as JobWorkspaceKey,label:'Vessel Schedule',href:`/schedules?${q}`},
    {key:'ROUTING' as JobWorkspaceKey,label:'Routing',href:`/routing?${q}`},
    {key:'CARRIER' as JobWorkspaceKey,label:'Carrier Space',href:`/carrier-operations?${q}`},
    {key:'SHIPMENT' as JobWorkspaceKey,label:'Shipment / Consol',href:`/shipment-control?${q}`},
    {key:'CONTAINERS' as JobWorkspaceKey,label:'Containers',href:`/container-control?${q}`},
    {key:'DOCUMENTS' as JobWorkspaceKey,label:'Docs',href:`/documents?${q}`},
    {key:'DETAILS' as JobWorkspaceKey,label:'Additional Detail',href:bookingId?`/bookings/${bookingId}?tab=Details`:'/bookings'},
  ],[bookingId,q]);

  if(embedded||!bookingId)return null;

  const quickHref=(href:string)=>href.includes('?')?`${href}&embed=1`:`${href}?embed=1`;
  const cleanHref=(href:string)=>href.replace(/([?&])embed=1(&?)/,(m,p1,p2)=>p2?p1:'').replace(/[?&]$/,'');
  const display={
    bookingNo:bookingNo||context?.bookingNo||bookingId,
    customer:customer||context?.customer?.name||'—',
    route:route||[context?.origin,context?.destination].filter(Boolean).join(' → ')||'—',
    carrier:carrier||context?.carrier||'—',
    vessel:vessel||context?.vesselVoyage||'—',
    equipment:equipment||(context?.equipment?`${context?.quantity||1} × ${context.equipment}`:'—'),
    status:status||context?.shipmentStatus||context?.status||'—',
    etd:etd||fmtDate(context?.etd)||'—',
    eta:eta||fmtDate(context?.eta)||'—',
  };
  const counts=[
    ['Containers',String(context?.containers?.length||0)],
    ['Routing Legs',String(context?.routingLegs?.length||0)],
    ['Documents',String(context?.documents?.length||0)],
    ['Tasks',String(context?.tasks?.length||0)],
  ];

  return <>
    <nav className="job-work-tabs" aria-label="Related job sections">
      {pages.map(p=><a key={p.key} href={p.href} className={active===p.key?'active':''}>{p.label}</a>)}
    </nav>

    <aside className="job-context-rail">
      <div className="job-context-head">
        <span>JOB SUMMARY</span>
        <b>{display.bookingNo}</b>
      </div>
      <div className="job-context-summary">
        {[
          ['Customer',display.customer],
          ['Route',display.route],
          ['Carrier',display.carrier],
          ['Vessel / Voyage',display.vessel],
          ['Equipment',display.equipment],
          ['Status',display.status],
          ['ETD',display.etd],
          ['ETA',display.eta],
        ].map(([label,value])=><div className="job-context-row" key={label}><span>{label}</span><b title={value}>{value}</b></div>)}
      </div>

      <div className="job-context-mini-grid">
        {counts.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}
      </div>

    </aside>

    {modal&&<div className="job-quick-overlay" role="dialog" aria-modal="true" aria-label={modal.title} onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}>
      <div className="job-quick-modal">
        <div className="job-quick-head">
          <div><span>QUICK VIEW</span><b>{modal.title} · {display.bookingNo}</b></div>
          <div className="job-quick-actions">
            <a href={cleanHref(modal.href)}>Open Full Page</a>
            <button type="button" onClick={()=>setModal(null)} aria-label="Close quick view">×</button>
          </div>
        </div>
        <iframe src={modal.href} title={`${modal.title} quick view`} className="job-quick-frame"/>
      </div>
    </div>}
  </>;
}
