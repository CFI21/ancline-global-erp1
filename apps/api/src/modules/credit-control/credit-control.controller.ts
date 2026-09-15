import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditControlService } from './credit-control.service';

@UseGuards(JwtAuthGuard)
@Controller('credit-control')
export class CreditControlController {
  constructor(private service:CreditControlService){}

  @Get('dashboard') dashboard(@Req() req:any){ return this.service.dashboard(req.user); }

  @Get('customers') customers(@Req() req:any){ return this.service.customers(req.user); }
  @Get('customers/:partyId') customer(@Param('partyId') partyId:string,@Req() req:any){ return this.service.customer(partyId,req.user); }
  @Post('customers/:partyId/profile') setProfile(@Param('partyId') partyId:string,@Body() body:any,@Req() req:any){ return this.service.setProfile(partyId,body,req.user); }
  @Post('customers/:partyId/apply-bookings') applyBookingDecision(@Param('partyId') partyId:string,@Req() req:any){ return this.service.applyBookingDecision(partyId,req.user); }

  @Get('collections') collections(@Req() req:any){ return this.service.collections(req.user); }
  @Post('collections/:invoiceNo/action') collectionAction(@Param('invoiceNo') invoiceNo:string,@Body() body:any,@Req() req:any){ return this.service.collectionAction(invoiceNo,body,req.user); }

  @Get('bank-transactions') bankTransactions(@Req() req:any){ return this.service.bankTransactions(req.user); }
  @Post('bank-transactions') importBankTransaction(@Body() body:any,@Req() req:any){ return this.service.importBankTransaction(body,req.user); }
  @Post('bank-transactions/:transactionId/match') matchBankTransaction(@Param('transactionId') transactionId:string,@Body() body:any,@Req() req:any){ return this.service.matchBankTransaction(transactionId,body,req.user); }
  @Post('bank-transactions/:transactionId/auto-match') autoMatch(@Param('transactionId') transactionId:string,@Req() req:any){ return this.service.autoMatch(transactionId,req.user); }
  @Post('bank-transactions/:transactionId/unmatch/:matchEventId') unmatch(@Param('transactionId') transactionId:string,@Param('matchEventId') matchEventId:string,@Req() req:any){ return this.service.unmatchBankTransaction(transactionId,matchEventId,req.user); }
}
