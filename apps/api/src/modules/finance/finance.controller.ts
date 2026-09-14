import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private s:FinanceService){}
  @Get('booking/:bookingId') list(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.list(bookingId,req.user);}
  @Get('booking/:bookingId/summary') summary(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.summary(bookingId,req.user);}
  @Post('booking/:bookingId/sync-quote') syncQuote(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.syncQuote(bookingId,req.user);}
  @Post('booking/:bookingId/finalize') finalizeBooking(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.finalizeBooking(bookingId,req.user);}
  @Post() create(@Body() b:any,@Req() req:any){return this.s.create(b,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.update(id,b,req.user);}
  @Post(':id/status') status(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.status(id,b.status,req.user);}
  @Post(':id/invoice-ready') invoiceReady(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.invoiceReady(id,b,req.user);}
}
