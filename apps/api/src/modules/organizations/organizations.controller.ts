import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}
  @Get() list(){ return this.service.list(); }
  @Get(':id') get(@Param('id') id:string){ return this.service.get(id); }
  @Post() create(@Body() body:any){ return this.service.create(body); }
}
