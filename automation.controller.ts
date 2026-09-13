import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AutomationService } from './automation.service';
@Controller('automation')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private s:AutomationService){}
  @Get('search') search(@Query('q') q:string,@Req() req:any){ return this.s.search(q||'',req.user); }
  @Get('notifications') notifications(@Req() req:any){ return this.s.notifications(req.user); }
  @Post('notifications/:id/read') read(@Param('id') id:string,@Req() req:any){ return this.s.markRead(id,req.user); }
  @Get('integrations') integrations(@Req() req:any){ return this.s.integrations(req.user); }
  @Post('integrations') createIntegration(@Body() b:any,@Req() req:any){ return this.s.createIntegrationEvent(b,req.user); }
  @Post('integrations/:id/retry') retry(@Param('id') id:string,@Req() req:any){ return this.s.retryIntegrationEvent(id,req.user); }
  @Get('closeout/:bookingId') closeout(@Param('bookingId') bookingId:string,@Req() req:any){ return this.s.closeout(bookingId,req.user); }
  @Post('closeout/:bookingId/:itemCode') setCloseout(@Param('bookingId') bookingId:string,@Param('itemCode') itemCode:string,@Body() b:any,@Req() req:any){ return this.s.setCloseoutItem(bookingId,itemCode,b,req.user); }
}
