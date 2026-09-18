import { Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TestDataService } from './test-data.service';

@Controller('test-data')
@UseGuards(JwtAuthGuard)
export class TestDataController {
  constructor(private s:TestDataService){}
  @Get('summary') summary(@Req() req:any){return this.s.summary(req.user);}
  @Post('seed') seed(@Req() req:any){return this.s.seed(req.user);}
  @Delete('reset') reset(@Req() req:any){return this.s.reset(req.user);}
}
