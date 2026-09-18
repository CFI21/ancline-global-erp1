import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateProcurementService } from './rate-procurement.service';

@Controller('rate-procurement')
@UseGuards(JwtAuthGuard)
export class RateProcurementController {
  constructor(private readonly service:RateProcurementService){}
  @Get('providers') providers(@Req() req:any){return this.service.providers(req.user);}
  @Post('providers') setProvider(@Body() body:any,@Req() req:any){return this.service.setProvider(body,req.user);}
  @Post('forwarding/search') forwardingSearch(@Body() body:any,@Req() req:any){return this.service.searchForwarding(body,req.user);}
  @Post('forwarding/select/:requestId/:offerId') forwardingSelect(@Param('requestId') requestId:string,@Param('offerId') offerId:string,@Body() body:any,@Req() req:any){return this.service.selectForwarding(requestId,offerId,body,req.user);}
  @Get('booking/:bookingId') booking(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.booking(bookingId,req.user);}
  @Post('booking/:bookingId/search') search(@Param('bookingId') bookingId:string,@Req() req:any){return this.service.search(bookingId,req.user);}
  @Post('booking/:bookingId/select/:offerId') select(@Param('bookingId') bookingId:string,@Param('offerId') offerId:string,@Body() body:any,@Req() req:any){return this.service.select(bookingId,offerId,body,req.user);}
}
