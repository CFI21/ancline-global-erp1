import { Controller, Get } from '@nestjs/common';
import { OidcService } from './oidc.service';

@Controller('auth/oidc')
export class OidcController {
  constructor(private s:OidcService){}
  @Get('configuration') config(){return this.s.configuration();}
  @Get('validate') validate(){return this.s.validateConfiguration();}
}
