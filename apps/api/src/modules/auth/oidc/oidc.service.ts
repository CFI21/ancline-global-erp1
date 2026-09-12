import { Injectable, UnauthorizedException } from '@nestjs/common';

type OidcUser = {
  sub:string;
  email:string;
  name?:string;
  role:string;
  branchId?:string|null;
  agentId?:string|null;
  customerId?:string|null;
};

@Injectable()
export class OidcService {
  private issuer=process.env.OIDC_ISSUER||'';
  private clientId=process.env.OIDC_CLIENT_ID||'';
  private redirectUri=process.env.OIDC_REDIRECT_URI||'http://localhost:3000/auth/callback';

  configuration(){
    return {
      issuer:this.issuer,
      clientId:this.clientId,
      redirectUri:this.redirectUri,
      configured:Boolean(this.issuer&&this.clientId&&process.env.OIDC_CLIENT_SECRET),
      discoveryUrl:this.issuer ? `${this.issuer.replace(/\/$/,'')}/.well-known/openid-configuration` : null
    };
  }

  validateConfiguration(){
    const missing:string[]=[];
    if(!this.issuer) missing.push('OIDC_ISSUER');
    if(!this.clientId) missing.push('OIDC_CLIENT_ID');
    if(!process.env.OIDC_CLIENT_SECRET) missing.push('OIDC_CLIENT_SECRET');
    if(!this.redirectUri) missing.push('OIDC_REDIRECT_URI');
    return {ok:missing.length===0,missing};
  }

  mapClaims(claims:any):OidcUser{
    if(!claims?.sub || !claims?.email) throw new UnauthorizedException('OIDC claims incomplete');
    const role=claims.role||claims['ancline:role']||'CUSTOMER';
    const allowed=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER'];
    if(!allowed.includes(role)) throw new UnauthorizedException('Unsupported ANCLINE role claim');
    return {
      sub:claims.sub,
      email:claims.email,
      name:claims.name,
      role,
      branchId:claims.branchId||claims['ancline:branchId']||null,
      agentId:claims.agentId||claims['ancline:agentId']||null,
      customerId:claims.customerId||claims['ancline:customerId']||null
    };
  }
}
