'use client';

import {useEffect,useState} from 'react';

type Active='BOOKING'|'SCHEDULE'|'ROUTING'|'CARRIER'|'SHIPMENT'|'DOCUMENTS';

type Props={
  bookingId:string;
  bookingNo?:string;
  active?:Active;
  customer?:string;
  route?:string;
  carrier?:string;
  vessel?:string;
  equipment?:string;
  status?:string;
  etd?:string;
  eta?:string;
};

export default function JobContextRail({
  bookingId,bookingNo='',active,customer='',route='',carrier='',vessel='',equipment='',status='',etd='',eta=''
}:Props){
  const [modal,setModal]=useState<{title:string;href:string}|null>(null);
  const [embedded,setEmbedded]=useState(false);

  useEffect(()=>{
    const isEmbedded=new URLSearchParams(location.search).get('embed')==='1';
    setEmbedded(isEmbedded);
    if(!isEmbedded)document.body.classList.add('has-job-context-rail');
    return ()=>document.body.classList.remove('has-job-context-rail');
  },[]);

  useEffect(()=>{
    if(!modal)return;
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(null);};
    window.addEventListener('keydown',close);
    return ()=>window.removeEventListener('keydown',close);
  },[modal]);

  if(embedded||!bookingId)return null;

  const q=`bookingId=${encodeURIComponent(bookingId)}`;
  const pages=[
    {key:'BOOKING' as Active,label:'Booking',href:`/bookings/${bookingId}`},
    {key:'QUOTE',label:'Quote / Rates',href:`/rates?${q}`},
    {key:'SCHEDULE' as Active,label:'Vessel Schedule',href:`/schedules?${q}`},
    {key:'ROUTING' as Active,label:'Routing',href:`/routing?${q}`},
    {key:'CARRIER' as Active,label:'Carrier Space',href:`/carrier-operations?${q}`},
    {key:'SHIPMENT' as Active,label:'Shipment / Consol',href:`/shipment-control?${q}`},
    {key:'DOCUMENTS' as Active,label:'Documents',href:`/documents?${q}`},
    {key:'CONTAINERS',label:'Container Control',href:`/container-control?${q}`},
  ];

  const quickHref=(href:string)=>href.includes('?')?`${href}&embed=1`:`${href}?embed=1`;
  const rows=[
    ['Customer',customer||'—'],
    ['Route',route||'—'],
    ['Carrier',carrier||'—'],
    ['Vessel / Voyage',vessel||'—'],
    ['Equipment',equipment||'—'],
    ['Status',status||'—'],
    ['ETD',etd||'—'],
    ['ETA',eta||'—'],
  ];

  return <>
    <aside className="job-context-rail">
      <div className="job-context-head">
        <span>JOB SUMMARY</span>
        <b>{bookingNo||bookingId}</b>
      </div>
      <div className="job-context-summary">
        {rows.map(([label,value])=><div className="job-context-row" key={label}><span>{label}</span><b title={value}>{value}</b></div>)}
      </div>
      <div className="job-context-section-title">Related Pages</div>
      <div className="job-context-links">
        {pages.map(p=><div className={'job-context-link'+(active===p.key?' active':'')} key={p.key}>
          <a href={p.href}>{p.label}</a>
          <button type="button" title={`Quick View ${p.label}`} onClick={()=>setModal({title:p.label,href:quickHref(p.href)})}>▣</button>
        </div>)}
      </div>
      <div className="job-context-help">▣ opens Quick View without leaving this page.</div>
    </aside>

    {modal&&<div className="job-quick-overlay" role="dialog" aria-modal="true" aria-label={modal.title} onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}>
      <div className="job-quick-modal">
        <div className="job-quick-head">
          <div><span>QUICK VIEW</span><b>{modal.title} · {bookingNo||bookingId}</b></div>
          <div className="job-quick-actions">
            <a href={modal.href.replace(/[?&]embed=1/,'').replace('?&','?')}>Open Page</a>
            <button type="button" onClick={()=>setModal(null)}>×</button>
          </div>
        </div>
        <iframe src={modal.href} title={`${modal.title} quick view`} className="job-quick-frame"/>
      </div>
    </div>}
  </>;
}
