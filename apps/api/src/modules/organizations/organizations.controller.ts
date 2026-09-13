import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}
  @Get() list(){ return this.service.list(); }
  @Get(':id') get(@Param('id') id:string){ return this.service.get(id); }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body:any,@Req() req:any){ return this.service.create(body,req.user); }
}
