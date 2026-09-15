import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShipmentControlService } from './shipment-control.service';

@UseGuards(JwtAuthGuard)
@Controller('shipment-control')
export class ShipmentControlController {
  constructor(private service:ShipmentControlService){}

  @Get('dashboard')
  dashboard(@Req() req:any){return this.service.dashboard(req.user);}

  @Get('shipments')
  shipments(@Req() req:any){return this.service.shipments(req.user);}

  @Post('shipments/from-booking/:bookingId')
  promote(@Param('bookingId') bookingId:string,@Body() body:any,@Req() req:any){return this.service.promoteBooking(bookingId,body,req.user);}

  @Get('consols')
  consols(@Req() req:any){return this.service.consols(req.user);}

  @Post('consols')
  createConsol(@Body() body:any,@Req() req:any){return this.service.createConsol(body,req.user);}

  @Post('consols/:consolId/assign/:bookingId')
  assign(@Param('consolId') consolId:string,@Param('bookingId') bookingId:string,@Req() req:any){return this.service.assign(consolId,bookingId,req.user);}

  @Post('consols/:consolId/unassign/:bookingId')
  unassign(@Param('consolId') consolId:string,@Param('bookingId') bookingId:string,@Req() req:any){return this.service.unassign(consolId,bookingId,req.user);}

  @Post('consols/:consolId/confirm')
  confirm(@Param('consolId') consolId:string,@Req() req:any){return this.service.transition(consolId,'CONFIRMED',req.user);}

  @Post('consols/:consolId/depart')
  depart(@Param('consolId') consolId:string,@Req() req:any){return this.service.transition(consolId,'DEPARTED',req.user);}

  @Post('consols/:consolId/arrive')
  arrive(@Param('consolId') consolId:string,@Req() req:any){return this.service.transition(consolId,'ARRIVED',req.user);}

  @Post('consols/:consolId/close')
  close(@Param('consolId') consolId:string,@Req() req:any){return this.service.transition(consolId,'CLOSED',req.user);}
}
