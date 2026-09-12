import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private s:FinanceService){}
  @Get('booking/:bookingId') list(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.list(bookingId,req.user);}
  @Post() create(@Body() b:any,@Req() req:any){return this.s.create(b,req.user);}
  @Post(':id/status') status(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.status(id,b.status,req.user);}
}
