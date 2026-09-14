import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private jwt:JwtService,private prisma:PrismaService){}

  async login(body:any){
    if(!body?.email) throw new UnauthorizedException('Email required');
    const email=String(body.email).trim().toLowerCase();
    const account=await this.prisma.userAccount.findUnique({where:{email}});

    if(account){
      if(!account.active) throw new UnauthorizedException('This ANCLINE account is inactive');
      const payload={
        sub:account.id,
        email:account.email,
        role:account.role,
        branchId:account.branchId||null,
        agentId:account.agentId||null,
        customerId:account.customerId||null
      };
      return {accessToken:this.jwt.sign(payload),user:payload,managedAccount:true};
    }

    // Development fallback keeps the current environment usable until managed OIDC is configured.
    // Once ALLOW_DEV_LOGIN=false, only provisioned UserAccount / OIDC identities can sign in.
    if(String(process.env.ALLOW_DEV_LOGIN||'true').toLowerCase()==='false')
      throw new UnauthorizedException('No active ANCLINE account is provisioned for this email');

    const role=String(body.role||'GLOBAL_ADMIN');
    const payload={
      sub:body.userId||email,
      email,
      role,
      branchId:body.branchId||null,
      agentId:body.agentId||null,
      customerId:body.customerId||null
    };
    return {accessToken:this.jwt.sign(payload),user:payload,managedAccount:false};
  }
}
