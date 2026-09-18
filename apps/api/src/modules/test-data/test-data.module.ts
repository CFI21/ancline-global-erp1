import { Module } from '@nestjs/common';
import { TestDataController } from './test-data.controller';
import { TestDataService } from './test-data.service';

@Module({controllers:[TestDataController],providers:[TestDataService]})
export class TestDataModule {}
