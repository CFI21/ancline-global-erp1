import { BookingsService } from '../src/modules/bookings/bookings.service';
import { PortalService } from '../src/modules/portal/portal.service';

const admin:any={sub:'admin-1',email:'admin@ancline.test',role:'GLOBAL_ADMIN'};
const customerUser:any={sub:'cust-user',email:'customer@ancline.test',role:'CUSTOMER',customerId:'cust-1'};

describe('Forwarding commercial and booking controls',()=>{
  it('blocks legacy direct Forwarding booking from the portal',async()=>{
    const service=new PortalService({} as any,{} as any,{} as any);
    await expect(service.directBooking({},customerUser)).rejects.toThrow(/cannot be created directly/i);
  });

  it('requires explicit ANC terms acceptance before creating a Forwarding booking',async()=>{
    const quote:any={
      id:'q-1',source:'FORWARDING_CARRIER:MAEU',validTo:new Date(Date.now()+86400000),
      carrierCode:'MAEU',carrierQuoteRef:'CQ-100',termsVersion:'ANC-FWD-TC-V1',
      customerId:'cust-1',customerRef:'ANC-CUS-001',costCenterCode:'FWD-NL',
      requestData:{forwardingTradeType:'STANDARD'},carrierOfferData:{offerId:'offer-1'},
      equipment:'40HC',currency:'USD',sellRate:1650
    };
    const prisma:any={rateQuote:{findUnique:jest.fn().mockResolvedValue(quote)}};
    const service=new PortalService(prisma,{} as any,{log:jest.fn()} as any);
    await expect(service.acceptForwardingQuote('q-1',{termsAccepted:false,termsVersion:'ANC-FWD-TC-V1'},customerUser))
      .rejects.toThrow(/terms must be accepted/i);
  });

  it('creates a scoped Forwarding booking only after quote acceptance and hides carrier internals from customer response',async()=>{
    const quote:any={
      id:'q-1',quoteNo:'ANC-FWD-Q-100',source:'FORWARDING_CARRIER:MAEU',
      validTo:new Date(Date.now()+86400000),carrierCode:'MAEU',carrierQuoteRef:'CQ-100',
      termsVersion:'ANC-FWD-TC-V1',customerId:'cust-1',customerRef:'ANC-CUS-001',
      costCenterCode:'FWD-NL',requestData:{
        forwardingTradeType:'STANDARD',bookingType:'FCL',transportMode:'SEA',serviceType:'PORT_TO_PORT',
        origin:'NLRTM',destination:'AEJEA',portOfLoading:'NLRTM',portOfDischarge:'AEJEA',
        quantity:1,commodity:'GENERAL CARGO',freightTerms:'PREPAID',customerReference:'PO-7788'
      },
      carrierOfferData:{
        offerId:'offer-1',carrier:'Demo Carrier',vessel:'ANC TEST',voyage:'001E',
        etd:new Date(Date.now()+2*86400000).toISOString(),eta:new Date(Date.now()+20*86400000).toISOString()
      },
      equipment:'40HC',currency:'USD',sellRate:1650
    };
    const customer:any={id:'cust-1',name:'Private Customer',active:true,kycStatus:'APPROVED',customerRef:'ANC-CUS-001',costCenterCode:'FWD-NL'};
    const tx:any={
      rateQuote:{update:jest.fn(async({data}:any)=>({...quote,...data}))},
      booking:{create:jest.fn(async({data}:any)=>({id:'b-1',...data}))},
      integrationEvent:{create:jest.fn().mockResolvedValue({id:'evt-1'})}
    };
    const prisma:any={
      rateQuote:{findUnique:jest.fn().mockResolvedValue(quote)},
      organization:{findUnique:jest.fn().mockResolvedValue(customer)},
      booking:{
        findFirst:jest.fn().mockResolvedValue(null),
        findMany:jest.fn().mockResolvedValue([{bookingNo:'10000'}]),
        findUnique:jest.fn().mockResolvedValue(null)
      },
      $transaction:jest.fn(async(fn:any)=>fn(tx))
    };
    const audit:any={log:jest.fn().mockResolvedValue(undefined)};
    const service=new PortalService(prisma,{} as any,audit);
    (service as any).autoForwardingCarrierBooking=jest.fn().mockResolvedValue({status:'PENDING_PAYMENT_CONTROL'});

    const result:any=await service.acceptForwardingQuote('q-1',{termsAccepted:true,termsVersion:'ANC-FWD-TC-V1'},customerUser);

    expect(tx.booking.create).toHaveBeenCalledWith({data:expect.objectContaining({
      bookingNo:'10001',businessModel:'FORWARDING',bookingChannel:'CUSTOMER_PORTAL',
      customerId:'cust-1',customerRef:'ANC-CUS-001',costCenterCode:'FWD-NL',
      status:'BOOKING_REQUESTED',rateQuoteId:'q-1'
    })});
    expect(result.booking).toEqual(expect.objectContaining({id:'b-1',bookingNo:'10001'}));
    expect(result.quote).toEqual(expect.objectContaining({quoteNo:'ANC-FWD-Q-100',status:'Customer Accepted'}));
    expect(result.quote.carrierCode).toBeUndefined();
    expect(result.quote.carrierQuoteRef).toBeUndefined();
    expect(result.automation).toEqual({status:'PENDING_PAYMENT_CONTROL'});
  });

  it('blocks internal Forwarding creation until the ANC quote is customer-accepted',async()=>{
    const prisma:any={
      rateQuote:{findUnique:jest.fn().mockResolvedValue({
        id:'q-2',customerId:'cust-1',status:'Quote Sent',carrierCode:'MAEU',carrierQuoteRef:'CQ-200'
      })},
      organization:{findUnique:jest.fn()},
      booking:{create:jest.fn()}
    };
    const scope:any={assertInternal:jest.fn()};
    const service=new BookingsService(prisma,scope,{log:jest.fn()} as any,{} as any);
    await expect(service.create({
      bookingNo:'12345',businessModel:'FORWARDING',customerId:'cust-1',rateQuoteId:'q-2',
      origin:'NLRTM',destination:'AEJEA'
    },admin)).rejects.toThrow(/only after the ANC quote is accepted/i);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('creates an internal Forwarding job from a valid accepted ANC quote and preserves the registered ANC customer controls',async()=>{
    const quote:any={
      id:'q-ok',customerId:'cust-1',status:'Customer Accepted',
      termsAcceptedAt:new Date(),termsAcceptedBy:'cust-user',
      carrierCode:'MAEU',carrierQuoteRef:'CQ-OK',customerRef:'ANC-CUS-001',
      costCenterCode:'FWD-NL',requestData:{forwardingTradeType:'CROSS_TRADE'}
    };
    const customer:any={id:'cust-1',active:true,kycStatus:'APPROVED',customerRef:'ANC-CUS-001',costCenterCode:'FWD-NL'};
    const prisma:any={
      rateQuote:{findUnique:jest.fn().mockResolvedValue(quote)},
      organization:{findUnique:jest.fn().mockResolvedValue(customer)},
      booking:{create:jest.fn(async({data}:any)=>({id:'b-ok',...data}))}
    };
    const scope:any={assertInternal:jest.fn()};
    const audit:any={log:jest.fn()};
    const service=new BookingsService(prisma,scope,audit,{} as any);
    const row:any=await service.create({
      bookingNo:'23456',businessModel:'FORWARDING',customerId:'cust-1',rateQuoteId:'q-ok',
      origin:'NLRTM',destination:'AEJEA',equipment:'40HC'
    },admin);
    expect(row).toEqual(expect.objectContaining({
      bookingNo:'23456',businessModel:'FORWARDING',bookingChannel:'INTERNAL',
      customerRef:'ANC-CUS-001',costCenterCode:'FWD-NL',jobType:'FORWARDING',
      forwardingTradeType:'CROSS_TRADE',status:'BOOKING_REQUESTED'
    }));
  });

  it('enforces exactly five numeric digits for ANCLINE internal job references',async()=>{
    const prisma:any={booking:{create:jest.fn()}};
    const service=new BookingsService(prisma,{assertInternal:jest.fn()} as any,{log:jest.fn()} as any,{} as any);
    await expect(service.create({bookingNo:'ABC12',businessModel:'NVOCC',customerId:'cust-1'},admin))
      .rejects.toThrow(/exactly 5 digits/i);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });
});
