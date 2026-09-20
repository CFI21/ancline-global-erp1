'use client';

type Stage='CARRIER_RATE'|'ANC_QUOTE'|'BOOKING';

type Props={
  active:Stage;
  bookingId?:string;
  bookingNo?:string;
  quoteNo?:string;
  carrier?:string;
  quoteStatus?:string;
  buyLabel?:string;
  sellLabel?:string;
};

export default function CommercialFlowGrid({
  active,bookingId='',bookingNo='',quoteNo='',carrier='',quoteStatus='',buyLabel='',sellLabel=''
}:Props){
  const q=bookingId?`?bookingId=${encodeURIComponent(bookingId)}`:'';
  const cards=[
    {
      key:'CARRIER_RATE' as Stage,
      step:'01',
      title:'Carrier Rate',
      subtitle:'Procure / compare carrier buy rates',
      href:bookingId?`/carrier-rates${q}`:'/carrier-rates',
      meta:carrier||buyLabel||'Search carrier offers',
      action:'Open Carrier Rates'
    },
    {
      key:'ANC_QUOTE' as Stage,
      step:'02',
      title:'ANC Quote',
      subtitle:'Apply margin, validity and customer sell',
      href:bookingId?`/rates${q}`:'/rates',
      meta:quoteNo?[`Quote ${quoteNo}`,quoteStatus].filter(Boolean).join(' · '):(sellLabel||'Create / manage ANC quote'),
      action:'Open ANC Quotes'
    },
    {
      key:'BOOKING' as Stage,
      step:'03',
      title:'Booking',
      subtitle:'Convert accepted commercial offer to job',
      href:bookingId?`/bookings/${bookingId}`:'/bookings',
      meta:bookingNo?`Booking ${bookingNo}`:'Create / open booking',
      action:bookingId?'Open Booking':'Open Bookings'
    },
  ];

  return <section className="commercial-flow-section" aria-label="Carrier rate to ANC quote to booking">
    <div className="commercial-flow-title">
      <div><b>Commercial Flow</b><span>Carrier Rate → ANC Quote → Booking</span></div>
      {bookingNo&&<span className="commercial-flow-context">{bookingNo}</span>}
    </div>
    <div className="commercial-flow-grid">
      {cards.map((card,index)=><div className={'commercial-flow-card'+(active===card.key?' active':'')} key={card.key}>
        <div className="commercial-flow-step"><span>{card.step}</span><b>{card.title}</b></div>
        <div className="commercial-flow-subtitle">{card.subtitle}</div>
        <div className="commercial-flow-meta" title={card.meta}>{card.meta}</div>
        <a href={card.href}>{card.action}</a>
        {index<cards.length-1&&<span className="commercial-flow-arrow" aria-hidden="true">→</span>}
      </div>)}
    </div>
  </section>;
}
