import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeneralLedgerService } from './general-ledger.service';

@UseGuards(JwtAuthGuard)
@Controller('general-ledger')
export class GeneralLedgerController {
  constructor(private service:GeneralLedgerService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('journals') journals(@Req() req:any){return this.service.journals(req.user);}
  @Post('journals') createJournal(@Body() body:any,@Req() req:any){return this.service.createJournal(body,req.user);}
  @Post('journals/:journalNo/post') postJournal(@Param('journalNo') journalNo:string,@Req() req:any){return this.service.postJournal(journalNo,req.user);}
  @Get('periods') periods(@Req() req:any){return this.service.periods(req.user);}
  @Post('periods') setPeriod(@Body() body:any,@Req() req:any){return this.service.setPeriod(body,req.user);}
  @Post('periods/:period/close') closePeriod(@Param('period') period:string,@Req() req:any){return this.service.closePeriod(period,req.user);}
  @Post('periods/:period/reopen') reopenPeriod(@Param('period') period:string,@Req() req:any){return this.service.reopenPeriod(period,req.user);}
  @Get('tax-summary') taxSummary(@Req() req:any){return this.service.taxSummary(req.user);}
  @Get('trial-balance') trialBalance(@Req() req:any){return this.service.trialBalance(req.user);}
}
