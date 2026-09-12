import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private s:StorageService){}
  @Post('upload-url') upload(@Body() body:any){return this.s.createUpload(body);}
}
