import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private s:AuthService){}
  @Post('login') login(@Body() body:any,@Req() req:any){
    const forwarded=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();
    return this.s.login(body,forwarded||req.ip||'unknown');
  }
}
