import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpecialCargoService } from './special-cargo.service';
@Controller('special-cargo')
@UseGuards(JwtAuthGuard)
export class SpecialCargoController {
 constructor(private s:SpecialCargoService){}
 @Post(':bookingId/dg') dg(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.dg(id,b,req.user)}
 @Post(':bookingId/oog') oog(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.oog(id,b,req.user)}
 @Get(':bookingId/readiness') ready(@Param('bookingId') id:string,@Req() req:any){return this.s.readiness(id,req.user)}
}
