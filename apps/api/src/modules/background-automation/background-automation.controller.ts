import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackgroundAutomationService } from './background-automation.service';

@Controller('background-automation')
@UseGuards(JwtAuthGuard)
export class BackgroundAutomationController {
  constructor(private service:BackgroundAutomationService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Post('run/:job') run(@Param('job') job:string,@Req() req:any){return this.service.runNow(job,req.user);}
}
