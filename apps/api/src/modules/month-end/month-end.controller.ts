import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MonthEndService } from './month-end.service';

@UseGuards(JwtAuthGuard)
@Controller('month-end')
export class MonthEndController {
  constructor(private service:MonthEndService){}
  @Get('dashboard') dashboard(@Query('period') period:string,@Query('scenario') scenario:string,@Query('scopeId') scopeId:string,@Query('currency') currency:string,@Req() req:any){return this.service.dashboard(period,scenario,scopeId,currency,req.user);}
  @Get('legal-entities') legalEntities(@Req() req:any){return this.service.legalEntities(req.user);}
  @Get('accruals') accruals(@Query('period') period:string,@Req() req:any){return this.service.accruals(period||undefined,req.user);}
  @Post('accruals') createAccrual(@Body() body:any,@Req() req:any){return this.service.createAccrual(body,req.user);}
  @Post('accruals/:id/post') postAccrual(@Param('id') id:string,@Req() req:any){return this.service.postAccrual(id,req.user);}
  @Get('prepayments') prepayments(@Req() req:any){return this.service.prepayments(req.user);}
  @Post('prepayments') createPrepayment(@Body() body:any,@Req() req:any){return this.service.createPrepayment(body,req.user);}
  @Post('prepayments/:id/recognize/:period') recognizePrepayment(@Param('id') id:string,@Param('period') period:string,@Req() req:any){return this.service.recognizePrepayment(id,period,req.user);}
  @Get('fixed-assets') fixedAssets(@Req() req:any){return this.service.fixedAssets(req.user);}
  @Post('fixed-assets') createFixedAsset(@Body() body:any,@Req() req:any){return this.service.createFixedAsset(body,req.user);}
  @Post('fixed-assets/:id/depreciate/:period') depreciate(@Param('id') id:string,@Param('period') period:string,@Req() req:any){return this.service.depreciateAsset(id,period,req.user);}
  @Post('budget-lines') budget(@Body() body:any,@Req() req:any){return this.service.setBudgetLine(body,req.user);}
  @Get('variance') variance(@Query('period') period:string,@Query('scenario') scenario:string,@Query('scopeId') scopeId:string,@Query('currency') currency:string,@Req() req:any){return this.service.budgetVariance(period,scenario,scopeId,currency,req.user);}
  @Get('close-readiness/:period') readiness(@Param('period') period:string,@Req() req:any){return this.service.closeReadiness(period,req.user);}
  @Post('close/:period/run-due') runDue(@Param('period') period:string,@Req() req:any){return this.service.runDue(period,req.user);}
  @Post('close/:period/soft-close') softClose(@Param('period') period:string,@Req() req:any){return this.service.softClose(period,req.user);}
  @Post('close/:period/close') close(@Param('period') period:string,@Req() req:any){return this.service.closePeriod(period,req.user);}
  @Post('close/:period/reopen') reopen(@Param('period') period:string,@Req() req:any){return this.service.reopen(period,req.user);}
}
