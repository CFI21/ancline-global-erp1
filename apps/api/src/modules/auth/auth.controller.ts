import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private s:AuthService){}

  @Post('login') login(@Body() body:any){return this.s.login(body);}
  @Post('oidc/exchange') oidcExchange(@Body() body:any){return this.s.oidcLogin(body);}

  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@Req() req:any){return this.s.session(req.user);}
}
