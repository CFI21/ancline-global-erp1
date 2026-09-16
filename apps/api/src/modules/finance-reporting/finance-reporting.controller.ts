import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceReportingService } from './finance-reporting.service';

@UseGuards(JwtAuthGuard)
@Controller('finance-reporting')
export class FinanceReportingController {
  constructor(private service:FinanceReportingService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('posting-candidates') postingCandidates(@Req() req:any){return this.service.postingCandidates(req.user);}
  @Post('post/invoice/:invoiceNo') postInvoice(@Param('invoiceNo') invoiceNo:string,@Req() req:any){return this.service.postInvoice(invoiceNo,req.user);}
  @Post('post/payment/:eventId') postPayment(@Param('eventId') eventId:string,@Req() req:any){return this.service.postPayment(eventId,req.user);}
  @Post('post/void/:eventId') postVoid(@Param('eventId') eventId:string,@Req() req:any){return this.service.postVoid(eventId,req.user);}
  @Get('journals') journals(@Query('period') period:string|undefined,@Req() req:any){return this.service.journals(period,req.user);}
  @Post('journals/:journalNo/reverse') reverse(@Param('journalNo') journalNo:string,@Body() body:any,@Req() req:any){return this.service.reverseJournal(journalNo,body,req.user);}
  @Get('statements') statements(@Query('period') period:string|undefined,@Query('currency') currency:string|undefined,@Req() req:any){return this.service.statements(period,currency,req.user);}
  @Get('account-ledger') accountLedger(@Query('account') account:string|undefined,@Query('period') period:string|undefined,@Query('currency') currency:string|undefined,@Req() req:any){return this.service.accountLedger(account,period,currency,req.user);}
  @Get('close-readiness/:period') closeReadiness(@Param('period') period:string,@Req() req:any){return this.service.closeReadiness(period,req.user);}
}
