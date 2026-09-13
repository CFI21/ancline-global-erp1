import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentOpsService } from './document-ops.service';
@Controller('document-ops')
@UseGuards(JwtAuthGuard)
export class DocumentOpsController{
  constructor(private s:DocumentOpsService){}
  @Get('booking/:bookingId/summary') summary(@Param('bookingId') id:string,@Req() req:any){return this.s.summary(id,req.user)}
  @Get('booking/:bookingId/cro') cro(@Param('bookingId') id:string,@Req() req:any){return this.s.cro(id,req.user)}
  @Post('booking/:bookingId/cro') createCro(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createCro(id,b,req.user)}
  @Post('cro/:id/release') releaseCro(@Param('id') id:string,@Req() req:any){return this.s.releaseCro(id,req.user)}
  @Get('booking/:bookingId/agents') agents(@Param('bookingId') id:string,@Req() req:any){return this.s.agents(id,req.user)}
  @Post('booking/:bookingId/agents') assignAgent(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.assignAgent(id,b,req.user)}
  @Get('exceptions') exceptions(@Req() req:any){return this.s.exceptions(req.user)}
  @Post('booking/:bookingId/exceptions') createException(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createException(id,b,req.user)}
  @Post('exceptions/:id/resolve') resolveException(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.resolveException(id,b,req.user)}
}
