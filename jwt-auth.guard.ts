import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt:JwtService){}
  canActivate(ctx:ExecutionContext){
    const req=ctx.switchToHttp().getRequest();
    const h=String(req.headers.authorization||'');
    const token=h.startsWith('Bearer ')?h.slice(7).trim():null;
    if(!token) throw new UnauthorizedException('Missing bearer token');
    try{
      const user=this.jwt.verify(token,{issuer:'ancline-api',audience:'ancline-web'});
      if(!user?.sub || !user?.email || !user?.role) throw new Error('Incomplete token');
      req.user=user;
      return true;
    }catch{
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
