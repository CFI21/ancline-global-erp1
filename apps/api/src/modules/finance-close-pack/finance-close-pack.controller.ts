import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceClosePackService } from './finance-close-pack.service';

@UseGuards(JwtAuthGuard)
@Controller('finance-close-pack')
export class FinanceClosePackController {
  constructor(private service:FinanceClosePackService){}
  @Get('dashboard/:period') dashboard(@Param('period') period:string,@Req() req:any){return this.service.dashboard(period,req.user);}
  @Get('entity/:entityId/:period') entity(@Param('entityId') entityId:string,@Param('period') period:string,@Req() req:any){return this.service.entityPack(entityId,period,req.user);}
  @Post('reconciliations/:entityId/:period') reconcile(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.setReconciliation(entityId,period,body,req.user);}
  @Post('suspense/:entityId/:period/resolve') resolveSuspense(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.resolveSuspense(entityId,period,body,req.user);}
  @Post('entity/:entityId/:period/request-signoff') requestSignoff(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.requestEntitySignoff(entityId,period,body,req.user);}
  @Post('entity/:entityId/:period/approve-signoff') approveSignoff(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.approveEntitySignoff(entityId,period,body,req.user);}
  @Post('group/:period/request-certification') requestGroup(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.requestGroupCertification(period,body,req.user);}
  @Post('group/:period/approve-certification') approveGroup(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.approveGroupCertification(period,body,req.user);}
}
