import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowAutomationService } from './workflow-automation.service';

@Controller('workflow-automation')
@UseGuards(JwtAuthGuard)
export class WorkflowAutomationController {
  constructor(private s:WorkflowAutomationService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.s.dashboard(req.user);}
  @Post('preview') preview(@Body() body:any,@Req() req:any){return this.s.preview(body,req.user);}
  @Post('trigger') trigger(@Body() body:any,@Req() req:any){return this.s.trigger(body,req.user);}
  @Post('run-due') runDue(@Req() req:any){return this.s.runDue(req.user);}
}
