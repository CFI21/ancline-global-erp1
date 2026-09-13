import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwt:JwtService){}
  login(body:any){
    // Phase 3 dev login only. Replace with managed OIDC before staging.
    if(!body?.email) throw new UnauthorizedException('Email required');
    const role=body.role||'GLOBAL_ADMIN';
    const payload={
      sub: body.userId || body.email,
      email: body.email,
      role,
      branchId: body.branchId || null,
      agentId: body.agentId || null,
      customerId: body.customerId || null
    };
    return {accessToken:this.jwt.sign(payload),user:payload};
  }
}
