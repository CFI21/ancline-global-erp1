import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post('register-customer')
  registerCustomer(@Body() body:any){ return this.service.registerCustomer(body); }

  @Get('registration/:registrationRef')
  registrationStatus(@Param('registrationRef') registrationRef:string){ return this.service.registrationStatus(registrationRef); }

  @Get('kyc/queue')
  @UseGuards(JwtAuthGuard)
  kycQueue(@Req() req:any){ return this.service.kycQueue(req.user); }

  @Post(':id/kyc/review')
  @UseGuards(JwtAuthGuard)
  reviewKyc(@Param('id') id:string,@Req() req:any){ return this.service.setKycReview(id,req.user); }

  @Post(':id/kyc/approve')
  @UseGuards(JwtAuthGuard)
  approveKyc(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.approveKyc(id,body,req.user); }

  @Post(':id/kyc/reject')
  @UseGuards(JwtAuthGuard)
  rejectKyc(@Param('id') id:string,@Body() body:any,@Req() req:any){ return this.service.rejectKyc(id,body,req.user); }

  @Get() list(){ return this.service.list(); }
  @Get(':id') get(@Param('id') id:string){ return this.service.get(id); }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body:any,@Req() req:any){ return this.service.create(body,req.user); }
}
