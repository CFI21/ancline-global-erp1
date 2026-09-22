import { AuthService } from '../src/modules/auth/auth.service';

describe('managed transitional login',()=>{
  const make=()=>{
    const jwt:any={sign:jest.fn(()=> 'signed-token')};
    const prisma:any={userAccount:{findUnique:jest.fn()}};
    const oidc:any={};
    return {service:new AuthService(jwt,prisma,oidc),jwt,prisma};
  };

  it('uses the provisioned managed role and scope instead of conflicting UI input',async()=>{
    const {service,prisma}=make();
    prisma.userAccount.findUnique.mockResolvedValue({
      id:'managed-shipper',email:'test.shipper.nl@ancline.invalid',displayName:'Synthetic Shipper',
      role:'SHIPPER',active:true,branchId:null,agentId:null,customerId:null,partyId:'test-customer',
      costCenterCode:'TEST-FWD-NL',agentMode:null,permissions:['FORWARDING_PORTAL']
    });
    const result:any=await service.login({
      email:'test.shipper.nl@ancline.invalid',
      role:'GLOBAL_ADMIN',
      partyId:'wrong-party'
    });
    expect(result.managedAccount).toBe(true);
    expect(result.authSource).toBe('TRANSITIONAL_MANAGED');
    expect(result.user.role).toBe('SHIPPER');
    expect(result.user.partyId).toBe('test-customer');
    expect(result.user.managedAccount).toBe(true);
  });

  it('keeps unmanaged scoped roles fail-closed when the required scope is missing',async()=>{
    const {service,prisma}=make();
    prisma.userAccount.findUnique.mockResolvedValue(null);
    await expect(service.login({email:'unmanaged@ancline.invalid',role:'SHIPPER'}))
      .rejects.toThrow('Forwarding party organization is required');
  });
});
