import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector:Reflector){}
  canActivate(ctx:ExecutionContext){
    const required=this.reflector.getAllAndOverride<string[]>(ROLES_KEY,[ctx.getHandler(),ctx.getClass()]);
    if(!required?.length) return true;
    const user=ctx.switchToHttp().getRequest().user;
    if(!user || !required.includes(user.role)) throw new ForbiddenException('Role not allowed');
    return true;
  }
}
