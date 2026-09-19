import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RatesService } from './rates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('rates')
@UseGuards(JwtAuthGuard)
export class RatesController {
  constructor(private readonly service:RatesService){}

  @Get('dashboard')
  dashboard(@Req() req:any){ return this.service.dashboard(req.user); }

  @Get()
  list(@Req() req:any){ return this.service.list(req.user); }

  @Get(':id/activities')
  activities(@Param('id') id:string,@Req() req:any){ return this.service.activities(id,req.user); }

  @Post(':id/activities')
  addActivity(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.addActivity(id,body,req.user); }

  @Get(':id/logs')
  logs(@Param('id') id:string,@Req() req:any){ return this.service.logs(id,req.user); }

  @Get(':id')
  get(@Param('id') id:string,@Req() req:any){ return this.service.get(id,req.user); }

  @Patch(':id')
  update(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.update(id,body,req.user); }

  @Post()
  create(@Body() body:any,@Req() req:any){ return this.service.create(body,req.user); }

  @Post(':id/approve')
  approve(@Param('id') id:string,@Req() req:any){ return this.service.approve(id,req.user); }

  @Post(':id/send')
  send(@Param('id') id:string,@Req() req:any){ return this.service.send(id,req.user); }

  @Post(':id/accept')
  accept(@Param('id') id:string,@Req() req:any){ return this.service.accept(id,req.user); }

  @Post(':id/reject')
  reject(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.reject(id,body,req.user); }

  @Post(':id/convert')
  convert(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.convertToBooking(id,body,req.user); }
}
