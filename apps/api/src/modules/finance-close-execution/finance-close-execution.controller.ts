import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceCloseExecutionService } from './finance-close-execution.service';

@UseGuards(JwtAuthGuard)
@Controller('finance-close-execution')
export class FinanceCloseExecutionController {
  constructor(private service:FinanceCloseExecutionService){}
  @Get('dashboard/:period') dashboard(@Param('period') period:string,@Req() req:any){return this.service.dashboard(period,req.user);}
  @Get('policy') policy(@Req() req:any){return this.service.policy(req.user);}
  @Post('policy') setPolicy(@Body() body:any,@Req() req:any){return this.service.setPolicy(body,req.user);}
  @Get('tax/:period') tax(@Param('period') period:string,@Req() req:any){return this.service.taxSummary(period,req.user);}
  @Post('tax/:period/prepare') prepareTax(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.prepareTax(period,body,req.user);}
  @Post('tax/:period/file') fileTax(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.fileTax(period,body,req.user);}
  @Post('period/:period/close') closePeriod(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.closePeriod(period,body,req.user);}
  @Get('entity-approvals/:period') entityApprovals(@Param('period') period:string,@Req() req:any){return this.service.entityApprovals(period,req.user);}
  @Post('entity-approvals/:entityId/:period/request') request(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.requestEntityApproval(entityId,period,body,req.user);}
  @Post('entity-approvals/:entityId/:period/approve') approve(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.approveEntityClose(entityId,period,body,req.user);}
}
