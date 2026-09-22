import { bookingScope } from '../src/modules/auth/scope';

describe('bookingScope',()=>{
  it('allows global admin to see all',()=>expect(bookingScope({sub:'1',email:'a',role:'GLOBAL_ADMIN'} as any)).toEqual({}));

  it('scopes a normal agent to its NVOCC bookings',()=>expect(
    bookingScope({sub:'1',email:'a',role:'AGENT',agentId:'agt1'} as any)
  ).toEqual({producingAgentId:'agt1',businessModel:'NVOCC'}));

  it('allows an authorized agent to see NVOCC plus forwarding direct/cross-trade work',()=>expect(
    bookingScope({
      sub:'1',email:'a',role:'AGENT',agentId:'agt1',
      permissions:['FORWARDING_DIRECT_COLOAD_CROSS_TRADE']
    } as any)
  ).toEqual({OR:[
    {producingAgentId:'agt1',businessModel:'NVOCC'},
    {customerId:'agt1',businessModel:'FORWARDING',forwardingTradeType:{in:['DIRECT_COLOAD','CROSS_TRADE']}}
  ]}));

  it('scopes customer',()=>expect(
    bookingScope({sub:'1',email:'a',role:'CUSTOMER',customerId:'cus1'} as any)
  ).toEqual({customerId:'cus1'}));

  it('scopes shipper and consignee to Forwarding jobs for their party',()=>{
    expect(bookingScope({sub:'1',email:'s',role:'SHIPPER',partyId:'party1'} as any))
      .toEqual({customerId:'party1',businessModel:'FORWARDING'});
    expect(bookingScope({sub:'2',email:'c',role:'CONSIGNEE',partyId:'party1'} as any))
      .toEqual({customerId:'party1',businessModel:'FORWARDING'});
  });

  it('fails closed when an external role has no scope id',()=>{
    expect(bookingScope({sub:'1',email:'a',role:'AGENT'} as any)).toEqual({id:'__none__'});
    expect(bookingScope({sub:'1',email:'c',role:'CUSTOMER'} as any)).toEqual({id:'__none__'});
    expect(bookingScope({sub:'1',email:'s',role:'SHIPPER'} as any)).toEqual({id:'__none__'});
  });
});
