export type ScopeUser = {
  sub:string; email:string; role:string;
  branchId?:string|null; agentId?:string|null; customerId?:string|null; partyId?:string|null;
};

export function bookingScope(user:ScopeUser){
  switch(user.role){
    case 'GLOBAL_ADMIN':
    case 'CONTROL_TOWER':
    case 'FINANCE':
      return {};
    case 'BRANCH_OPS':
      return user.branchId ? { owningBranchId:user.branchId } : { id:'__none__' };
    case 'AGENT':
      return user.agentId ? { producingAgentId:user.agentId } : { id:'__none__' };
    case 'CUSTOMER':
      return user.customerId ? { customerId:user.customerId } : { id:'__none__' };
    case 'SHIPPER':
    case 'CONSIGNEE':
      return user.partyId ? { customerId:user.partyId, businessModel:'FORWARDING' } : { id:'__none__' };
    default:
      return { id:'__none__' };
  }
}
