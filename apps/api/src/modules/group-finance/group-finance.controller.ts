import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GroupFinanceService } from './group-finance.service';

@UseGuards(JwtAuthGuard)
@Controller('group-finance')
export class GroupFinanceController {
  constructor(private service:GroupFinanceService){}
  @Get('dashboard') dashboard(@Query('period') period:string,@Query('groupCurrency') groupCurrency:string,@Req() req:any){return this.service.dashboard(period,groupCurrency,req.user);}
  @Get('entities') entities(@Req() req:any){return this.service.entities(req.user);}
  @Post('entities/:branchId') setEntity(@Param('branchId') branchId:string,@Body() body:any,@Req() req:any){return this.service.setEntity(branchId,body,req.user);}
  @Get('fx-rates') fxRates(@Query('period') period:string,@Req() req:any){return this.service.fxRates(period||undefined,req.user);}
  @Post('fx-rates') setFxRate(@Body() body:any,@Req() req:any){return this.service.setFxRate(body,req.user);}
  @Get('intercompany') intercompany(@Req() req:any){return this.service.intercompany(req.user);}
  @Post('intercompany') createIntercompany(@Body() body:any,@Req() req:any){return this.service.createIntercompany(body,req.user);}
  @Post('intercompany/:transactionNo/post') postIntercompany(@Param('transactionNo') transactionNo:string,@Req() req:any){return this.service.postIntercompany(transactionNo,req.user);}
  @Get('consolidation') consolidation(@Query('period') period:string,@Query('groupCurrency') groupCurrency:string,@Req() req:any){return this.service.consolidation(period,groupCurrency,req.user);}
  @Get('exceptions') exceptions(@Query('period') period:string,@Query('groupCurrency') groupCurrency:string,@Req() req:any){return this.service.exceptions(period,groupCurrency,req.user);}
}
