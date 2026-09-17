import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectivityService } from './connectivity.service';

@UseGuards(JwtAuthGuard)
@Controller('connectivity')
export class ConnectivityController {
  constructor(private service:ConnectivityService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Post('profiles') profile(@Body() body:any,@Req() req:any){return this.service.setProfile(body,req.user);}
  @Post('mappings') mapping(@Body() body:any,@Req() req:any){return this.service.setMapping(body,req.user);}
  @Post('webhooks') webhook(@Body() body:any,@Req() req:any){return this.service.setWebhook(body,req.user);}
  @Post('outbound') outbound(@Body() body:any,@Req() req:any){return this.service.queueOutbound(body,req.user);}
  @Post('outbound/:id/status') outboundStatus(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.setOutboundStatus(id,body,req.user);}
  @Post('outbound/:id/retry') retry(@Param('id') id:string,@Req() req:any){return this.service.retryOutbound(id,req.user);}
  @Post('acknowledgements') acknowledge(@Body() body:any,@Req() req:any){return this.service.acknowledge(body,req.user);}
}
