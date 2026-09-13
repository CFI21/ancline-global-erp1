import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private s:ApprovalsService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Post() create(@Body() b:any,@Req() req:any){return this.s.create(b,req.user);}
  @Post(':id/approve') approve(@Param('id') id:string,@Req() req:any){return this.s.approve(id,req.user);}
  @Post(':id/reject') reject(@Param('id') id:string,@Req() req:any){return this.s.reject(id,req.user);}
}
