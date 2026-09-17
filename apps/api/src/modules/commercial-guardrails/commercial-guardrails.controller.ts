import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommercialGuardrailsService } from './commercial-guardrails.service';

@UseGuards(JwtAuthGuard)
@Controller('commercial-guardrails')
export class CommercialGuardrailsController {
  constructor(private service:CommercialGuardrailsService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('policies') policies(@Req() req:any){return this.service.policies(req.user);}
  @Post('policies') setPolicy(@Body() body:any,@Req() req:any){return this.service.setPolicy(body,req.user);}
  @Get('contracts/utilization') contracts(@Req() req:any){return this.service.contractUtilization(req.user);}
  @Get('commitments') commitments(@Req() req:any){return this.service.commitments(req.user);}
  @Post('commitments') createCommitment(@Body() body:any,@Req() req:any){return this.service.createCommitment(body,req.user);}
  @Get('approvals') approvals(@Req() req:any){return this.service.approvals(req.user);}
  @Post('approvals') requestApproval(@Body() body:any,@Req() req:any){return this.service.requestApproval(body,req.user);}
  @Post('approvals/:id/:decision') decideApproval(@Param('id') id:string,@Param('decision') decision:string,@Body() body:any,@Req() req:any){return this.service.decideApproval(id,decision,body,req.user);}
  @Get('bookings/:bookingId/check') checkBooking(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.checkBooking(bookingId,req.user);}
}
