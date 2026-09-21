import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceCloseOrchestrationService } from './finance-close-orchestration.service';

@UseGuards(JwtAuthGuard)
@Controller('finance-close-orchestration')
export class FinanceCloseOrchestrationController {
  constructor(private service:FinanceCloseOrchestrationService){}
  @Get('dashboard/:period') dashboard(@Param('period') period:string,@Req() req:any){return this.service.dashboard(period,req.user);}
  @Get('blockers/:period') blockers(@Param('period') period:string,@Req() req:any){return this.service.blockers(period,req.user);}
  @Post('snapshot/:period') snapshot(@Param('period') period:string,@Req() req:any){return this.service.snapshot(period,req.user);}
}
