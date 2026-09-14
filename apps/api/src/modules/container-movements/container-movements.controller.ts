import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContainerMovementsService } from './container-movements.service';

@UseGuards(JwtAuthGuard)
@Controller('container-movements')
export class ContainerMovementsController {
  constructor(private service:ContainerMovementsService){}
  @Get('booking/:bookingId') list(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.listForBooking(bookingId,req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
}
