import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TreasuryService } from './treasury.service';

@UseGuards(JwtAuthGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private service:TreasuryService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('legal-entities') legalEntities(@Req() req:any){return this.service.legalEntities(req.user);}
  @Get('bank-accounts') bankAccounts(@Req() req:any){return this.service.bankAccounts(req.user);}
  @Post('bank-accounts') createBankAccount(@Body() body:any,@Req() req:any){return this.service.setBankAccount(undefined,body,req.user);}
  @Post('bank-accounts/:accountId') updateBankAccount(@Param('accountId') accountId:string,@Body() body:any,@Req() req:any){return this.service.setBankAccount(accountId,body,req.user);}
  @Get('ap-eligible') eligibleAP(@Req() req:any){return this.service.eligibleAP(req.user);}
  @Get('payment-runs') paymentRuns(@Req() req:any){return this.service.paymentRuns(req.user);}
  @Post('payment-runs') createPaymentRun(@Body() body:any,@Req() req:any){return this.service.createPaymentRun(body,req.user);}
  @Post('payment-runs/:runNo/approve') approvePaymentRun(@Param('runNo') runNo:string,@Req() req:any){return this.service.approvePaymentRun(runNo,req.user);}
  @Post('payment-runs/:runNo/post') postPaymentRun(@Param('runNo') runNo:string,@Req() req:any){return this.service.postPaymentRun(runNo,req.user);}
  @Post('payment-runs/:runNo/cancel') cancelPaymentRun(@Param('runNo') runNo:string,@Body() body:any,@Req() req:any){return this.service.cancelPaymentRun(runNo,body,req.user);}
  @Get('forecast-items') forecastItems(@Req() req:any){return this.service.forecastItems(req.user);}
  @Post('forecast-items') setForecastItem(@Body() body:any,@Req() req:any){return this.service.setForecastItem(body,req.user);}
  @Post('forecast-items/:forecastId/cancel') cancelForecastItem(@Param('forecastId') forecastId:string,@Req() req:any){return this.service.cancelForecastItem(forecastId,req.user);}
  @Get('cash-forecast') cashForecast(@Query('days') days:string,@Req() req:any){return this.service.cashForecast(days,req.user);}
  @Get('liquidity') liquidity(@Req() req:any){return this.service.liquidity(req.user);}
}
