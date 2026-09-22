'use client';

type Props={
  bookingId?:string;
  bookingNo?:string;
  active?:'BOOKING'|'SCHEDULE'|'ROUTING'|'CARRIER'|'PAYMENT'|'SHIPMENT'|'CONTAINERS'|'TRACKING'|'EXCEPTIONS'|'DOCUMENTS'|'FINANCE'|'TASKS'|'APPROVALS';
};

export default function JobFlowNav({bookingId='',bookingNo='',active}:Props){
  const q=bookingId?`?bookingId=${encodeURIComponent(bookingId)}`:'';
  const links=[
    {key:'BOOKING',label:'Booking',href:bookingId?`/bookings/${bookingId}`:'/bookings'},
    {key:'SCHEDULE',label:'Vessel Schedule',href:`/schedules${q}`},
    {key:'ROUTING',label:'Routing',href:`/routing${q}`},
    {key:'CARRIER',label:'Carrier Space',href:`/carrier-operations${q}`},
    {key:'PAYMENT',label:'Carrier Payer',href:`/carrier-payment${q}`},
    {key:'SHIPMENT',label:'Shipment / Consol',href:`/shipment-control${q}`},
    {key:'CONTAINERS',label:'Containers',href:`/container-control${q}`},
    {key:'TRACKING',label:'Tracking',href:`/tracking${q}`},
    {key:'EXCEPTIONS',label:'Exceptions',href:`/exceptions${q}`},
    {key:'DOCUMENTS',label:'Documents',href:`/documents${q}`},
    {key:'FINANCE',label:'Finance',href:`/finance${q}`},
    {key:'TASKS',label:'Tasks',href:`/tasks${q}`},
    {key:'APPROVALS',label:'Approvals',href:`/approvals${q}`},
  ] as const;

  return <div className="job-flow-nav">
    <div className="job-flow-context">
      <span>JOB FLOW</span>
      <b>{bookingNo||bookingId||'Booking context'}</b>
    </div>
    <div className="job-flow-links">
      {links.map(x=><a key={x.key} href={x.href} className={active===x.key?'active':''}>{x.label}</a>)}
    </div>
  </div>;
}
