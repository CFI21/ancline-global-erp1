import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContainerMovementsService } from './container-movements.service';

@UseGuards(JwtAuthGuard)
@Controller('container-movements')
export class ContainerMovementsController {
  constructor(private service:ContainerMovementsService){}
  @Get('booking/:bookingId') list(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.listForBooking(bookingId,req.user);}
  @Get('booking/:bookingId/control') control(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.controlForBooking(bookingId,req.user);}
  @Patch(':containerId/control') updateControl(@Param('containerId') containerId:string,@Body() body:any,@Req() req:any){return this.service.updateControl(containerId,body,req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
}
