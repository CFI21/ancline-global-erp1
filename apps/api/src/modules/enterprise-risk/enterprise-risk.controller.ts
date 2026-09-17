import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnterpriseRiskService } from './enterprise-risk.service';

@UseGuards(JwtAuthGuard)
@Controller('enterprise-risk')
export class EnterpriseRiskController {
 constructor(private service:EnterpriseRiskService){}
 @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
 @Get('customers') customers(@Req() req:any){return this.service.customers(req.user);}
 @Get('bookings') bookings(@Req() req:any){return this.service.bookings(req.user);}
 @Post('policy') policy(@Body() body:any,@Req() req:any){return this.service.setRiskPolicy(body,req.user);}
 @Post('screenings') screening(@Body() body:any,@Req() req:any){return this.service.screening(body,req.user);}
 @Post('insurance-policies') insurancePolicy(@Body() body:any,@Req() req:any){return this.service.setInsurancePolicy(body,req.user);}
 @Post('certificates') certificate(@Body() body:any,@Req() req:any){return this.service.certificate(body,req.user);}
 @Post('dg-reviews') dgReview(@Body() body:any,@Req() req:any){return this.service.dgReview(body,req.user);}
 @Post('documents') document(@Body() body:any,@Req() req:any){return this.service.document(body,req.user);}
 @Post('bookings/:bookingId/holds') hold(@Param('bookingId') bookingId:string,@Body() body:any,@Req() req:any){return this.service.hold(bookingId,body,req.user);}
 @Post('holds/:holdId/release') release(@Param('holdId') holdId:string,@Body() body:any,@Req() req:any){return this.service.releaseHold(holdId,body,req.user);}
 @Post('recoveries') recovery(@Body() body:any,@Req() req:any){return this.service.recovery(body,req.user);}
 @Post('recoveries/:id') updateRecovery(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.updateRecovery(id,body,req.user);}
}
