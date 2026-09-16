import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatutoryFinanceService } from './statutory-finance.service';

@UseGuards(JwtAuthGuard)
@Controller('statutory-finance')
export class StatutoryFinanceController {
  constructor(private service:StatutoryFinanceService){}
  @Get('dashboard') dashboard(@Query('period') period:string,@Query('groupCurrency') groupCurrency:string,@Req() req:any){return this.service.dashboard(period,groupCurrency,req.user);}
  @Get('legal-entities') legalEntities(@Req() req:any){return this.service.legalEntities(req.user);}
  @Get('branches') branches(@Req() req:any){return this.service.branches(req.user);}
  @Post('legal-entities') createEntity(@Body() body:any,@Req() req:any){return this.service.setLegalEntity(undefined,body,req.user);}
  @Post('legal-entities/:entityId') updateEntity(@Param('entityId') entityId:string,@Body() body:any,@Req() req:any){return this.service.setLegalEntity(entityId,body,req.user);}
  @Get('fx-exposures') exposures(@Query('period') period:string,@Req() req:any){return this.service.exposures(period||undefined,req.user);}
  @Post('fx-exposures') setExposure(@Body() body:any,@Req() req:any){return this.service.setExposure(body,req.user);}
  @Get('fx-revaluation-preview') preview(@Query('period') period:string,@Req() req:any){return this.service.revaluationPreview(period,req.user);}
  @Post('fx-exposures/:exposureId/revalue') revalue(@Param('exposureId') exposureId:string,@Req() req:any){return this.service.postRevaluation(exposureId,req.user);}
  @Get('intercompany-reconciliation') reconciliation(@Query('period') period:string,@Req() req:any){return this.service.intercompanyReconciliation(period||undefined,req.user);}
  @Post('intercompany/:transactionNo/settlements') settle(@Param('transactionNo') transactionNo:string,@Body() body:any,@Req() req:any){return this.service.recordSettlement(transactionNo,body,req.user);}
  @Get('cash-flow') cashFlow(@Query('period') period:string,@Query('groupCurrency') groupCurrency:string,@Req() req:any){return this.service.cashFlow(period,groupCurrency,req.user);}
  @Get('close-readiness/:entityId/:period') closeReadiness(@Param('entityId') entityId:string,@Param('period') period:string,@Req() req:any){return this.service.closeReadiness(entityId,period,req.user);}
  @Get('closes') closes(@Query('period') period:string,@Req() req:any){return this.service.closes(period,req.user);}
  @Post('closes/:entityId/:period') setClose(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.setClose(entityId,period,body,req.user);}
}
