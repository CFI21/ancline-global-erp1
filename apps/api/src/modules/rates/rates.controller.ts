import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RatesService } from './rates.service';
@Controller('rates')
export class RatesController {
  constructor(private readonly service:RatesService){}
  @Get() list(){return this.service.list();}
  @Get(':id') get(@Param('id') id:string){return this.service.get(id);}
  @Post() create(@Body() body:any){return this.service.create(body);}
  @Post(':id/approve') approve(@Param('id') id:string){return this.service.setStatus(id,'Rate Approved');}
  @Post(':id/send') send(@Param('id') id:string){return this.service.setStatus(id,'Quote Sent');}
  @Post(':id/accept') accept(@Param('id') id:string){return this.service.setStatus(id,'Customer Accepted');}
}
