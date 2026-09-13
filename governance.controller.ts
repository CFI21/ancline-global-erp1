import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GovernanceService } from './governance.service';
@Controller('governance')
@UseGuards(JwtAuthGuard)
export class GovernanceController {
  constructor(private s:GovernanceService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.s.dashboard(req.user)}
  @Get('reports') reports(@Req() req:any){return this.s.reports(req.user)}
  @Post('reports/snapshots') snapshot(@Body() b:any,@Req() req:any){return this.s.createSnapshot(b,req.user)}
  @Get('master-data') masterData(@Req() req:any){return this.s.masterData(req.user)}
  @Post('master-data/changes') requestChange(@Body() b:any,@Req() req:any){return this.s.requestMasterChange(b,req.user)}
  @Post('master-data/changes/:id/approve') approveChange(@Param('id') id:string,@Req() req:any){return this.s.approveMasterChange(id,req.user)}
  @Get('user-scopes') userScopes(@Req() req:any){return this.s.userScopes(req.user)}
  @Post('user-scopes') assignScope(@Body() b:any,@Req() req:any){return this.s.assignScope(b,req.user)}
  @Get('audit-center') audit(@Req() req:any){return this.s.auditCenter(req.user)}
  @Get('release-control') release(@Req() req:any){return this.s.releaseControl(req.user)}
}
