import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private s:DocumentsService){}
  @Get() list(@Req() req:any){return this.s.list(req.user)}
  @Post() create(@Body() b:any,@Req() req:any){return this.s.create(b,req.user)}
  @Post(':id/release') release(@Param('id') id:string,@Req() req:any){return this.s.release(id,req.user)}
  @Get('booking/:bookingId/bls') bls(@Param('bookingId') id:string,@Req() req:any){return this.s.bls(id,req.user)}
  @Post('booking/:bookingId/bls') createBl(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createBl(id,b,req.user)}
  @Get('booking/:bookingId/manifests') manifests(@Param('bookingId') id:string,@Req() req:any){return this.s.manifests(id,req.user)}
  @Post('booking/:bookingId/manifests') createManifest(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.createManifest(id,b,req.user)}
}
