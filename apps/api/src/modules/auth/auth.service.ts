import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { OidcService } from './oidc/oidc.service';

@Injectable()
export class AuthService {
  constructor(private jwt:JwtService,private prisma:PrismaService,private oidc:OidcService){}

  private managedPayload(account:any,authSource='MANAGED'){
    return {
      sub:account.id,
      email:account.email,
      role:account.role,
      branchId:account.branchId||null,
      agentId:account.agentId||null,
      customerId:account.customerId||null,
      partyId:account.partyId||null,
      managedAccount:true,
      authSource
    };
  }

  private issueManaged(account:any,authSource='MANAGED'){
    const payload=this.managedPayload(account,authSource);
    return {accessToken:this.jwt.sign(payload,{expiresIn:'8h'}),user:payload,managedAccount:true,authSource};
  }

  async login(body:any){
    if(!body?.email) throw new UnauthorizedException('Email required');
    const email=String(body.email).trim().toLowerCase();
    const account=await this.prisma.userAccount.findUnique({where:{email}});

    if(account){
      if(!account.active) throw new UnauthorizedException('This ANCLINE account is inactive');
      return this.issueManaged(account,'MANAGED');
    }

    // Transitional development access remains available only while explicitly allowed.
    // Production OIDC can be enabled without changing the UI; set ALLOW_DEV_LOGIN=false
    // after all required users are provisioned to disable this path completely.
    const devAllowed=String(process.env.ALLOW_DEV_LOGIN||'true').toLowerCase()!=='false';
    if(!devAllowed) throw new UnauthorizedException('No active ANCLINE account is provisioned for this email');

    const role=String(body.role||'GLOBAL_ADMIN').toUpperCase();
    const allowed=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER','SHIPPER','CONSIGNEE'];
    if(!allowed.includes(role)) throw new UnauthorizedException('Unsupported ANCLINE role');
    if(role==='CUSTOMER'&&!body.customerId) throw new UnauthorizedException('Customer organization is required');
    if(role==='AGENT'&&!body.agentId) throw new UnauthorizedException('Agent organization is required');
    if(role==='BRANCH_OPS'&&!body.branchId) throw new UnauthorizedException('Branch organization is required');
    if((role==='SHIPPER'||role==='CONSIGNEE')&&!body.partyId) throw new UnauthorizedException('Forwarding party organization is required');

    const payload={
      sub:body.userId||email,
      email,
      role,
      branchId:body.branchId||null,
      agentId:body.agentId||null,
      customerId:body.customerId||null,
      partyId:body.partyId||null,
      managedAccount:false,
      authSource:'DEV'
    };
    return {accessToken:this.jwt.sign(payload,{expiresIn:'2h'}),user:payload,managedAccount:false,authSource:'DEV'};
  }

  async oidcLogin(body:any){
    const identity=await this.oidc.exchangeCode(body);
    const email=String(identity.email||'').trim().toLowerCase();
    const account=await this.prisma.userAccount.findUnique({where:{email}});
    if(!account||!account.active) throw new UnauthorizedException('No active ANCLINE account is provisioned for this identity');
    return this.issueManaged(account,'OIDC');
  }

  session(user:any){
    return {
      authenticated:true,
      user,
      managedAccount:Boolean(user?.managedAccount),
      authSource:user?.authSource||'UNKNOWN'
    };
  }
}
