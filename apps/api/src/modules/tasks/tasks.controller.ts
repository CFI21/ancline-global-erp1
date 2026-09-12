import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TasksService } from './tasks.service';
@Controller('tasks')
export class TasksController {
  constructor(private s:TasksService){}
  @Get() list(){return this.s.list();}
  @Post() create(@Body() b:any){return this.s.create(b);}
  @Post(':id/complete') complete(@Param('id') id:string){return this.s.complete(id);}
}
