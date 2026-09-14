import { Module } from '@nestjs/common';
import { ContainerMovementsController } from './container-movements.controller';
import { ContainerMovementsService } from './container-movements.service';

@Module({controllers:[ContainerMovementsController],providers:[ContainerMovementsService]})
export class ContainerMovementsModule {}
