import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LandsideService } from './landside.service';
@Controller('landside')
@UseGuards(JwtAuthGuard)
export class LandsideController{
  constructor(private s:LandsideService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.s.dashboard(req.user)}
  @Get('booking/:bookingId') booking(@Param('bookingId') id:string,@Req() req:any){return this.s.booking(id,req.user)}
  @Post('booking/:bookingId/transport') createTransport(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createTransport(id,b,req.user)}
  @Post('transport/:id/status') transportStatus(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.transportStatus(id,b,req.user)}
  @Post('booking/:bookingId/customs') createCustoms(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createCustoms(id,b,req.user)}
  @Post('customs/:id/status') customsStatus(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.customsStatus(id,b,req.user)}
  @Post('booking/:bookingId/warehouse') createWarehouse(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createWarehouse(id,b,req.user)}
  @Post('warehouse/:id/status') warehouseStatus(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.warehouseStatus(id,b,req.user)}
  @Post('booking/:bookingId/milestones') milestone(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.milestone(id,b,req.user)}
}
