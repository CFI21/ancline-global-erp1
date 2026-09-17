import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommercialProfitabilityService } from './commercial-profitability.service';

@UseGuards(JwtAuthGuard)
@Controller('commercial-profitability')
export class CommercialProfitabilityController {
  constructor(private service:CommercialProfitabilityService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('profitability') profitability(@Query('period') period:string,@Req() req:any){return this.service.profitability(period||undefined,req.user);}
  @Get('recoveries') recoveries(@Req() req:any){return this.service.recoveries(req.user);}
  @Post('recoveries') proposeRecovery(@Body() body:any,@Req() req:any){return this.service.proposeRecovery(body,req.user);}
  @Post('recoveries/:caseId/:decision') decideRecovery(@Param('caseId') caseId:string,@Param('decision') decision:string,@Body() body:any,@Req() req:any){return this.service.decideRecovery(caseId,decision,body,req.user);}
  @Get('margin-exceptions') marginExceptions(@Req() req:any){return this.service.marginExceptions(req.user);}
  @Post('margin-exceptions') submitMarginException(@Body() body:any,@Req() req:any){return this.service.submitMarginException(body,req.user);}
  @Post('margin-exceptions/:id/:decision') decideMarginException(@Param('id') id:string,@Param('decision') decision:string,@Body() body:any,@Req() req:any){return this.service.decideMarginException(id,decision,body,req.user);}
}
