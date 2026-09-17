import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkforceService } from './workforce.service';

@UseGuards(JwtAuthGuard)
@Controller('workforce')
export class WorkforceController {
  constructor(private service:WorkforceService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Post('employees') employee(@Body() body:any,@Req() req:any){return this.service.setEmployee(body,req.user);}
  @Post('certifications') certification(@Body() body:any,@Req() req:any){return this.service.setCertification(body,req.user);}
  @Post('leave') leave(@Body() body:any,@Req() req:any){return this.service.setLeave(body,req.user);}
  @Post('shifts') shift(@Body() body:any,@Req() req:any){return this.service.setShift(body,req.user);}
  @Post('training') training(@Body() body:any,@Req() req:any){return this.service.setTraining(body,req.user);}
  @Get('bookings/:bookingId/suitability') suitability(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.suitability(bookingId,req.user);}
  @Post('assignments') assign(@Body() body:any,@Req() req:any){return this.service.assign(body,req.user);}
}
