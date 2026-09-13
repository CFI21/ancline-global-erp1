import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  @Post(':id/advance') advance(@Param('id') id:string,@Req() req:any){ return this.service.advance(id,req.user); }
}
