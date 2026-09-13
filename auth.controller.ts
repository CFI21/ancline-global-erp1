import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private s:AuthService){}
  @Post('login') login(@Body() body:any){return this.s.login(body);}
}
