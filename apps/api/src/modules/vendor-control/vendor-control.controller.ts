import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorControlService } from './vendor-control.service';

@UseGuards(JwtAuthGuard)
@Controller('vendor-control')
export class VendorControlController {
  constructor(private service:VendorControlService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('margin-leakage') marginLeakage(@Query('period') period:string,@Req() req:any){return this.service.marginLeakage(period||undefined,req.user);}
  @Get('vendors') vendors(@Req() req:any){return this.service.vendorScorecards(req.user);}
  @Get('vendors/:vendorId') vendor(@Param('vendorId') vendorId:string,@Req() req:any){return this.service.vendorDetail(vendorId,req.user);}
  @Post('vendors/:vendorId/profile') profile(@Param('vendorId') vendorId:string,@Body() body:any,@Req() req:any){return this.service.setVendorProfile(vendorId,body,req.user);}
  @Post('vendors/:vendorId/incidents') incident(@Param('vendorId') vendorId:string,@Body() body:any,@Req() req:any){return this.service.recordIncident(vendorId,body,req.user);}
}
