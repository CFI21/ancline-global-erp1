import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly service: BookingsService) {}
  @Get() list(@Req() req:any){ return this.service.list(req.user); }
  @Get(':id') get(@Param('id') id:string,@Req() req:any){ return this.service.get(id,req.user); }
  @Post() create(@Body() body:any,@Req() req:any){ return this.service.create(body,req.user); }
  @Patch(':id') update(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.update(id,body,req.user); }
  @Post(':id/duplicate') duplicate(@Param('id') id:string,@Req() req:any){ return this.service.duplicate(id,req.user); }
  @Post(':id/cancel') cancel(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.cancel(id,body,req.user); }
  @Post(':id/containers') addContainer(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.addContainer(id,body,req.user); }
  @Patch(':id/containers/:containerId') updateContainer(@Param('id') id:string,@Param('containerId') containerId:string,@Body() body:any,@Req() req:any){ return this.service.updateContainer(id,containerId,body,req.user); }
  @Delete(':id/containers/:containerId') deleteContainer(@Param('id') id:string,@Param('containerId') containerId:string,@Req() req:any){ return this.service.deleteContainer(id,containerId,req.user); }
  @Post(':id/advance') advance(@Param('id') id:string,@Req() req:any){ return this.service.advance(id,req.user); }
}
