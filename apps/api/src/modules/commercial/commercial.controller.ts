import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommercialService } from './commercial.service';

@UseGuards(JwtAuthGuard)
@Controller('commercial')
export class CommercialController {
  constructor(private service:CommercialService){}

  @Get('dashboard')
  dashboard(@Req() req:any){ return this.service.dashboard(req.user); }

  @Get('contracts')
  contracts(@Req() req:any){ return this.service.contracts(req.user); }

  @Get('contracts/:id')
  getContract(@Param('id') id:string,@Req() req:any){ return this.service.getContract(id,req.user); }

  @Post('contracts')
  createContract(@Body() body:any,@Req() req:any){ return this.service.createContract(body,req.user); }

  @Post('contracts/:id/rates')
  addRate(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.addRate(id,body,req.user); }

  @Post('contracts/:id/activate')
  activate(@Param('id') id:string,@Req() req:any){ return this.service.activate(id,req.user); }

  @Post('contracts/:id/suspend')
  suspend(@Param('id') id:string,@Req() req:any){ return this.service.suspend(id,req.user); }

  @Post('contracts/:id/extend')
  extend(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.extend(id,body,req.user); }

  @Post('tariffs/match')
  match(@Body() body:any,@Req() req:any){ return this.service.matchTariffs(body,req.user); }

  @Post('tariffs/:rateId/quote')
  createQuote(@Param('rateId') rateId:string,@Body() body:any,@Req() req:any){ return this.service.createQuoteFromRate(rateId,body,req.user); }
}
