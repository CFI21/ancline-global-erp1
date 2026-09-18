import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GlobalCommerceService } from './global-commerce.service';

@Controller('global-commerce')
@UseGuards(JwtAuthGuard)
export class GlobalCommerceController {
  constructor(private s:GlobalCommerceService){}
  @Get('countries') countries(@Req() req:any){return this.s.countries(req.user);}
  @Post('countries/:code') setCountry(@Param('code') code:string,@Body() body:any,@Req() req:any){return this.s.setCountry(code,body,req.user);}
  @Get('offices') offices(@Req() req:any){return this.s.offices(req.user);}
  @Post('offices') setOffice(@Body() body:any,@Req() req:any){return this.s.setOffice(undefined,body,req.user);}
  @Post('offices/:id') updateOffice(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.s.setOffice(id,body,req.user);}
  @Get('locations') locations(@Req() req:any){return this.s.locations(req.user);}
  @Post('locations') setLocation(@Body() body:any,@Req() req:any){return this.s.setLocation(undefined,body,req.user);}
  @Post('locations/:code') updateLocation(@Param('code') code:string,@Body() body:any,@Req() req:any){return this.s.setLocation(code,body,req.user);}
  @Get('readiness') readiness(@Req() req:any){return this.s.readiness(req.user);}
  @Get('demo') demo(@Req() req:any){return this.s.demo(req.user);}
}
