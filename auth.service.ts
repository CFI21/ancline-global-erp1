import { Injectable, ServiceUnavailableException, TooManyRequestsException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { scryptSync, timingSafeEqual } from 'crypto';

type Attempt = { count:number; resetAt:number };

@Injectable()
export class AuthService {
  private attempts = new Map<string,Attempt>();
  constructor(private jwt:JwtService){}

  private allowedRole(role:string){
    return ['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE','AGENT','CUSTOMER'].includes(role);
  }

  private checkRateLimit(ip:string){
    const key=ip||'unknown';
    const now=Date.now();
    const current=this.attempts.get(key);
    if(!current || current.resetAt<=now){
      this.attempts.set(key,{count:0,resetAt:now+15*60_000});
      return;
    }
    if(current.count>=5) throw new TooManyRequestsException('Too many login attempts. Try again later.');
  }

  private recordFailure(ip:string){
    const key=ip||'unknown';
    const now=Date.now();
    const current=this.attempts.get(key);
    if(!current || current.resetAt<=now){
      this.attempts.set(key,{count:1,resetAt:now+15*60_000});
      return;
    }
    current.count+=1;
    this.attempts.set(key,current);
  }

  private clearFailures(ip:string){ this.attempts.delete(ip||'unknown'); }

  private verifyPassword(password:string,encoded:string){
    const parts=String(encoded||'').split('$');
    if(parts.length!==3 || parts[0]!=='scrypt') return false;
    try{
      const salt=Buffer.from(parts[1],'hex');
      const expected=Buffer.from(parts[2],'hex');
      const actual=scryptSync(password,salt,expected.length);
      return expected.length===actual.length && timingSafeEqual(expected,actual);
    }catch{return false;}
  }

  login(body:any,ip:string){
    const mode=String(process.env.AUTH_MODE||'oidc').toLowerCase();
    if(mode!=='staging-local'){
      throw new ServiceUnavailableException('Local login is disabled. Use managed OIDC.');
    }

    this.checkRateLimit(ip);
    const email=String(body?.email||'').trim().toLowerCase();
    const password=String(body?.password||'');
    const configuredEmail=String(process.env.DEV_AUTH_EMAIL||'').trim().toLowerCase();
    const passwordHash=String(process.env.DEV_AUTH_PASSWORD_HASH||'');
    const role=String(process.env.DEV_AUTH_ROLE||'GLOBAL_ADMIN');

    if(!configuredEmail || !passwordHash || !this.allowedRole(role)){
      throw new ServiceUnavailableException('Staging local authentication is not configured safely.');
    }

    const ok=email===configuredEmail && this.verifyPassword(password,passwordHash);
    if(!ok){
      this.recordFailure(ip);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.clearFailures(ip);

    const payload={
      sub: configuredEmail,
      email: configuredEmail,
      role,
      branchId: null,
      agentId: null,
      customerId: null
    };
    return {accessToken:this.jwt.sign(payload),user:payload};
  }
}
