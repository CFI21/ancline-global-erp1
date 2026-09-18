import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BulkOperationsService } from './bulk-operations.service';

@UseGuards(JwtAuthGuard)
@Controller('bulk-operations')
export class BulkOperationsController {
  constructor(private service:BulkOperationsService){}
  @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
  @Get('bookings') bookings(@Req() req:any){return this.service.bookings(req.user);}
  @Get('operations') operations(@Req() req:any){return this.service.operations(req.user);}
  @Post('operations') create(@Body() body:any,@Req() req:any){return this.service.create(body,req.user);}
  @Post('operations/:id/cargo-lots') cargoLot(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.addCargoLot(id,body,req.user);}
  @Post('operations/:id/nominate') nominate(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.nominate(id,body,req.user);}
  @Post('operations/:id/nor') nor(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.tenderNor(id,body,req.user);}
  @Post('operations/:id/loading') loading(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.recordLoading(id,body,req.user);}
  @Post('operations/:id/discharge') discharge(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.recordDischarge(id,body,req.user);}
  @Post('operations/:id/close') close(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.service.close(id,body,req.user);}
}
