'use client';

import {useEffect,useState} from 'react';
import {api,fmtDate,requireToken} from '../lib/api';

type ActiveKey='BOOKING'|'SCHEDULE'|'ROUTING'|'CARRIER'|'SHIPMENT'|'CONTAINER'|'TRACKING'|'DOCUMENTS'|'PAYMENT'|'CARRIER_RATES';

type Props={
  bookingId:string;
  active?:ActiveKey;
};

export default function JobSummaryRail({bookingId,active}:Props){
  const [booking,setBooking]=useState<any>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!bookingId)return;
    const t=requireToken();
    if(!t)return;
    setError('');
    void api(`/bookings/${bookingId}`,t)
      .then(setBooking)
      .catch((e:any)=>setError(e?.message||'Unable to load job summary'));
  },[bookingId]);

  if(!bookingId)return null;

  const q=`?bookingId=${encodeURIComponent(bookingId)}`;
  const links=[
    ['BOOKING','Booking',`/bookings/${bookingId}`],
    ['SCHEDULE','Vessel Schedule',`/schedules${q}`],
    ['ROUTING','Routing',`/routing${q}`],
    ['CARRIER','Carrier Space',`/carrier-operations${q}`],
    ['SHIPMENT','Shipment / Consol',`/shipment-control${q}`],
    ['CONTAINER','Container Control',`/container-control${q}`],
    ['TRACKING','Tracking',`/tracking${q}`],
    ['DOCUMENTS','Documents',`/documents${q}`],
  ] as const;


  return <aside className="job-summary-rail" aria-label="Job summary and related pages">
    <section className="job-summary-card">
      <div className="job-summary-title">Job Summary</div>
      {error?<div className="job-summary-empty">{error}</div>:!booking?<div className="job-summary-empty">Loading job…</div>:<>
        <div className="job-summary-booking">
          <b>{booking.bookingNo||'Booking'}</b>
          <span className="status">{booking.status||'OPEN'}</span>
        </div>
        <RailRow label="Customer" value={booking.customer?.name||'—'}/>
        <RailRow label="Route" value={`${booking.origin||'—'} → ${booking.destination||'—'}`}/>
        <RailRow label="Carrier" value={booking.carrier||'—'}/>
        <RailRow label="Vessel" value={booking.vesselVoyage||'—'}/>
        <RailRow label="ETD / ETA" value={`${fmtDate(booking.etd)} / ${fmtDate(booking.eta)}`}/>
        <RailRow label="Equipment" value={`${booking.quantity||1} × ${booking.equipment||'—'}`}/>
        <RailRow label="Cargo" value={booking.commodity||booking.specialCargo||'—'}/>
        {booking.shipmentNo&&<RailRow label="Shipment" value={booking.shipmentNo}/>}
        {(booking.houseBL||booking.masterBL)&&<RailRow label="B/L" value={[booking.houseBL,booking.masterBL].filter(Boolean).join(' / ')}/>}
      </>}
    </section>

    <section className="job-summary-card">
      <div className="job-summary-title">Related Pages</div>
      <nav className="job-summary-links">
        {links.map(([key,label,href])=><a key={key} href={href} className={active===key?'active':''}>{label}</a>)}
        <a href="/rates">Rates / Quotes</a>
        {String(booking?.businessModel||'').toUpperCase()==='FORWARDING'&&<>
          <a className={active==='CARRIER_RATES'?'active':''} href={`/carrier-rates${q}`}>Carrier Rates</a>
          <a className={active==='PAYMENT'?'active':''} href={`/carrier-payment${q}`}>Carrier Payment</a>
        </>}
      </nav>
    </section>
  </aside>;
}

function RailRow({label,value}:{label:string;value:any}){
  return <div className="job-summary-row"><span>{label}</span><b title={String(value||'')}>{value||'—'}</b></div>;
}
