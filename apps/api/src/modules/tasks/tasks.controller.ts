import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private s:TasksService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Post() create(@Body() b:any,@Req() req:any){return this.s.create(b,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.update(id,b,req.user);}
  @Post(':id/complete') complete(@Param('id') id:string,@Req() req:any){return this.s.complete(id,req.user);}
}
