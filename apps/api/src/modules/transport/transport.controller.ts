import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TransportService } from './transport.service';

@UseGuards(JwtAuthGuard)
@Controller('transport-orders')
export class TransportController {
  constructor(private service:TransportService){}
  @Get() list(@Req() req:any){return this.service.list(req.user);}
  @Get('booking/:bookingId') forBooking(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.forBooking(bookingId,req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.update(id,body,req.user);}
  @Post(':id/dispatch') dispatch(@Param('id') id:string,@Req() req:any){return this.service.dispatch(id,req.user);}
  @Post(':id/pickup') pickup(@Param('id') id:string,@Req() req:any){return this.service.pickup(id,req.user);}
  @Post(':id/deliver') deliver(@Param('id') id:string,@Req() req:any){return this.service.deliver(id,req.user);}
  @Post(':id/cancel') cancel(@Param('id') id:string,@Req() req:any){return this.service.cancel(id,req.user);}
}
