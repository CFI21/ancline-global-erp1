import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CarrierOperationsService } from './carrier-operations.service';

@UseGuards(JwtAuthGuard)
@Controller('carrier-operations')
export class CarrierOperationsController {
  constructor(private service:CarrierOperationsService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('carriers') carriers(@Req() req:any){return this.service.carriers(req.user);}
  @Get('bookings') bookings(@Req() req:any){return this.service.bookings(req.user);}
  @Get('schedules') schedules(@Req() req:any){return this.service.schedules(req.user);}
  @Get('capacity') capacity(@Req() req:any){return this.service.capacity(req.user);}
  @Get('exceptions') exceptions(@Req() req:any){return this.service.exceptions(req.user);}
  @Get('carrier-bookings') carrierBookings(@Req() req:any){return this.service.carrierBookings(req.user);}
  @Post('carrier-bookings') create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
  @Post('carrier-bookings/:id/confirm') confirm(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.confirm(id,body,req.user);}
  @Post('carrier-bookings/:id/allocate') allocate(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.allocate(id,body,req.user);}
  @Post('carrier-bookings/:id/equipment-release') release(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.release(id,body,req.user);}
  @Post('carrier-bookings/:id/roll') roll(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.roll(id,body,req.user);}
  @Post('carrier-bookings/:id/cancel') cancel(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.cancel(id,body,req.user);}
}
