import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('schedules')
@UseGuards(JwtAuthGuard)
export class SchedulesController {
  constructor(private s:SchedulesService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.s.create(body,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.s.update(id,body,req.user);}
  @Delete(':id') remove(@Param('id') id:string,@Req() req:any){return this.s.remove(id,req.user);}
  @Post(':id/apply-to-booking') apply(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.s.applyToBooking(id,String(body?.bookingId||''),req.user);}
}
