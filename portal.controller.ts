import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private s:PortalService){}
  @Get('bookings') bookings(@Req() req:any){return this.s.bookings(req.user);}
}
