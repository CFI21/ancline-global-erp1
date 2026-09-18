import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private s:PortalService){}
  @Get('bookings') bookings(@Req() req:any){return this.s.bookings(req.user);}
  @Get('forwarding/quotes') forwardingQuotes(@Req() req:any){return this.s.forwardingQuotes(req.user);}
  @Get('nvocc/bookings') nvoccBookings(@Req() req:any){return this.s.nvoccBookings(req.user);}
  @Get('nvocc/parties') nvoccParties(@Req() req:any){return this.s.nvoccParties(req.user);}
  @Get('nvocc/documents') nvoccDocuments(@Req() req:any){return this.s.nvoccDocuments(req.user);}
  @Get('customers') customers(@Req() req:any){return this.s.customers(req.user);}
  @Post('bookings') createBooking(@Body() body:any,@Req() req:any){return this.s.directBooking(body,req.user);}
  @Post('nvocc/bookings') createNvoccBooking(@Body() body:any,@Req() req:any){return this.s.nvoccDirectBooking(body,req.user);}
  @Get('nvocc/bookings/:id/rates') nvoccRates(@Param('id') id:string,@Req() req:any){return this.s.nvoccRates(id,req.user);}
  @Post('nvocc/bookings/:id/select-rate/:rateId') nvoccSelectRate(@Param('id') id:string,@Param('rateId') rateId:string,@Req() req:any){return this.s.nvoccSelectRate(id,rateId,req.user);}
  @Post('bookings/:id/accept-quote') acceptQuote(@Param('id') id:string,@Req() req:any){return this.s.acceptQuote(id,req.user);}
  @Post('forwarding/quotes/:quoteId/accept') acceptForwardingQuote(@Param('quoteId') quoteId:string,@Body() body:any,@Req() req:any){return this.s.acceptForwardingQuote(quoteId,body,req.user);}
  @Post('bookings/:id/submit-carrier-booking') submitForwardingCarrierBooking(@Param('id') id:string,@Req() req:any){return this.s.submitForwardingCarrierBooking(id,req.user);}
  @Post('nvocc/bookings/:id/accept-quote') acceptNvoccQuote(@Param('id') id:string,@Req() req:any){return this.s.nvoccAcceptQuote(id,req.user);}
  @Get('bookings/:id/release-security') releaseSecurity(@Param('id') id:string,@Req() req:any){return this.s.releaseSecurity(id,req.user);}
}
