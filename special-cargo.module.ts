import { Module } from '@nestjs/common';
import { SpecialCargoController } from './special-cargo.controller';
import { SpecialCargoService } from './special-cargo.service';
@Module({controllers:[SpecialCargoController],providers:[SpecialCargoService]})
export class SpecialCargoModule {}
