import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt:JwtService,private prisma:PrismaService){}

  async canActivate(ctx:ExecutionContext){
    const req=ctx.switchToHttp().getRequest();
    const h=req.headers.authorization||'';
    const token=h.startsWith('Bearer ')?h.slice(7):null;
    if(!token) throw new UnauthorizedException('Missing bearer token');

    let claims:any;
    try{claims=this.jwt.verify(token);}catch{throw new UnauthorizedException('Invalid or expired token');}

    // Managed accounts are revalidated on every request. Deactivation and role/scope
    // changes therefore take effect immediately, even for an already-issued JWT.
    const account=claims?.sub?await this.prisma.userAccount.findUnique({where:{id:String(claims.sub)}}):null;
    if(account){
      if(!account.active) throw new UnauthorizedException('This ANCLINE account is inactive');
      req.user={
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
        authSource:claims.authSource||'MANAGED'
      };
      return true;
    }

    // Prevent a legacy/dev token from bypassing a newly provisioned managed account.
    if(claims?.email){
      const byEmail=await this.prisma.userAccount.findUnique({where:{email:String(claims.email).toLowerCase()}});
      if(byEmail) throw new UnauthorizedException('Your ANCLINE access has changed. Please sign in again.');
    }

    const devAllowed=String(process.env.ALLOW_DEV_LOGIN||'true').toLowerCase()!=='false';
    if(!devAllowed) throw new UnauthorizedException('Managed ANCLINE sign-in is required');

    const allowed=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER','SHIPPER','CONSIGNEE'];
    if(!allowed.includes(String(claims?.role||''))) throw new UnauthorizedException('Invalid ANCLINE role');
    req.user={...claims,managedAccount:false,authSource:claims.authSource||'DEV'};
    return true;
  }
}
