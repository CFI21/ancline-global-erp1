export type ScopeUser = {
  sub:string; email:string; role:string;
  branchId?:string|null; agentId?:string|null; customerId?:string|null; partyId?:string|null;
  costCenterCode?:string|null; agentMode?:string|null; permissions?:string[];
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
      if(!user.agentId)return {id:'__none__'};
      return Array.isArray(user.permissions)&&user.permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE')
        ? {OR:[
            {producingAgentId:user.agentId,businessModel:'NVOCC'},
            {customerId:user.agentId,businessModel:'FORWARDING',forwardingTradeType:'DIRECT_COLOAD_CROSS_TRADE'}
          ]}
        : {producingAgentId:user.agentId,businessModel:'NVOCC'};
    case 'CUSTOMER':
      return user.customerId ? { customerId:user.customerId } : { id:'__none__' };
    case 'SHIPPER':
    case 'CONSIGNEE':
      return user.partyId ? { customerId:user.partyId, businessModel:'FORWARDING' } : { id:'__none__' };
    default:
      return { id:'__none__' };
  }
}
