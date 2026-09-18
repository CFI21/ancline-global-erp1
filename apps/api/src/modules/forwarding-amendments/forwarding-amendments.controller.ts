import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ForwardingAmendmentsService } from './forwarding-amendments.service';

@Controller('forwarding-amendments')
@UseGuards(JwtAuthGuard)
export class ForwardingAmendmentsController {
  constructor(private s:ForwardingAmendmentsService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Get('booking/:bookingId') booking(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.forBooking(bookingId,req.user);}
  @Post('booking/:bookingId') create(@Param('bookingId') bookingId:string,@Body() body:any,@Req() req:any){return this.s.create(bookingId,body,req.user);}
  @Post(':id/decision') decision(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.s.decision(id,body,req.user);}
}
