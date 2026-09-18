import { Module } from '@nestjs/common';
import { BulkDataController } from './bulk-data.controller';
import { BulkDataService } from './bulk-data.service';

@Module({controllers:[BulkDataController],providers:[BulkDataService]})
export class BulkDataModule {}
