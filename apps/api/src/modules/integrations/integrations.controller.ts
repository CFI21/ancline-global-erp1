import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private s:IntegrationsService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Get('summary') summary(@Req() req:any){return this.s.summary(req.user);}
  @Get(':id') get(@Param('id') id:string,@Req() req:any){return this.s.get(id,req.user);}
  @Post('ingest') ingest(@Body() body:any,@Req() req:any){return this.s.ingest(body,req.user);}
  @Post('retry-failed') retryFailed(@Req() req:any){return this.s.retryFailed(req.user);}
  @Post(':id/retry') retry(@Param('id') id:string,@Req() req:any){return this.s.retry(id,req.user);}
  @Post(':id/reprocess') reprocess(@Param('id') id:string,@Req() req:any){return this.s.reprocess(id,req.user);}
}
