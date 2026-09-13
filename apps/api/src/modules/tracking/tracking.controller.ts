import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly service:TrackingService){}
  @Get() list(@Req() req:any){return this.service.list(req.user);}
  @Get('booking/:bookingId') byBooking(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.byBooking(bookingId,req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.update(id,body,req.user);}
  @Post(':id/complete') complete(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.complete(id,body,req.user);}
  @Delete(':id') remove(@Param('id') id:string,@Req() req:any){return this.service.remove(id,req.user);}
}
