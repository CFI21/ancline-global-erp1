import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private s:PortalService){}
  @Get('bookings') bookings(@Req() req:any){return this.s.bookings(req.user);}
  @Get('customers') customers(@Req() req:any){return this.s.customers(req.user);}
  @Post('bookings') createBooking(@Body() body:any,@Req() req:any){return this.s.directBooking(body,req.user);}
  @Post('bookings/:id/accept-quote') acceptQuote(@Param('id') id:string,@Req() req:any){return this.s.acceptQuote(id,req.user);}
  @Get('bookings/:id/release-security') releaseSecurity(@Param('id') id:string,@Req() req:any){return this.s.releaseSecurity(id,req.user);}
}
