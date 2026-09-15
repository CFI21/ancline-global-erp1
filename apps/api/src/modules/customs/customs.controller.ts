import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomsService } from './customs.service';

@UseGuards(JwtAuthGuard)
@Controller('customs')
export class CustomsController {
  constructor(private service:CustomsService){}
  @Get() list(@Req() req:any){return this.service.list(req.user);}
  @Get('booking/:bookingId') forBooking(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.forBooking(bookingId,req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.update(id,body,req.user);}
  @Post(':id/status/:status') transition(@Param('id') id:string,@Param('status') status:string,@Req() req:any){return this.service.transition(id,status,req.user);}
}
