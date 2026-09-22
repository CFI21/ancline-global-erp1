import { BadRequestException } from '@nestjs/common';
import { ancCarrierReference, assertAncCarrierOutboundPayload } from '../src/modules/carrier-outbound-policy';

describe('ANC carrier outbound privacy policy',()=>{
  it('allows operational carrier payload fields',()=>{
    const payload={
      ancBookingRef:'ANC-BKG-12345',
      carrier:'MAEU',
      origin:'NLRTM',
      destination:'AEJEA',
      equipment:'40HC',
      quantity:2,
      commodity:'GENERAL CARGO',
      grossWeight:18500,
      schedule:{vessel:'ANCLINE TEST',voyage:'001E',etd:'2026-10-01T00:00:00.000Z'}
    };
    expect(assertAncCarrierOutboundPayload(payload)).toBe(payload);
  });

  it.each([
    {customerRef:'ANC-CUS-001'},
    {customer:{name:'Private Customer'}},
    {kycData:{registrationNo:'SECRET'}},
    {houseBL:'HBL-001'},
    {parties:{shipper:'Private Shipper'}},
    {nested:{consignee:'Private Consignee'}}
  ])('blocks private customer/house identity from carrier payload: %j',(payload)=>{
    expect(()=>assertAncCarrierOutboundPayload(payload)).toThrow(BadRequestException);
  });

  it('creates ANC-owned carrier references without exposing free text',()=>{
    expect(ancCarrierReference('bkg','12 345 / customer')).toBe('ANC-BKG-12345customer');
  });
});
