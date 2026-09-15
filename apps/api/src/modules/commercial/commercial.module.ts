import { Module } from '@nestjs/common';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';

@Module({controllers:[CommercialController],providers:[CommercialService]})
export class CommercialModule {}
