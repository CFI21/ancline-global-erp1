import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CarrierPaymentService } from './carrier-payment.service';

@Controller('carrier-payment')
@UseGuards(JwtAuthGuard)
export class CarrierPaymentController {
  constructor(private s:CarrierPaymentService){}
  @Get('offices') offices(@Req() req:any){return this.s.offices(req.user);}
  @Get('booking/:bookingId') get(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.get(bookingId,req.user);}
  @Post('booking/:bookingId') set(@Param('bookingId') bookingId:string,@Body() body:any,@Req() req:any){return this.s.set(bookingId,body,req.user);}
}
