import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FleetService } from './fleet.service';
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetController {
 constructor(private s:FleetService){}
 @Get('containers') list(@Req() req:any){return this.s.list(req.user)}
 @Get('containers/:id/events') events(@Param('id') id:string,@Req() req:any){return this.s.events(id,req.user)}
 @Post('containers/:id/events') add(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.addEvent(id,b,req.user)}
 @Post('containers/:id/corrections') correct(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.correct(id,b,req.user)}
}
