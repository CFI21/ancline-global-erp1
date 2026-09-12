import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
@Controller('approvals')
export class ApprovalsController {
  constructor(private s:ApprovalsService){}
  @Get() list(){return this.s.list();}
  @Post() create(@Body() b:any){return this.s.create(b);}
  @Post(':id/approve') approve(@Param('id') id:string){return this.s.approve(id);}
  @Post(':id/reject') reject(@Param('id') id:string){return this.s.reject(id);}
}
