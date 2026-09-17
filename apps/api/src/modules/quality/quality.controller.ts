import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QualityService } from './quality.service';

@UseGuards(JwtAuthGuard)
@Controller('quality')
export class QualityController {
  constructor(private service:QualityService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Post('ncrs') ncr(@Body() body:any,@Req() req:any){return this.service.ncr(body,req.user);}
  @Post('ncrs/:id') updateNcr(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.updateNcr(id,body,req.user);}
  @Post('capas') capa(@Body() body:any,@Req() req:any){return this.service.capa(body,req.user);}
  @Post('capas/:id') updateCapa(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.updateCapa(id,body,req.user);}
  @Post('audits') audit(@Body() body:any,@Req() req:any){return this.service.audit(body,req.user);}
  @Post('audits/:id') updateAudit(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.updateAudit(id,body,req.user);}
  @Post('sops') sop(@Body() body:any,@Req() req:any){return this.service.sop(body,req.user);}
  @Post('sops/:id/attest') attest(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.attest(id,body,req.user);}
}
