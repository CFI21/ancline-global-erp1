import { Injectable, UnauthorizedException } from '@nestjs/common';

type Discovery={authorization_endpoint?:string;token_endpoint?:string;userinfo_endpoint?:string};

@Injectable()
export class OidcService {
  private issuer=process.env.OIDC_ISSUER||'';
  private clientId=process.env.OIDC_CLIENT_ID||'';
  private redirectUri=process.env.OIDC_REDIRECT_URI||'http://localhost:3000/auth/callback';
  private cache:{at:number;data:Discovery}|null=null;

  private configured(){return Boolean(this.issuer&&this.clientId&&process.env.OIDC_CLIENT_SECRET&&this.redirectUri);}
  private discoveryUrl(){return this.issuer?`${this.issuer.replace(/\/$/,'')}/.well-known/openid-configuration`:'';}

  private async discovery():Promise<Discovery>{
    if(!this.configured()) throw new UnauthorizedException('OIDC is not configured');
    if(this.cache&&Date.now()-this.cache.at<300000)return this.cache.data;
    const r=await fetch(this.discoveryUrl(),{headers:{accept:'application/json'}});
    if(!r.ok) throw new UnauthorizedException('OIDC provider discovery failed');
    const data:any=await r.json();
    if(!data?.authorization_endpoint||!data?.token_endpoint||!data?.userinfo_endpoint)
      throw new UnauthorizedException('OIDC provider discovery is incomplete');
    this.cache={at:Date.now(),data};
    return data;
  }

  async configuration(){
    const base={
      issuer:this.issuer,
      clientId:this.clientId,
      redirectUri:this.redirectUri,
      configured:this.configured(),
      devLoginAllowed:String(process.env.ALLOW_DEV_LOGIN||'true').toLowerCase()!=='false',
      discoveryUrl:this.discoveryUrl()||null,
      authorizationEndpoint:null as string|null
    };
    if(!base.configured)return base;
    try{const d=await this.discovery();return {...base,authorizationEndpoint:d.authorization_endpoint||null};}
    catch{return base;}
  }

  validateConfiguration(){
    const missing:string[]=[];
    if(!this.issuer) missing.push('OIDC_ISSUER');
    if(!this.clientId) missing.push('OIDC_CLIENT_ID');
    if(!process.env.OIDC_CLIENT_SECRET) missing.push('OIDC_CLIENT_SECRET');
    if(!this.redirectUri) missing.push('OIDC_REDIRECT_URI');
    return {ok:missing.length===0,missing};
  }

  async exchangeCode(body:any){
    if(!this.configured()) throw new UnauthorizedException('OIDC is not configured');
    const code=String(body?.code||'').trim();
    const codeVerifier=String(body?.codeVerifier||'').trim();
    const redirectUri=String(body?.redirectUri||this.redirectUri).trim();
    if(!code||!codeVerifier) throw new UnauthorizedException('OIDC authorization code and PKCE verifier are required');
    if(redirectUri!==this.redirectUri) throw new UnauthorizedException('OIDC redirect URI mismatch');

    const d=await this.discovery();
    const form=new URLSearchParams({
      grant_type:'authorization_code',code,redirect_uri:this.redirectUri,
      client_id:this.clientId,client_secret:String(process.env.OIDC_CLIENT_SECRET),code_verifier:codeVerifier
    });
    const tokenRes=await fetch(String(d.token_endpoint),{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:form.toString()
    });
    if(!tokenRes.ok) throw new UnauthorizedException('OIDC token exchange failed');
    const token:any=await tokenRes.json();
    if(!token?.access_token) throw new UnauthorizedException('OIDC provider did not return an access token');

    const userRes=await fetch(String(d.userinfo_endpoint),{headers:{authorization:`Bearer ${token.access_token}`,accept:'application/json'}});
    if(!userRes.ok) throw new UnauthorizedException('OIDC user profile could not be retrieved');
    const profile:any=await userRes.json();
    if(!profile?.sub||!profile?.email) throw new UnauthorizedException('OIDC identity is missing subject or email');
    return {sub:String(profile.sub),email:String(profile.email).toLowerCase(),name:profile.name||profile.preferred_username||profile.email,emailVerified:profile.email_verified!==false};
  }
}
