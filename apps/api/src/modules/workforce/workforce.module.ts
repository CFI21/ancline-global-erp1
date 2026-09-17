import { Module } from '@nestjs/common';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';
@Module({controllers:[WorkforceController],providers:[WorkforceService]})
export class WorkforceModule {}
