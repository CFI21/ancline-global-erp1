import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnterpriseReportingService } from './enterprise-reporting.service';

@UseGuards(JwtAuthGuard)
@Controller('enterprise-reporting')
export class EnterpriseReportingController {
  constructor(private service:EnterpriseReportingService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Post('report-definitions') reportDefinition(@Body() body:any,@Req() req:any){return this.service.setReportDefinition(body,req.user);}
  @Post('saved-views') savedView(@Body() body:any,@Req() req:any){return this.service.setSavedView(body,req.user);}
  @Post('reports/:id/run') run(@Param('id') id:string,@Req() req:any){return this.service.runReport(id,req.user);}
  @Get('drilldown/:dimension/:key') drilldown(@Param('dimension') dimension:string,@Param('key') key:string,@Req() req:any){return this.service.drilldown(dimension,decodeURIComponent(key),req.user);}
}
