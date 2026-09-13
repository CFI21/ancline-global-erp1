import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommercialService } from './commercial.service';
@Controller('commercial')
@UseGuards(JwtAuthGuard)
export class CommercialController {
  constructor(private s:CommercialService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.s.dashboard(req.user)}
  @Get('contracts') contracts(@Req() req:any){return this.s.contracts(req.user)}
  @Post('contracts') createContract(@Body() b:any,@Req() req:any){return this.s.createContract(b,req.user)}
  @Post('contracts/:id/rates') addContractRate(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.addContractRate(id,b,req.user)}
  @Get('settlements') settlements(@Req() req:any){return this.s.settlements(req.user)}
  @Post('settlements') createSettlement(@Body() b:any,@Req() req:any){return this.s.createSettlement(b,req.user)}
  @Post('settlements/:id/approve') approveSettlement(@Param('id') id:string,@Req() req:any){return this.s.approveSettlement(id,req.user)}
  @Get('dnd') dnd(@Req() req:any){return this.s.dnd(req.user)}
  @Post('dnd') createDnd(@Body() b:any,@Req() req:any){return this.s.createDnd(b,req.user)}
  @Post('dnd/:id/waiver') waiver(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.waiver(id,b,req.user)}
  @Get('collections') collections(@Req() req:any){return this.s.collections(req.user)}
  @Post('collections') createCollection(@Body() b:any,@Req() req:any){return this.s.createCollection(b,req.user)}
  @Get('ai-reviews') aiReviews(@Req() req:any){return this.s.aiReviews(req.user)}
  @Post('ai-reviews') createAiReview(@Body() b:any,@Req() req:any){return this.s.createAiReview(b,req.user)}
}
