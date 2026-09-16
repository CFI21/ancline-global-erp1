import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProcurementService } from './procurement.service';

@UseGuards(JwtAuthGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(private service:ProcurementService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('vendors') vendors(@Req() req:any){return this.service.vendors(req.user);}
  @Get('bookings') bookings(@Req() req:any){return this.service.bookings(req.user);}
  @Get('purchase-orders') purchaseOrders(@Query('status') status:string,@Req() req:any){return this.service.purchaseOrders(status||undefined,req.user);}
  @Get('purchase-orders/:poNo') purchaseOrder(@Param('poNo') poNo:string,@Req() req:any){return this.service.purchaseOrder(poNo,req.user);}
  @Post('purchase-orders') createPO(@Body() body:any,@Req() req:any){return this.service.createPO(body,req.user);}
  @Post('purchase-orders/:poNo/update') updatePO(@Param('poNo') poNo:string,@Body() body:any,@Req() req:any){return this.service.updatePO(poNo,body,req.user);}
  @Post('purchase-orders/:poNo/submit') submit(@Param('poNo') poNo:string,@Req() req:any){return this.service.submitPO(poNo,req.user);}
  @Get('purchase-orders/:poNo/budget-check') budget(@Param('poNo') poNo:string,@Req() req:any){return this.service.budgetCheck(poNo,req.user);}
  @Post('purchase-orders/:poNo/approve') approve(@Param('poNo') poNo:string,@Req() req:any){return this.service.approvePO(poNo,req.user);}
  @Post('purchase-orders/:poNo/receive') receive(@Param('poNo') poNo:string,@Body() body:any,@Req() req:any){return this.service.receivePO(poNo,body,req.user);}
  @Post('purchase-orders/:poNo/close') close(@Param('poNo') poNo:string,@Req() req:any){return this.service.closePO(poNo,req.user);}
  @Post('purchase-orders/:poNo/cancel') cancel(@Param('poNo') poNo:string,@Body() body:any,@Req() req:any){return this.service.cancelPO(poNo,body,req.user);}
  @Get('ap-matches') matches(@Req() req:any){return this.service.apMatches(req.user);}
  @Post('ap-matches/:invoiceNo/override') override(@Param('invoiceNo') invoiceNo:string,@Body() body:any,@Req() req:any){return this.service.overrideMatch(invoiceNo,body,req.user);}
  @Get('spend-analysis') spend(@Query('period') period:string,@Req() req:any){return this.service.spendAnalysis(period||undefined,req.user);}
}
