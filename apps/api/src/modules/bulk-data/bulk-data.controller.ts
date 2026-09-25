import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BulkDataService } from './bulk-data.service';

@Controller('bulk-data')
@UseGuards(JwtAuthGuard)
export class BulkDataController {
  constructor(private readonly service:BulkDataService){}

  @Get('templates')
  templates(@Req() req:any){return this.service.templates(req.user);}

  @Get('history')
  history(@Req() req:any){return this.service.history(req.user);}

  @Post('validate')
  validate(@Body() body:any,@Req() req:any){return this.service.validate(body,req.user);}

  @Post('reconcile')
  reconcile(@Body() body:any,@Req() req:any){return this.service.reconcile(body,req.user);}

  @Post('import')
  importRows(@Body() body:any,@Req() req:any){return this.service.importRows(body,req.user);}
}
