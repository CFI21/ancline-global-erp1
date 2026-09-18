import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private s:OperationsService){}
  @Get('access-catalog') accessCatalog(@Req() req:any){return this.s.accessCatalog(req.user);}
  @Get('branches') branches(@Req() req:any){return this.s.listBranches(req.user);}
  @Post('branches') createBranch(@Body() body:any,@Req() req:any){return this.s.createBranch(body,req.user);}
  @Get('users') users(@Req() req:any){return this.s.listUsers(req.user);}
  @Post('users') createUser(@Body() body:any,@Req() req:any){return this.s.createUser(body,req.user);}
  @Patch('users/:id') updateUser(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.s.updateUser(id,body,req.user);}
  @Post('users/:id/toggle') toggleUser(@Param('id') id:string,@Req() req:any){return this.s.toggleUser(id,req.user);}
  @Get('integrations') integrations(@Req() req:any){return this.s.integrations(req.user);}
  @Get('notifications') notifications(@Req() req:any){return this.s.notifications(req.user);}
  @Get('notifications/summary') notificationSummary(@Req() req:any){return this.s.notificationSummary(req.user);}
  @Post('notifications/scan') scanNotifications(@Req() req:any){return this.s.scanNotifications(req.user);}
  @Post('notifications/read-all') readAll(@Req() req:any){return this.s.markAllRead(req.user);}
  @Post('notifications/:id/read') readNotification(@Param('id') id:string,@Req() req:any){return this.s.markNotificationRead(id,req.user);}
  @Get('closeout/:bookingId') closeout(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.closeout(bookingId,req.user);}
  @Post('closeout/:bookingId/items/:itemId/toggle') toggleCloseout(@Param('bookingId') bookingId:string,@Param('itemId') itemId:string,@Req() req:any){return this.s.toggleCloseout(bookingId,itemId,req.user);}
  @Post('closeout/:bookingId/finalize') finalize(@Param('bookingId') bookingId:string,@Req() req:any){return this.s.finalizeCloseout(bookingId,req.user);}
}
