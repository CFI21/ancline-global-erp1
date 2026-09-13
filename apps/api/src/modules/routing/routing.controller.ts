import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('routing')
@UseGuards(JwtAuthGuard)
export class RoutingController {
  constructor(private s:RoutingService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Post() create(@Body() body:any,@Req() req:any){return this.s.create(body,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.s.update(id,body,req.user);}
  @Delete(':id') remove(@Param('id') id:string,@Req() req:any){return this.s.remove(id,req.user);}
}
