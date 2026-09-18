import { Module } from '@nestjs/common';
import { BulkOperationsController } from './bulk-operations.controller';
import { BulkOperationsService } from './bulk-operations.service';

@Module({controllers:[BulkOperationsController],providers:[BulkOperationsService]})
export class BulkOperationsModule {}
