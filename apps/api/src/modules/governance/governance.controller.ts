import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GovernanceService } from './governance.service';

@UseGuards(JwtAuthGuard)
@Controller('governance')
export class GovernanceController {
  constructor(private service:GovernanceService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Post('reference-data/changes') requestChange(@Body() body:any,@Req() req:any){return this.service.requestReferenceChange(body,req.user);}
  @Post('reference-data/changes/:id/approve') approveChange(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.decideReferenceChange(id,'APPROVED',body,req.user);}
  @Post('reference-data/changes/:id/reject') rejectChange(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.decideReferenceChange(id,'REJECTED',body,req.user);}
  @Post('permissions') permission(@Body() body:any,@Req() req:any){return this.service.setPermission(body,req.user);}
  @Post('approval-thresholds') threshold(@Body() body:any,@Req() req:any){return this.service.setThreshold(body,req.user);}
  @Post('approval-thresholds/evaluate') evaluate(@Body() body:any,@Req() req:any){return this.service.evaluateThreshold(body,req.user);}
  @Post('workflow-rules') workflow(@Body() body:any,@Req() req:any){return this.service.setWorkflow(body,req.user);}
  @Post('notification-rules') notification(@Body() body:any,@Req() req:any){return this.service.setNotification(body,req.user);}
}
