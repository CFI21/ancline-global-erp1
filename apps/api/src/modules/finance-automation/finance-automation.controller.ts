import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceAutomationService } from './finance-automation.service';

@UseGuards(JwtAuthGuard)
@Controller('finance-automation')
export class FinanceAutomationController {
  constructor(private service:FinanceAutomationService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('journal-proposals') journals(@Req() req:any){return this.service.journalProposals(req.user);}
  @Post('journal-proposals/scan') scanJournals(@Req() req:any){return this.service.scanJournalCandidates(req.user);}
  @Post('journal-proposals/:proposalId/execute') executeJournal(@Param('proposalId') proposalId:string,@Req() req:any){return this.service.executeJournalProposal(proposalId,req.user);}
  @Get('payment-proposals') paymentProposals(@Query('currency') currency:string,@Req() req:any){return this.service.paymentProposals(currency,req.user);}
  @Post('payment-proposals/generate') generatePaymentProposal(@Body() body:any,@Req() req:any){return this.service.generatePaymentProposal(body,req.user);}
  @Get('collections/priorities') collectionPriorities(@Req() req:any){return this.service.collectionPriorities(req.user);}
  @Get('liquidity-alerts') liquidityAlerts(@Req() req:any){return this.service.liquidityAlerts(req.user);}
  @Post('liquidity-alerts/scan') scanLiquidity(@Req() req:any){return this.service.scanLiquidity(req.user);}
  @Get('intercompany-netting') netting(@Query('period') period:string,@Req() req:any){return this.service.intercompanyNetting(period,req.user);}
  @Post('intercompany-netting/proposals') createNetting(@Body() body:any,@Req() req:any){return this.service.createNettingProposal(body,req.user);}
  @Post('intercompany-netting/:proposalId/approve') approveNetting(@Param('proposalId') proposalId:string,@Req() req:any){return this.service.approveNettingProposal(proposalId,req.user);}
}
