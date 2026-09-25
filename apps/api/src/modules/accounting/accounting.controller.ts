import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountingService } from './accounting.service';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private service:AccountingService){}

  @Get('dashboard') dashboard(@Req() req:any){ return this.service.dashboard(req.user); }
  @Get('reconciliation') reconciliation(@Req() req:any){ return this.service.reconciliation(req.user); }
  @Get('reconciliation/:bookingId') reconciliationBooking(@Param('bookingId') bookingId:string,@Req() req:any){ return this.service.reconciliationBooking(bookingId,req.user); }
  @Get('invoices') invoices(@Req() req:any){ return this.service.invoices(req.user); }
  @Get('invoices/:invoiceNo') invoice(@Param('invoiceNo') invoiceNo:string,@Req() req:any){ return this.service.getInvoice(invoiceNo,req.user); }
  @Post('invoices') create(@Body() body:any,@Req() req:any){ return this.service.createInvoice(body,req.user); }
  @Post('invoices/:invoiceNo/issue') issue(@Param('invoiceNo') invoiceNo:string,@Req() req:any){ return this.service.issue(invoiceNo,req.user); }
  @Post('invoices/:invoiceNo/payments') payment(@Param('invoiceNo') invoiceNo:string,@Body() body:any,@Req() req:any){ return this.service.payment(invoiceNo,body,req.user); }
  @Post('invoices/:invoiceNo/dispute') dispute(@Param('invoiceNo') invoiceNo:string,@Body() body:any,@Req() req:any){ return this.service.dispute(invoiceNo,body,req.user); }
  @Post('invoices/:invoiceNo/resolve') resolve(@Param('invoiceNo') invoiceNo:string,@Body() body:any,@Req() req:any){ return this.service.resolve(invoiceNo,body,req.user); }
  @Post('invoices/:invoiceNo/void') voidInvoice(@Param('invoiceNo') invoiceNo:string,@Body() body:any,@Req() req:any){ return this.service.voidInvoice(invoiceNo,body,req.user); }
}
