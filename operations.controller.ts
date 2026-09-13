import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OperationsService } from './operations.service';
@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private s:OperationsService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.s.dashboard(req.user)}
  @Post('services') createService(@Body() b:any,@Req() req:any){return this.s.createService(b,req.user)}
  @Post('voyages') createVoyage(@Body() b:any,@Req() req:any){return this.s.createVoyage(b,req.user)}
  @Post('allocations') createAllocation(@Body() b:any,@Req() req:any){return this.s.createAllocation(b,req.user)}
  @Get('allocations/:voyageId/ledger') ledger(@Param('voyageId') id:string,@Req() req:any){return this.s.allocationLedger(id,req.user)}
  @Post('allocations/:id/protect') protect(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.protectSlot(id,Number(b.teu||0),req.user)}
  @Post('bookings/:bookingId/legs') addLeg(@Param('bookingId') id:string,@Body() b:any,@Req() req:any){return this.s.addLeg(id,b,req.user)}
}
