import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UatService } from './uat.service';

@Controller('uat')
@UseGuards(JwtAuthGuard)
export class UatController {
  constructor(private readonly uat: UatService) {}

  @Get('status')
  status(@Req() req: any) {
    return this.uat.status(req.user);
  }

  @Post('run')
  run(@Body() body: any, @Req() req: any) {
    return this.uat.run(req.user, body || {});
  }
}
