import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceClosePackService } from './finance-close-pack.service';

@UseGuards(JwtAuthGuard)
@Controller('finance-close-pack')
export class FinanceClosePackController {
  constructor(private service:FinanceClosePackService){}
  @Get('dashboard/:period') dashboard(@Param('period') period:string,@Req() req:any){return this.service.dashboard(period,req.user);}
  @Get('reconciliations/:period') reconciliations(@Param('period') period:string,@Req() req:any){return this.service.reconciliations(period,req.user);}
  @Post('reconciliations/:entityId/:period') reconcile(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.setReconciliation(entityId,period,body,req.user);}
  @Get('suspense/:period') suspense(@Param('period') period:string,@Req() req:any){return this.service.suspense(period,req.user);}
  @Post('suspense/:period/:itemId/resolve') resolveSuspense(@Param('period') period:string,@Param('itemId') itemId:string,@Body() body:any,@Req() req:any){return this.service.resolveSuspense(period,itemId,body,req.user);}
  @Get('signoffs/:period') signoffs(@Param('period') period:string,@Req() req:any){return this.service.signoffs(period,req.user);}
  @Post('signoffs/:entityId/:period/request') requestSignoff(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.requestSignoff(entityId,period,body,req.user);}
  @Post('signoffs/:entityId/:period/approve') approveSignoff(@Param('entityId') entityId:string,@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.approveSignoff(entityId,period,body,req.user);}
  @Post('group-certification/:period/request') requestGroup(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.requestGroupCertification(period,body,req.user);}
  @Post('group-certification/:period/approve') approveGroup(@Param('period') period:string,@Body() body:any,@Req() req:any){return this.service.approveGroupCertification(period,body,req.user);}
}
