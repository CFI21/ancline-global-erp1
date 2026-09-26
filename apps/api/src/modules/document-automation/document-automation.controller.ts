import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentAutomationService } from './document-automation.service';

@UseGuards(JwtAuthGuard)
@Controller('document-automation')
export class DocumentAutomationController {
  constructor(private service:DocumentAutomationService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('readiness/:bookingId') readiness(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.readiness(bookingId,req.user);}
  @Post('templates') template(@Body() body:any,@Req() req:any){return this.service.setTemplate(body,req.user);}
  @Post('generate') generate(@Body() body:any,@Req() req:any){return this.service.generate(body,req.user);}
  @Post('communications') communication(@Body() body:any,@Req() req:any){return this.service.createCommunication(body,req.user);}
  @Post('communications/:id/status') communicationStatus(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.setCommunicationStatus(id,body,req.user);}
  @Post('communications/:id/retry') retryCommunication(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.retryCommunication(id,body,req.user);}
  @Post('packs') pack(@Body() body:any,@Req() req:any){return this.service.createPack(body,req.user);}
}
