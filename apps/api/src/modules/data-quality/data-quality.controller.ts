import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DataQualityService } from './data-quality.service';

@UseGuards(JwtAuthGuard)
@Controller('api/data-quality')
export class DataQualityController {
 constructor(private service:DataQualityService){}
 @Get('dashboard') dashboard(@Req() req:any){return this.service.dashboard(req.user);}
 @Get('rules') rules(@Req() req:any){return this.service.rules(req.user);}
 @Post('rules') setRule(@Body() body:any,@Req() req:any){return this.service.setRule(body,req.user);}
 @Post('scan') scan(@Req() req:any){return this.service.scan(req.user);}
 @Get('bookings/:id/check') check(@Param('id') id:string,@Query('gate') gate:string,@Req() req:any){return this.service.checkBooking(id,req.user,gate||'ANY');}
 @Post('remediations') createRemediation(@Body() body:any,@Req() req:any){return this.service.createRemediation(body,req.user);}
 @Post('remediations/:id/:status') updateRemediation(@Param('id') id:string,@Param('status') status:string,@Body() body:any,@Req() req:any){return this.service.updateRemediation(id,status,body,req.user);}
}
