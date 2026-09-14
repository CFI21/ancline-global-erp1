import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private s:DocumentsService){}
  @Get() list(@Req() req:any){return this.s.list(req.user);}
  @Get(':id') get(@Param('id') id:string,@Req() req:any){return this.s.get(id,req.user);}
  @Post() create(@Body() b:any,@Req() req:any){return this.s.create(b,req.user);}
  @Patch(':id') update(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.update(id,b,req.user);}
  @Post(':id/submit-review') submit(@Param('id') id:string,@Req() req:any){return this.s.submitForReview(id,req.user);}
  @Post(':id/approve') approve(@Param('id') id:string,@Req() req:any){return this.s.approve(id,req.user);}
  @Post(':id/reject') reject(@Param('id') id:string,@Body() b:any,@Req() req:any){return this.s.reject(id,b,req.user);}
  @Post(':id/amend') amend(@Param('id') id:string,@Req() req:any){return this.s.amend(id,req.user);}
  @Post(':id/release') release(@Param('id') id:string,@Req() req:any){return this.s.release(id,req.user);}
}
