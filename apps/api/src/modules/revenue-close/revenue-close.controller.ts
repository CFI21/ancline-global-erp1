import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RevenueCloseService } from './revenue-close.service';

@UseGuards(JwtAuthGuard)
@Controller('revenue-close')
export class RevenueCloseController {
  constructor(private service:RevenueCloseService){}
  @Get('dashboard') dashboard(@Query('period') period:string,@Req() req:any){return this.service.dashboard(period,req.user);}
  @Get('policies') policies(@Req() req:any){return this.service.policies(req.user);}
  @Post('policies') setPolicy(@Body() body:any,@Req() req:any){return this.service.setPolicy(body,req.user);}
  @Get('bookings') bookings(@Query('period') period:string,@Req() req:any){return this.service.bookingReadiness(period,req.user);}
  @Post('bookings/:bookingId/recognize') recognize(@Param('bookingId') bookingId:string,@Body() body:any,@Req() req:any){return this.service.recognize(bookingId,body,req.user);}
  @Get('close-pack/:period') closePack(@Param('period') period:string,@Req() req:any){return this.service.closePack(period,req.user);}
  @Post('close-pack/:period/snapshot') snapshot(@Param('period') period:string,@Req() req:any){return this.service.snapshot(period,req.user);}
}
