import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomerServiceService } from './customer-service.service';

@UseGuards(JwtAuthGuard)
@Controller('customer-service')
export class CustomerServiceController {
 constructor(private service:CustomerServiceService){}
 @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
 @Get('customers') customers(@Req() req:any){return this.service.customers(req.user);}
 @Get('bookings') bookings(@Req() req:any){return this.service.bookings(req.user);}
 @Get('cases') cases(@Req() req:any){return this.service.cases(req.user);}
 @Post('cases') createCase(@Body() body:any,@Req() req:any){return this.service.createCase(body,req.user);}
 @Post('cases/:id/status') setCaseStatus(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.setCaseStatus(id,body,req.user);}
 @Post('cases/:id/csat') csat(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.csat(id,body,req.user);}
 @Get('claims') claims(@Req() req:any){return this.service.claims(req.user);}
 @Post('claims') createClaim(@Body() body:any,@Req() req:any){return this.service.createClaim(body,req.user);}
 @Post('claims/:id/:action') claimAction(@Param('id') id:string,@Param('action') action:string,@Body() body:any,@Req() req:any){return this.service.claimAction(id,action,body,req.user);}
 @Get('recoveries') recoveries(@Req() req:any){return this.service.recoveries(req.user);}
 @Post('recoveries') requestRecovery(@Body() body:any,@Req() req:any){return this.service.requestRecovery(body,req.user);}
 @Post('recoveries/:id/:decision') decideRecovery(@Param('id') id:string,@Param('decision') decision:string,@Body() body:any,@Req() req:any){return this.service.decideRecovery(id,decision,body,req.user);}
}
