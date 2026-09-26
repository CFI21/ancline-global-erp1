import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { OidcService } from './oidc/oidc.service';
import { scryptSync, timingSafeEqual } from 'crypto';

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
      costCenterCode:account.costCenterCode||null,
      agentMode:account.agentMode||null,
      permissions:Array.isArray(account.permissions)?account.permissions:[],
      managedAccount:true,
      authSource
    };
  }

  private issueManaged(account:any,authSource='MANAGED'){
    const payload=this.managedPayload(account,authSource);
    return {accessToken:this.jwt.sign(payload,{expiresIn:'8h'}),user:payload,managedAccount:true,authSource};
  }

  private verifyStagingPassword(password:string,encoded:string){
    const parts=String(encoded||'').split('
    if(!body?.email) throw new UnauthorizedException('Email required');
    const email=String(body.email).trim().toLowerCase();
    const devAllowed=String(process.env.ALLOW_DEV_LOGIN||'true').toLowerCase()!=='false';
    const configuredEmail=String(process.env.DEV_AUTH_EMAIL||'').trim().toLowerCase();
    const configuredHash=String(process.env.DEV_AUTH_PASSWORD_HASH||'');
    const configuredRole=String(process.env.DEV_AUTH_ROLE||'GLOBAL_ADMIN').toUpperCase();

    if(devAllowed&&configuredEmail&&email===configuredEmail){
      const password=String(body?.password||'');
      if(!configuredHash||!this.verifyStagingPassword(password,configuredHash)) throw new UnauthorizedException('Invalid credentials');
      const allowed=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER','SHIPPER','CONSIGNEE'];
      if(!allowed.includes(configuredRole)) throw new UnauthorizedException('Unsupported ANCLINE role');
      const payload={sub:configuredEmail,email:configuredEmail,role:configuredRole,branchId:null,agentId:null,customerId:null,partyId:null,costCenterCode:null,agentMode:null,permissions:[],managedAccount:false,authSource:'STAGING_LOCAL'};
      return {accessToken:this.jwt.sign(payload,{expiresIn:'2h'}),user:payload,managedAccount:false,authSource:'STAGING_LOCAL'};
    }

    const account=await this.prisma.userAccount.findUnique({where:{email}});
    if(account){
      if(!account.active) throw new UnauthorizedException('This ANCLINE account is inactive');
      if(!devAllowed) throw new UnauthorizedException('Email-only ANCLINE login is disabled. Use secure identity sign-in.');
      return this.issueManaged(account,'TRANSITIONAL_MANAGED');
    }

    // Transitional access remains available only while explicitly allowed.
    // Set ALLOW_DEV_LOGIN=false after secure identity is configured and all users are provisioned.
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
      costCenterCode:body.costCenterCode||null,
      agentMode:role==='AGENT'?'LINER_AGENCY_ONLY':null,
      permissions:Array.isArray(body.permissions)?body.permissions:[],
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
);
    if(parts.length!==3||parts[0]!=='scrypt') return false;
    try{
      const salt=Buffer.from(parts[1],'hex');
      const expected=Buffer.from(parts[2],'hex');
      const actual=scryptSync(password,salt,expected.length);
      return expected.length===actual.length&&timingSafeEqual(expected,actual);
    }catch{return false;}
  }

  async login(body:any){
    if(!body?.email) throw new UnauthorizedException('Email required');
    const email=String(body.email).trim().toLowerCase();
    const account=await this.prisma.userAccount.findUnique({where:{email}});

    const devAllowed=String(process.env.ALLOW_DEV_LOGIN||'true').toLowerCase()!=='false';
    if(account){
      if(!account.active) throw new UnauthorizedException('This ANCLINE account is inactive');
      if(!devAllowed) throw new UnauthorizedException('Email-only ANCLINE login is disabled. Use secure identity sign-in.');
      return this.issueManaged(account,'TRANSITIONAL_MANAGED');
    }

    // Transitional access remains available only while explicitly allowed.
    // Set ALLOW_DEV_LOGIN=false after secure identity is configured and all users are provisioned.
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
      costCenterCode:body.costCenterCode||null,
      agentMode:role==='AGENT'?'LINER_AGENCY_ONLY':null,
      permissions:Array.isArray(body.permissions)?body.permissions:[],
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
