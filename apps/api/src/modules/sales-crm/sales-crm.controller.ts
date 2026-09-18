import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SalesCrmService } from './sales-crm.service';
@UseGuards(JwtAuthGuard)
@Controller('sales-crm')
export class SalesCrmController{
 constructor(private service:SalesCrmService){}
 @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
 @Get('customers') customers(@Req() req:any){return this.service.customers(req.user);}
 @Get('organizations') organizations(@Req() req:any){return this.service.organizations(req.user);}
 @Get('leads') leads(@Req() req:any){return this.service.leads(req.user);}
 @Post('leads') createLead(@Body() b:any,@Req() req:any){return this.service.createLead(b,req.user);}
 @Get('leads/:id') lead(@Param('id') id:string,@Req() req:any){return this.service.lead(id,req.user);}
 @Patch('leads/:id') updateLead(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.service.updateLead(id,b,req.user);}
 @Get('leads/:id/communications') leadCommunications(@Param('id') id:string,@Req() req:any){return this.service.leadCommunications(id,req.user);}
 @Post('leads/:id/communications') addLeadCommunication(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.service.addLeadCommunication(id,b,req.user);}
 @Get('leads/:id/logs') leadLogs(@Param('id') id:string,@Req() req:any){return this.service.leadLogs(id,req.user);}
 @Post('leads/:id/opportunity') convertLead(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.service.convertLeadToOpportunity(id,b,req.user);}
 @Get('opportunities') opportunities(@Req() req:any){return this.service.opportunities(req.user);}
 @Post('opportunities') createOpportunity(@Body() b:any,@Req() req:any){return this.service.createOpportunity(b,req.user);}
 @Patch('opportunities/:id') updateOpportunity(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.service.updateOpportunity(id,b,req.user);}
 @Post('opportunities/:id/close/:result') closeOpportunity(@Param('id') id:string,@Param('result') result:string,@Body() b:any,@Req() req:any){return this.service.closeOpportunity(id,result,b,req.user);}
 @Get('tenders') tenders(@Req() req:any){return this.service.tenders(req.user);}
 @Post('tenders') createTender(@Body() b:any,@Req() req:any){return this.service.createTender(b,req.user);}
 @Patch('tenders/:id') updateTender(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.service.updateTender(id,b,req.user);}
 @Get('opportunities/:id/quotes') quotes(@Param('id') id:string,@Req() req:any){return this.service.quoteVersions(id,req.user);}
 @Post('opportunities/:id/quotes') createQuote(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.service.createQuoteVersion(id,b,req.user);}
 @Post('quotes/:id/approve') approveQuote(@Param('id') id:string,@Req() req:any){return this.service.approveQuoteVersion(id,req.user);}
 @Post('quotes/:id/publish') publishQuote(@Param('id') id:string,@Req() req:any){return this.service.materializeQuote(id,req.user);}
}
