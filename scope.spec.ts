import { bookingScope } from '../src/modules/auth/scope';

describe('bookingScope',()=>{
  it('allows global admin to see all',()=>expect(bookingScope({sub:'1',email:'a',role:'GLOBAL_ADMIN'} as any)).toEqual({}));
  it('scopes agent',()=>expect(bookingScope({sub:'1',email:'a',role:'AGENT',agentId:'agt1'} as any)).toEqual({producingAgentId:'agt1'}));
  it('scopes customer',()=>expect(bookingScope({sub:'1',email:'a',role:'CUSTOMER',customerId:'cus1'} as any)).toEqual({customerId:'cus1'}));
});
